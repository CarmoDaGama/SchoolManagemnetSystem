import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth.decorators';
import { chaveMes, mesesDoAno, nomeMes } from '../cobrancas/calculo';

class AnoLectivoDto {
  @IsString() @IsNotEmpty() nome: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) anoInicio: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) mesInicio: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) mesesServico: number;
}

class EditarAnoLectivoDto {
  @IsOptional() @IsString() @IsNotEmpty() nome?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) anoInicio?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) mesInicio?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) mesesServico?: number;
}

const comMeses = <T extends { anoInicio: number; mesInicio: number; mesesServico: number }>(a: T) => ({
  ...a,
  meses: mesesDoAno(a).map((m) => ({ chave: chaveMes(m), nome: nomeMes(m) })),
});

@Controller('anos-lectivos')
export class AnosLectivosController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async listar() {
    const anos = await this.prisma.anoLectivo.findMany({
      orderBy: { anoInicio: 'desc' },
      include: { _count: { select: { inscricoes: true } } },
    });
    const data = anos.map(comMeses);
    return { data, total: data.length };
  }

  @Get('activo')
  async activo() {
    const a = await this.prisma.anoLectivo.findFirst({ where: { activo: true } });
    return a ? comMeses(a) : null;
  }

  @Roles('ADMIN')
  @Post()
  async criar(@Body() dto: AnoLectivoDto) {
    const existeActivo = await this.prisma.anoLectivo.count({ where: { activo: true } });
    return this.prisma.anoLectivo.create({ data: { ...dto, activo: existeActivo === 0 } });
  }

  @Roles('ADMIN')
  @Patch(':id')
  async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarAnoLectivoDto) {
    const uso = await this.prisma.inscricao.count({ where: { anoLectivoId: id } });
    if (uso && (dto.anoInicio !== undefined || dto.mesInicio !== undefined || dto.mesesServico !== undefined)) {
      const a = await this.prisma.anoLectivo.findUniqueOrThrow({ where: { id } });
      if ((dto.anoInicio ?? a.anoInicio) !== a.anoInicio || (dto.mesInicio ?? a.mesInicio) !== a.mesInicio || (dto.mesesServico ?? a.mesesServico) !== a.mesesServico) {
        throw new BadRequestException('Este ano já tem inscrições: os meses cobrados já não podem ser alterados. Use as acções por mês no mapa mensal.');
      }
    }
    return this.prisma.anoLectivo.update({ where: { id }, data: dto });
  }

  @Roles('ADMIN')
  @Post(':id/activar')
  @HttpCode(200)
  async activar(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.anoLectivo.findUniqueOrThrow({ where: { id } });
    await this.prisma.$transaction([
      this.prisma.anoLectivo.updateMany({ data: { activo: false } }),
      this.prisma.anoLectivo.update({ where: { id }, data: { activo: true } }),
    ]);
    return { ok: true };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remover(@Param('id', ParseIntPipe) id: number) {
    const uso = await this.prisma.inscricao.count({ where: { anoLectivoId: id } });
    if (uso) throw new BadRequestException('Este ano lectivo já tem inscrições e não pode ser removido.');
    await this.prisma.anoLectivo.delete({ where: { id } });
    return { ok: true };
  }
}
