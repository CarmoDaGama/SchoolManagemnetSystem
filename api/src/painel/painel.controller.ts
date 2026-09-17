import { Controller, Get } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hojeUTC } from '../cobrancas/calculo';

@Controller('painel')
export class PainelController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async painel() {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const [empresa, ano] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.anoLectivo.findFirst({ where: { activo: true } }),
    ]);
    const anoId = ano?.id ?? -1;
    const limite = hojeUTC();
    limite.setUTCDate(limite.getUTCDate() - empresa.diasTolerancia);
    const atrasoWhere = { estado: 'PENDENTE' as const, vencimento: { lt: limite }, inscricao: { anoLectivoId: anoId } };

    const [activos, recebido, atraso, devedores, rotas, ultimos] = await Promise.all([
      this.prisma.inscricao.count({ where: { anoLectivoId: anoId, estado: 'ACTIVA' } }),
      this.prisma.pagamento.aggregate({ where: { estado: 'VALIDO', data: { gte: inicioMes } }, _sum: { total: true }, _count: true }),
      this.prisma.cobranca.aggregate({ where: atrasoWhere, _sum: { valor: true } }),
      this.prisma.cobranca.groupBy({ by: ['inscricaoId'], where: atrasoWhere }),
      this.prisma.rota.findMany({
        where: { activa: true },
        orderBy: { codigo: 'asc' },
        select: { id: true, codigo: true, nome: true, capacidade: true, _count: { select: { inscricoes: { where: { anoLectivoId: anoId, estado: 'ACTIVA' } } } } },
      }),
      this.prisma.pagamento.findMany({
        take: 10,
        orderBy: { data: 'desc' },
        include: { inscricao: { select: { aluno: { select: { id: true, nome: true } } } }, utilizador: { select: { nome: true } } },
      }),
    ]);
    return {
      anoLectivo: ano,
      alunosActivos: activos,
      recebidoMes: recebido._sum.total ?? new Prisma.Decimal(0),
      pagamentosMes: recebido._count,
      totalEmAtraso: atraso._sum.valor ?? new Prisma.Decimal(0),
      alunosEmAtraso: devedores.length,
      rotas: rotas.map(({ _count, ...r }) => ({ ...r, ocupacao: _count.inscricoes })),
      ultimosPagamentos: ultimos,
    };
  }
}
