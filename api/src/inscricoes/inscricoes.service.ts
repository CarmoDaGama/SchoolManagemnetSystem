import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoInscricao, Prisma, Role, Sentido, TipoInscricao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  hojeUTC, inicioMes, mesesDoAno, mesNoAno, nomeMes, parseMes, planoCobrancas, vencimento,
} from '../cobrancas/calculo';

type Tx = Prisma.TransactionClient;
type Utilizador = { id: number; role: Role };

export type CriarInscricao = {
  alunoId: number;
  rotaId: number;
  tipo?: TipoInscricao;
  sentido?: Sentido;
  pontoRecolha?: string | null;
  horaRecolha?: string | null;
  mesEntrada?: string | null; // "2026-10"
  valorMensal?: number | null; // valor especial
  motivoValor?: string | null;
  forcarLotacao?: boolean;
};

export type EditarInscricao = {
  rotaId?: number;
  sentido?: Sentido;
  pontoRecolha?: string | null;
  horaRecolha?: string | null;
  valorMensal?: number | null; // define valor especial
  removerValorEspecial?: boolean;
  motivoValor?: string | null;
  aplicarAPartirDe?: string | null; // mês a partir do qual o novo valor se aplica às pendentes
  forcarLotacao?: boolean;
};

@Injectable()
export class InscricoesService {
  constructor(private prisma: PrismaService) {}

  /** Inscrição ou confirmação com as cobranças do ano, numa transacção (a do chamador, se existir). */
  async criar(dto: CriarInscricao, user: Utilizador, txExterna?: Tx) {
    const especial = dto.valorMensal !== null && dto.valorMensal !== undefined;
    if (especial && user.role !== 'ADMIN') throw new ForbiddenException('Só o administrador define valores especiais.');
    if (especial && !dto.motivoValor?.trim()) throw new BadRequestException('Indique o motivo do valor especial.');
    const executar = async (tx: Tx) => {
      const [empresa, ano, rota] = await Promise.all([
        tx.empresa.findUniqueOrThrow({ where: { id: 1 } }),
        tx.anoLectivo.findFirst({ where: { activo: true } }),
        tx.rota.findUnique({ where: { id: dto.rotaId } }),
      ]);
      if (!ano) throw new BadRequestException('Não há ano lectivo activo. Crie-o em Configuração › Anos lectivos.');
      if (!rota) throw new NotFoundException('Rota não encontrada.');
      if (!rota.activa) throw new BadRequestException(`A rota ${rota.codigo} está inactiva.`);

      const existente = await tx.inscricao.findUnique({ where: { alunoId_anoLectivoId: { alunoId: dto.alunoId, anoLectivoId: ano.id } } });
      if (existente) throw new ConflictException(`O aluno já está inscrito em ${ano.nome}.`);

      await this.validarLotacao(tx, rota, ano.id, user, dto.forcarLotacao);

      const valor = especial ? new Prisma.Decimal(dto.valorMensal!) : rota.valorMensal;

      const meses = mesesDoAno(ano);
      let mesEntrada = dto.mesEntrada ? parseMes(dto.mesEntrada) : inicioMes(hojeUTC());
      if (mesEntrada < meses[0]) mesEntrada = meses[0];
      if (mesEntrada > meses[meses.length - 1]) {
        throw new BadRequestException(`O mês de entrada está fora do ano lectivo ${ano.nome}.`);
      }
      const tipo = dto.tipo ?? 'NOVA';

      const inscricao = await tx.inscricao.create({
        data: {
          alunoId: dto.alunoId, anoLectivoId: ano.id, rotaId: rota.id, tipo,
          sentido: dto.sentido ?? 'IDA_E_VOLTA', pontoRecolha: dto.pontoRecolha || null, horaRecolha: dto.horaRecolha || null,
          mesEntrada, valorMensal: valor, valorEspecial: especial, motivoValor: especial ? dto.motivoValor!.trim() : null,
          cobrancas: { create: planoCobrancas(ano, empresa, mesEntrada, valor, tipo) },
        },
      });
      await this.prisma.audit(tx, user.id, tipo === 'CONFIRMACAO' ? 'INSCRICAO_CONFIRMADA' : 'INSCRICAO_CRIADA', 'Inscricao', inscricao.id, {
        rotaId: rota.id, valor, especial,
      });
      return inscricao;
    };
    return txExterna ? executar(txExterna) : this.prisma.$transaction(executar);
  }

  /** Inscritos no ano anterior (activos ou suspensos) ainda sem inscrição no ano activo. */
  async porConfirmar() {
    const activo = await this.prisma.anoLectivo.findFirst({ where: { activo: true } });
    if (!activo) return { anoActivo: null, anoAnterior: null, data: [], total: 0 };
    const anterior = await this.prisma.anoLectivo.findFirst({
      where: { anoInicio: { lt: activo.anoInicio } },
      orderBy: { anoInicio: 'desc' },
    });
    if (!anterior) return { anoActivo: activo, anoAnterior: null, data: [], total: 0 };
    const data = await this.prisma.inscricao.findMany({
      where: {
        anoLectivoId: anterior.id,
        estado: { in: ['ACTIVA', 'SUSPENSA'] },
        aluno: { inscricoes: { none: { anoLectivoId: activo.id } } },
      },
      include: { aluno: { include: { encarregado: true } }, rota: true },
      orderBy: [{ rota: { codigo: 'asc' } }, { aluno: { nome: 'asc' } }],
    });
    return { anoActivo: activo, anoAnterior: anterior, data, total: data.length };
  }

  /** Cada aluno na sua transacção; devolve o resultado por aluno. */
  async confirmarLote(itens: { alunoId: number; rotaId: number; mesEntrada?: string | null }[], user: Utilizador) {
    const activo = await this.prisma.anoLectivo.findFirst({ where: { activo: true } });
    if (!activo) throw new BadRequestException('Não há ano lectivo activo.');
    const resultados: { alunoId: number; ok: boolean; mensagem: string }[] = [];
    for (const item of itens) {
      try {
        const anterior = await this.prisma.inscricao.findFirst({
          where: { alunoId: item.alunoId, anoLectivo: { anoInicio: { lt: activo.anoInicio } } },
          orderBy: { anoLectivo: { anoInicio: 'desc' } },
        });
        // valor especial já aprovado mantém-se se a rota não mudar
        const manterEspecial = !!anterior?.valorEspecial && anterior.rotaId === item.rotaId;
        await this.criar(
          {
            alunoId: item.alunoId, rotaId: item.rotaId, tipo: 'CONFIRMACAO',
            sentido: anterior?.sentido, pontoRecolha: anterior?.pontoRecolha, horaRecolha: anterior?.horaRecolha,
            mesEntrada: item.mesEntrada ?? null,
            valorMensal: manterEspecial ? Number(anterior!.valorMensal) : null,
            motivoValor: manterEspecial ? anterior!.motivoValor : null,
          },
          manterEspecial ? { ...user, role: 'ADMIN' } : user,
        );
        resultados.push({ alunoId: item.alunoId, ok: true, mensagem: 'Confirmado' });
      } catch (e) {
        resultados.push({ alunoId: item.alunoId, ok: false, mensagem: (e as Error).message });
      }
    }
    return { confirmados: resultados.filter((r) => r.ok).length, falhados: resultados.filter((r) => !r.ok).length, resultados };
  }

  async editar(id: number, dto: EditarInscricao, user: Utilizador) {
    const mudaValor = (dto.valorMensal !== null && dto.valorMensal !== undefined) || dto.removerValorEspecial;
    if (mudaValor && user.role !== 'ADMIN') throw new ForbiddenException('Só o administrador altera valores.');

    return this.prisma.$transaction(async (tx) => {
      const insc = await tx.inscricao.findUniqueOrThrow({ where: { id }, include: { rota: true, anoLectivo: true } });
      const data: Prisma.InscricaoUpdateInput = {
        sentido: dto.sentido, pontoRecolha: dto.pontoRecolha, horaRecolha: dto.horaRecolha,
      };
      let novoValor: Prisma.Decimal | null = null;
      let rota = insc.rota;

      if (dto.rotaId && dto.rotaId !== insc.rotaId) {
        rota = await tx.rota.findUniqueOrThrow({ where: { id: dto.rotaId } });
        if (!rota.activa) throw new BadRequestException(`A rota ${rota.codigo} está inactiva.`);
        if (insc.estado === 'ACTIVA') await this.validarLotacao(tx, rota, insc.anoLectivoId, user, dto.forcarLotacao);
        data.rota = { connect: { id: rota.id } };
        if (!insc.valorEspecial && !rota.valorMensal.equals(insc.valorMensal) && dto.aplicarAPartirDe) novoValor = rota.valorMensal;
      }
      if (dto.valorMensal !== null && dto.valorMensal !== undefined) {
        if (!dto.motivoValor?.trim()) throw new BadRequestException('Indique o motivo do valor especial.');
        novoValor = new Prisma.Decimal(dto.valorMensal);
        data.valorEspecial = true;
        data.motivoValor = dto.motivoValor.trim();
      } else if (dto.removerValorEspecial) {
        novoValor = rota.valorMensal;
        data.valorEspecial = false;
        data.motivoValor = null;
      }

      let actualizadas = 0;
      if (novoValor) {
        data.valorMensal = novoValor;
        const desde = dto.aplicarAPartirDe ? parseMes(dto.aplicarAPartirDe) : inicioMes(hojeUTC());
        const r = await tx.cobranca.updateMany({
          where: { inscricaoId: id, tipo: 'MENSALIDADE', estado: { in: ['PENDENTE', 'ANULADA'] }, referencia: { gte: desde } },
          data: { valor: novoValor },
        });
        actualizadas = r.count;
      }
      const r = await tx.inscricao.update({ where: { id }, data });
      await this.prisma.audit(tx, user.id, 'INSCRICAO_ALTERADA', 'Inscricao', id, {
        de: { rotaId: insc.rotaId, valorMensal: insc.valorMensal, valorEspecial: insc.valorEspecial },
        para: dto, mensalidadesActualizadas: actualizadas,
      });
      return { ...r, mensalidadesActualizadas: actualizadas };
    });
  }

  /** SUSPENSA ou CANCELADA: mensalidades pendentes a partir do mês passam a ANULADA. Nada pago muda. */
  async suspender(id: number, estado: Extract<EstadoInscricao, 'SUSPENSA' | 'CANCELADA'>, mes: string, motivo: string, userId: number) {
    const desde = parseMes(mes);
    return this.prisma.$transaction(async (tx) => {
      const insc = await tx.inscricao.findUniqueOrThrow({ where: { id } });
      if (insc.estado === estado) throw new BadRequestException('A inscrição já está nesse estado.');
      const r = await tx.cobranca.updateMany({
        where: { inscricaoId: id, tipo: 'MENSALIDADE', estado: 'PENDENTE', referencia: { gte: desde } },
        data: { estado: 'ANULADA', motivo },
      });
      await tx.inscricao.update({ where: { id }, data: { estado } });
      await this.prisma.audit(tx, userId, estado === 'SUSPENSA' ? 'INSCRICAO_SUSPENSA' : 'INSCRICAO_CANCELADA', 'Inscricao', id, { mes, motivo, mesesAnulados: r.count });
      return { ok: true, mesesAnulados: r.count };
    });
  }

  /** Volta a ACTIVA: reabre os meses ANULADA a partir do mês (o índice único impede recriá-los) e cria os que faltam. */
  async reactivar(id: number, mes: string, user: Utilizador, forcarLotacao?: boolean) {
    const desde = parseMes(mes);
    return this.prisma.$transaction(async (tx) => {
      const insc = await tx.inscricao.findUniqueOrThrow({ where: { id }, include: { rota: true, anoLectivo: true } });
      if (insc.estado === 'ACTIVA') throw new BadRequestException('A inscrição já está activa.');
      await this.validarLotacao(tx, insc.rota, insc.anoLectivoId, user, forcarLotacao);
      let reabertos = 0;
      for (const ref of mesesDoAno(insc.anoLectivo).filter((m) => m >= desde)) {
        reabertos += await this.abrirMes(tx, insc, ref);
      }
      await tx.inscricao.update({ where: { id }, data: { estado: 'ACTIVA' } });
      await this.prisma.audit(tx, user.id, 'INSCRICAO_REACTIVADA', 'Inscricao', id, { mes, meses: reabertos });
      return { ok: true, meses: reabertos };
    });
  }

  /** Acrescentar um mês em falta (reabre se estiver ANULADA). */
  async acrescentarMes(id: number, mes: string, userId: number) {
    const ref = parseMes(mes);
    return this.prisma.$transaction(async (tx) => {
      const insc = await tx.inscricao.findUniqueOrThrow({ where: { id }, include: { anoLectivo: true } });
      if (!mesNoAno(ref, insc.anoLectivo)) throw new BadRequestException(`${nomeMes(ref)} não faz parte do ano lectivo ${insc.anoLectivo.nome}.`);
      const n = await this.abrirMes(tx, insc, ref);
      if (!n) throw new BadRequestException(`${nomeMes(ref)} já está registado para este aluno.`);
      await this.prisma.audit(tx, userId, 'MES_ACRESCENTADO', 'Inscricao', id, { mes });
      return { ok: true };
    });
  }

  private async abrirMes(tx: Tx, insc: { id: number; valorMensal: Prisma.Decimal }, ref: Date): Promise<number> {
    const empresa = await tx.empresa.findUniqueOrThrow({ where: { id: 1 } });
    const existente = await tx.cobranca.findUnique({
      where: { inscricaoId_tipo_referencia: { inscricaoId: insc.id, tipo: 'MENSALIDADE', referencia: ref } },
    });
    if (existente) {
      if (existente.estado !== 'ANULADA') return 0;
      await tx.cobranca.update({ where: { id: existente.id }, data: { estado: 'PENDENTE', motivo: null, valor: insc.valorMensal } });
      return 1;
    }
    await tx.cobranca.create({
      data: {
        inscricaoId: insc.id, tipo: 'MENSALIDADE', descricao: `Mensalidade ${nomeMes(ref)}`,
        referencia: ref, valor: insc.valorMensal, vencimento: vencimento(ref, empresa),
      },
    });
    return 1;
  }

  private async validarLotacao(tx: Tx, rota: { id: number; codigo: string; capacidade: number }, anoLectivoId: number, user: Utilizador, forcar?: boolean) {
    const ocupados = await tx.inscricao.count({ where: { rotaId: rota.id, anoLectivoId, estado: 'ACTIVA' } });
    if (ocupados >= rota.capacidade && !(forcar && user.role === 'ADMIN')) {
      throw new ConflictException(
        `A rota ${rota.codigo} está cheia (${ocupados}/${rota.capacidade}).` + (user.role === 'ADMIN' ? ' Confirme para inscrever acima da lotação.' : ' Só o administrador pode inscrever acima da lotação.'),
      );
    }
  }
}
