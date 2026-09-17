import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { EstadoCobranca } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { chaveMes, estadoVisivel, hojeUTC, mesesDoAno, nomeMes } from './calculo';

class MapaQuery {
  @IsOptional() @Type(() => Number) @IsInt() anoLectivoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() rotaId?: number;
}

class MotivoDto {
  @IsString() @IsNotEmpty() @MinLength(3, { message: 'Indique o motivo.' }) motivo: string;
}

@Controller('cobrancas')
export class CobrancasController {
  constructor(private prisma: PrismaService) {}

  /** Aluno × meses do ano, com o estado visível de cada mês. */
  @Get('mapa')
  async mapa(@Query() q: MapaQuery) {
    const [empresa, ano] = await Promise.all([
      this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } }),
      q.anoLectivoId
        ? this.prisma.anoLectivo.findUnique({ where: { id: q.anoLectivoId } })
        : this.prisma.anoLectivo.findFirst({ where: { activo: true } }),
    ]);
    if (!ano) return { anoLectivo: null, meses: [], linhas: [] };
    const hoje = hojeUTC();
    const inscricoes = await this.prisma.inscricao.findMany({
      where: { anoLectivoId: ano.id, ...(q.rotaId ? { rotaId: q.rotaId } : {}) },
      include: {
        aluno: { select: { id: true, numero: true, nome: true } },
        rota: { select: { id: true, codigo: true } },
        cobrancas: { where: { tipo: 'MENSALIDADE' } },
      },
      orderBy: [{ rota: { codigo: 'asc' } }, { aluno: { nome: 'asc' } }],
    });
    return {
      anoLectivo: ano,
      meses: mesesDoAno(ano).map((m) => ({ chave: chaveMes(m), nome: nomeMes(m) })),
      linhas: inscricoes.map((i) => ({
        inscricaoId: i.id,
        aluno: i.aluno,
        rota: i.rota,
        estadoInscricao: i.estado,
        mesEntrada: chaveMes(i.mesEntrada),
        valorMensal: i.valorMensal,
        meses: Object.fromEntries(
          i.cobrancas.map((c) => [chaveMes(c.referencia), { cobrancaId: c.id, valor: c.valor, estado: estadoVisivel(c, empresa, hoje), motivo: c.motivo }]),
        ),
      })),
    };
  }

  @Roles('ADMIN')
  @Post(':id/isentar')
  @HttpCode(200)
  isentar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() user: SessionUser) {
    return this.mudarEstado(id, 'PENDENTE', 'ISENTA', dto.motivo.trim(), 'MES_ISENTO', user.id);
  }

  @Roles('ADMIN')
  @Post(':id/retirar')
  @HttpCode(200)
  retirar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() user: SessionUser) {
    return this.mudarEstado(id, 'PENDENTE', 'ANULADA', dto.motivo.trim(), 'MES_RETIRADO', user.id);
  }

  /** Desfaz uma isenção ou um mês retirado. */
  @Roles('ADMIN')
  @Post(':id/reabrir')
  @HttpCode(200)
  async reabrir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    const c = await this.prisma.cobranca.findUniqueOrThrow({ where: { id } });
    if (c.estado !== 'ISENTA' && c.estado !== 'ANULADA') throw new BadRequestException('Só meses isentos ou sem serviço podem ser reabertos.');
    return this.mudarEstado(id, c.estado, 'PENDENTE', null, 'MES_REABERTO', user.id);
  }

  private mudarEstado(id: number, de: EstadoCobranca, para: EstadoCobranca, motivo: string | null, accao: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.cobranca.findUniqueOrThrow({ where: { id } });
      if (c.estado !== de) throw new BadRequestException(`${c.descricao} já não está ${de === 'PENDENTE' ? 'por pagar' : 'nesse estado'}.`);
      const r = await tx.cobranca.update({ where: { id }, data: { estado: para, motivo } });
      await this.prisma.audit(tx, userId, accao, 'Cobranca', id, { descricao: c.descricao, de, para, motivo });
      return r;
    });
  }
}
