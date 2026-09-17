import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MetodoPagamento, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calcularMulta, estadoVisivel, hojeUTC, nomeMes, parseMes } from '../cobrancas/calculo';

const D = Prisma.Decimal;

export type CriarPagamento = {
  inscricaoId: number;
  cobrancaIds: number[];
  metodo: MetodoPagamento;
  referenciaBanc?: string | null;
  desconto?: number | null;
};

@Injectable()
export class FinanceiroService {
  constructor(private prisma: PrismaService) {}

  async extracto(inscricaoId: number) {
    const [inscricao, empresa] = await Promise.all([
      this.prisma.inscricao.findUniqueOrThrow({
        where: { id: inscricaoId },
        include: {
          aluno: { include: { encarregado: true } },
          rota: true,
          anoLectivo: true,
          cobrancas: { orderBy: [{ referencia: 'asc' }, { tipo: 'asc' }] },
          pagamentos: { orderBy: { data: 'desc' }, include: { utilizador: { select: { nome: true } } } },
        },
      }),
      this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    const hoje = hojeUTC();
    let porPagar = new D(0);
    let emAtraso = new D(0);
    let multaTotal = new D(0);
    const cobrancas = inscricao.cobrancas.map((c) => {
      const estado = estadoVisivel(c, empresa, hoje);
      const multa = c.estado === 'PENDENTE' ? calcularMulta(c, empresa, hoje) : new D(0);
      if (c.estado === 'PENDENTE') porPagar = porPagar.add(c.valor);
      if (estado === 'ATRASO') emAtraso = emAtraso.add(c.valor);
      multaTotal = multaTotal.add(multa);
      return { ...c, estadoVisivel: estado, multa };
    });
    return { ...inscricao, cobrancas, totais: { porPagar, emAtraso, multa: multaTotal } };
  }

  async registar(dto: CriarPagamento, user: { id: number; role: Role }) {
    if (!dto.cobrancaIds.length) throw new BadRequestException('Seleccione pelo menos um mês.');
    if (dto.desconto && dto.desconto > 0 && user.role !== 'ADMIN') throw new ForbiddenException('Só o administrador aplica descontos.');
    if (dto.metodo !== 'NUMERARIO' && !dto.referenciaBanc?.trim()) {
      throw new BadRequestException('Indique a referência do pagamento (TPA, transferência ou Multicaixa).');
    }
    const empresa = await this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });
    const hoje = hojeUTC();

    return this.prisma.$transaction(async (tx) => {
      const cobrancas = await tx.cobranca.findMany({
        where: { id: { in: dto.cobrancaIds }, inscricaoId: dto.inscricaoId, estado: 'PENDENTE' },
        orderBy: [{ referencia: 'asc' }, { tipo: 'asc' }],
      });
      if (cobrancas.length !== dto.cobrancaIds.length) throw new BadRequestException('Um ou mais meses já não estão por pagar. Actualize o extracto.');

      // Correcção ao plano: só mensalidades, e sem buracos até à mais recente seleccionada
      const mensalidades = cobrancas.filter((c) => c.tipo === 'MENSALIDADE');
      if (mensalidades.length) {
        const ultima = mensalidades[mensalidades.length - 1];
        const emFalta = await tx.cobranca.findFirst({
          where: {
            inscricaoId: dto.inscricaoId, tipo: 'MENSALIDADE', estado: 'PENDENTE',
            id: { notIn: dto.cobrancaIds }, referencia: { lt: ultima.referencia },
          },
          orderBy: { referencia: 'asc' },
        });
        if (emFalta) throw new BadRequestException(`Pague primeiro: ${emFalta.descricao}.`);
      }

      const itens = cobrancas.map((c) => ({ cobrancaId: c.id, valor: c.valor, multa: calcularMulta(c, empresa, hoje) }));
      const subtotal = itens.reduce((s, i) => s.add(i.valor), new D(0));
      const multa = itens.reduce((s, i) => s.add(i.multa), new D(0));
      const desconto = new D(dto.desconto ?? 0);
      const total = subtotal.add(multa).sub(desconto);
      if (total.isNegative()) throw new BadRequestException('O desconto não pode ser maior que o total.');

      const ano = new Date().getFullYear();
      const seq = await this.prisma.proximo(tx, `recibo-${ano}`);
      const pagamento = await tx.pagamento.create({
        data: {
          numeroRecibo: `RC ${ano}/${String(seq).padStart(6, '0')}`,
          inscricaoId: dto.inscricaoId, metodo: dto.metodo, referenciaBanc: dto.referenciaBanc?.trim() || null,
          subtotal, multa, desconto, total, utilizadorId: user.id, itens: { create: itens },
        },
      });
      await tx.cobranca.updateMany({ where: { id: { in: dto.cobrancaIds } }, data: { estado: 'PAGA' } });
      if (!desconto.isZero()) await this.prisma.audit(tx, user.id, 'DESCONTO_APLICADO', 'Pagamento', pagamento.id, { desconto, numeroRecibo: pagamento.numeroRecibo });
      return pagamento;
    });
  }

  async anular(id: number, motivo: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.pagamento.findUniqueOrThrow({ where: { id }, include: { itens: true } });
      if (p.estado === 'ANULADO') throw new BadRequestException('Este pagamento já está anulado.');
      await tx.pagamento.update({ where: { id }, data: { estado: 'ANULADO', motivoAnulacao: motivo, anuladoEm: new Date(), anuladoPorId: userId } });
      await tx.cobranca.updateMany({ where: { id: { in: p.itens.map((i) => i.cobrancaId) } }, data: { estado: 'PENDENTE' } });
      await this.prisma.audit(tx, userId, 'PAGAMENTO_ANULADO', 'Pagamento', id, { numeroRecibo: p.numeroRecibo, total: p.total, motivo });
      return { ok: true };
    });
  }

  recibo(id: number) {
    return this.prisma.pagamento.findUniqueOrThrow({
      where: { id },
      include: {
        itens: { include: { cobranca: true }, orderBy: { cobranca: { referencia: 'asc' } } },
        inscricao: { include: { aluno: { include: { encarregado: true } }, rota: true, anoLectivo: true } },
        utilizador: { select: { nome: true } },
        anuladoPor: { select: { nome: true } },
      },
    });
  }

  async listar(de: Date, ate: Date, rotaId?: number) {
    const data = await this.prisma.pagamento.findMany({
      where: { data: { gte: de, lt: ate }, ...(rotaId ? { inscricao: { rotaId } } : {}) },
      orderBy: { data: 'desc' },
      include: {
        inscricao: { select: { aluno: { select: { id: true, nome: true, numero: true } }, rota: { select: { id: true, codigo: true } } } },
        itens: { select: { cobranca: { select: { descricao: true, referencia: true, tipo: true } } } },
        utilizador: { select: { nome: true } },
      },
    });
    const porMetodo: Record<string, Prisma.Decimal> = {};
    const porRota: Record<string, Prisma.Decimal> = {};
    let total = new D(0);
    for (const p of data) {
      if (p.estado !== 'VALIDO') continue;
      porMetodo[p.metodo] = (porMetodo[p.metodo] ?? new D(0)).add(p.total);
      porRota[p.inscricao.rota.codigo] = (porRota[p.inscricao.rota.codigo] ?? new D(0)).add(p.total);
      total = total.add(p.total);
    }
    const linhas = data.map(({ itens, ...p }) => ({
      ...p,
      meses: itens.map((i) => (i.cobranca.tipo === 'MENSALIDADE' ? nomeMes(i.cobranca.referencia) : i.cobranca.descricao)),
    }));
    return { data: linhas, total: linhas.length, resumo: { total, porMetodo, porRota } };
  }

  /** Quem pagou a mensalidade de um mês de referência (independentemente da data do pagamento). */
  async pagos(mes: string, rotaId?: number) {
    const referencia = parseMes(mes);
    const cobrancas = await this.prisma.cobranca.findMany({
      where: { tipo: 'MENSALIDADE', estado: 'PAGA', referencia, ...(rotaId ? { inscricao: { rotaId } } : {}) },
      include: {
        inscricao: { include: { aluno: { select: { id: true, nome: true, numero: true } }, rota: { select: { id: true, codigo: true, nome: true } } } },
        itens: { where: { pagamento: { estado: 'VALIDO' } }, include: { pagamento: { select: { id: true, numeroRecibo: true, data: true, metodo: true } } } },
      },
    });
    const data = cobrancas
      .map((c) => ({
        cobrancaId: c.id, aluno: c.inscricao.aluno, rota: c.inscricao.rota, valor: c.valor,
        pagamento: c.itens[0]?.pagamento ?? null, multa: c.itens[0]?.multa ?? new D(0),
      }))
      .sort((a, b) => a.rota.codigo.localeCompare(b.rota.codigo) || a.aluno.nome.localeCompare(b.aluno.nome, 'pt'));
    const porRota: Record<string, { alunos: number; valor: Prisma.Decimal }> = {};
    let total = new D(0);
    for (const l of data) {
      const r = (porRota[l.rota.codigo] ??= { alunos: 0, valor: new D(0) });
      r.alunos++;
      r.valor = r.valor.add(l.valor);
      total = total.add(l.valor);
    }
    return { mes: { chave: mes, nome: nomeMes(referencia) }, data, total: data.length, resumo: { total, porRota } };
  }

  async devedores(filtro: { rotaId?: number; minMeses?: number }) {
    const [empresa, ano] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.anoLectivo.findFirst({ where: { activo: true } }),
    ]);
    if (!ano) return { data: [], total: 0, resumo: { valor: new D(0), multa: new D(0), total: new D(0) } };
    const hoje = hojeUTC();
    const limite = new Date(hoje);
    limite.setUTCDate(limite.getUTCDate() - empresa.diasTolerancia); // vencidos antes disto
    const pendentes = await this.prisma.cobranca.findMany({
      where: {
        estado: 'PENDENTE', vencimento: { lt: limite },
        inscricao: { anoLectivoId: ano.id, ...(filtro.rotaId ? { rotaId: filtro.rotaId } : {}) },
      },
      include: { inscricao: { include: { rota: true, aluno: { include: { encarregado: true } } } } },
      orderBy: [{ referencia: 'asc' }],
    });

    type Linha = {
      inscricaoId: number; alunoId: number; aluno: string; numero: string; rota: string; estadoInscricao: string;
      encarregado: string | null; telefone: string | null; meses: string[]; valor: Prisma.Decimal; multa: Prisma.Decimal;
    };
    const porInscricao = new Map<number, Linha>();
    for (const c of pendentes) {
      const i = c.inscricao;
      const linha = porInscricao.get(i.id) ?? {
        inscricaoId: i.id, alunoId: i.aluno.id, aluno: i.aluno.nome, numero: i.aluno.numero, rota: i.rota.codigo, estadoInscricao: i.estado,
        encarregado: i.aluno.encarregado?.nome ?? null, telefone: i.aluno.encarregado?.telefone ?? null,
        meses: [], valor: new D(0), multa: new D(0),
      };
      linha.meses.push(c.tipo === 'MENSALIDADE' ? nomeMes(c.referencia) : c.descricao);
      linha.valor = linha.valor.add(c.valor);
      linha.multa = linha.multa.add(calcularMulta(c, empresa, hoje));
      porInscricao.set(i.id, linha);
    }
    const data = [...porInscricao.values()]
      .filter((l) => l.meses.length >= (filtro.minMeses ?? 1))
      .map((l) => ({ ...l, total: l.valor.add(l.multa) }))
      .sort((a, b) => b.total.cmp(a.total));
    const soma = (k: 'valor' | 'multa' | 'total') => data.reduce((s, l) => s.add(l[k]), new D(0));
    return { data, total: data.length, resumo: { valor: soma('valor'), multa: soma('multa'), total: soma('total') } };
  }
}
