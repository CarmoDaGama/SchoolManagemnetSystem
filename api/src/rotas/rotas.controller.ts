import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Turno } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { chaveMes, estadoVisivel, hojeUTC, inicioMes, nomeMes, parseMes } from '../cobrancas/calculo';

class RotaDto {
  @IsString() @IsNotEmpty({ message: 'Indique o código da rota.' }) codigo: string;
  @IsString() @IsNotEmpty({ message: 'Indique o nome da rota.' }) nome: string;
  @IsEnum(Turno) turno: Turno;
  @IsOptional() @IsString() motorista?: string | null;
  @IsOptional() @IsString() telefoneMotorista?: string | null;
  @IsOptional() @IsString() viatura?: string | null;
  @Type(() => Number) @IsInt() @Min(1) capacidade: number;
  @Type(() => Number) @IsNumber() @Min(0) valorMensal: number;
  @IsOptional() @IsString() paragens?: string | null;
  @IsOptional() @IsBoolean() activa?: boolean;
}

class AplicarValorDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'Indique o mês no formato AAAA-MM.' }) aPartirDe: string;
}

class MesQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) mes?: string;
}

@Controller('rotas')
export class RotasController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async listar() {
    const ano = await this.prisma.anoLectivo.findFirst({ where: { activo: true } });
    const rotas = await this.prisma.rota.findMany({
      orderBy: { codigo: 'asc' },
      include: { _count: { select: { inscricoes: { where: { anoLectivoId: ano?.id ?? -1, estado: 'ACTIVA' } } } } },
    });
    const data = rotas.map(({ _count, ...r }) => ({ ...r, ocupacao: _count.inscricoes }));
    return { data, total: data.length };
  }

  @Get(':id')
  obter(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.rota.findUniqueOrThrow({ where: { id } });
  }

  /** Lista para o motorista: inscrições activas no ano activo, por hora de recolha, com a situação do mês. */
  @Get(':id/alunos')
  async alunos(@Param('id', ParseIntPipe) id: number, @Query() q: MesQuery) {
    const [rota, ano, empresa] = await Promise.all([
      this.prisma.rota.findUniqueOrThrow({ where: { id } }),
      this.prisma.anoLectivo.findFirst({ where: { activo: true } }),
      this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    const mes = q.mes ? parseMes(q.mes) : inicioMes(hojeUTC());
    const hoje = hojeUTC();
    const inscricoes = await this.prisma.inscricao.findMany({
      where: { rotaId: id, anoLectivoId: ano?.id ?? -1, estado: 'ACTIVA' },
      include: {
        aluno: { include: { encarregado: true } },
        cobrancas: { where: { tipo: 'MENSALIDADE', referencia: mes } },
      },
    });
    inscricoes.sort((a, b) => (a.horaRecolha ?? '99:99').localeCompare(b.horaRecolha ?? '99:99') || a.aluno.nome.localeCompare(b.aluno.nome, 'pt'));
    const data = inscricoes.map(({ cobrancas, ...i }) => ({
      ...i,
      situacaoMes: cobrancas[0] ? estadoVisivel(cobrancas[0], empresa, hoje) : null,
    }));
    return { rota, anoLectivo: ano, mes: { chave: chaveMes(mes), nome: nomeMes(mes) }, data, total: data.length };
  }

  @Roles('ADMIN')
  @Post()
  criar(@Body() dto: RotaDto) {
    return this.prisma.rota.create({ data: { ...dto, codigo: dto.codigo.trim().toUpperCase() } });
  }

  @Roles('ADMIN')
  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() dto: RotaDto) {
    return this.prisma.rota.update({ where: { id }, data: { ...dto, codigo: dto.codigo.trim().toUpperCase() } });
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remover(@Param('id', ParseIntPipe) id: number) {
    const uso = await this.prisma.inscricao.count({ where: { rotaId: id } });
    if (uso) throw new BadRequestException('A rota tem inscrições e não pode ser removida. Marque-a como inactiva.');
    await this.prisma.rota.delete({ where: { id } });
    return { ok: true };
  }

  /** Aplica o valor actual da rota às mensalidades pendentes (a partir do mês) de alunos sem valor especial. */
  @Roles('ADMIN')
  @Post(':id/aplicar-valor')
  @HttpCode(200)
  async aplicarValor(@Param('id', ParseIntPipe) id: number, @Body() dto: AplicarValorDto, @CurrentUser() user: SessionUser) {
    const rota = await this.prisma.rota.findUniqueOrThrow({ where: { id } });
    const desde = parseMes(dto.aPartirDe);
    return this.prisma.$transaction(async (tx) => {
      const inscricoes = await tx.inscricao.findMany({
        where: { rotaId: id, valorEspecial: false, anoLectivo: { activo: true } },
        select: { id: true },
      });
      const ids = inscricoes.map((i) => i.id);
      await tx.inscricao.updateMany({ where: { id: { in: ids } }, data: { valorMensal: rota.valorMensal } });
      const r = await tx.cobranca.updateMany({
        where: { inscricaoId: { in: ids }, tipo: 'MENSALIDADE', estado: 'PENDENTE', referencia: { gte: desde } },
        data: { valor: rota.valorMensal },
      });
      await this.prisma.audit(tx, user.id, 'VALOR_ROTA_APLICADO', 'Rota', id, { valorMensal: rota.valorMensal, aPartirDe: dto.aPartirDe, mensalidades: r.count });
      return { inscricoes: ids.length, mensalidades: r.count };
    });
  }
}
