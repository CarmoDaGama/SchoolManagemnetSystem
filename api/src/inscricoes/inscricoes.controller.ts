import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Sentido, TipoInscricao } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength, ValidateNested,
} from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { InscricoesService } from './inscricoes.service';

const MES = /^\d{4}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class InscricaoDto {
  @Type(() => Number) @IsInt() rotaId: number;
  @IsOptional() @IsEnum(TipoInscricao) tipo?: TipoInscricao;
  @IsOptional() @IsEnum(Sentido) sentido?: Sentido;
  @IsOptional() @IsString() pontoRecolha?: string | null;
  @IsOptional() @Matches(HORA, { message: 'Hora de recolha no formato HH:mm.' }) horaRecolha?: string | null;
  @IsOptional() @Matches(MES, { message: 'Mês de entrada no formato AAAA-MM.' }) mesEntrada?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valorMensal?: number | null;
  @IsOptional() @IsString() motivoValor?: string | null;
  @IsOptional() @IsBoolean() forcarLotacao?: boolean;
}

class CriarInscricaoDto extends InscricaoDto {
  @Type(() => Number) @IsInt() alunoId: number;
}

class EditarInscricaoDto {
  @IsOptional() @Type(() => Number) @IsInt() rotaId?: number;
  @IsOptional() @IsEnum(Sentido) sentido?: Sentido;
  @IsOptional() @IsString() pontoRecolha?: string | null;
  @IsOptional() @Matches(HORA, { message: 'Hora de recolha no formato HH:mm.' }) horaRecolha?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valorMensal?: number | null;
  @IsOptional() @IsBoolean() removerValorEspecial?: boolean;
  @IsOptional() @IsString() motivoValor?: string | null;
  @IsOptional() @Matches(MES, { message: 'Mês no formato AAAA-MM.' }) aplicarAPartirDe?: string | null;
  @IsOptional() @IsBoolean() forcarLotacao?: boolean;
}

class ConfirmarItemDto {
  @Type(() => Number) @IsInt() alunoId: number;
  @Type(() => Number) @IsInt() rotaId: number;
  @IsOptional() @Matches(MES) mesEntrada?: string | null;
}

class ConfirmarLoteDto {
  @IsArray() @ArrayNotEmpty({ message: 'Seleccione pelo menos um aluno.' }) @ValidateNested({ each: true }) @Type(() => ConfirmarItemDto)
  itens: ConfirmarItemDto[];
}

class MesMotivoDto {
  @Matches(MES, { message: 'Mês no formato AAAA-MM.' }) mes: string;
  @IsString() @IsNotEmpty() @MinLength(3, { message: 'Indique o motivo.' }) motivo: string;
}

class ReactivarDto {
  @Matches(MES, { message: 'Mês no formato AAAA-MM.' }) mes: string;
  @IsOptional() @IsBoolean() forcarLotacao?: boolean;
}

class MesDto {
  @Matches(MES, { message: 'Mês no formato AAAA-MM.' }) mes: string;
}

@Controller('inscricoes')
export class InscricoesController {
  constructor(private service: InscricoesService) {}

  @Post()
  criar(@Body() dto: CriarInscricaoDto, @CurrentUser() user: SessionUser) {
    return this.service.criar(dto, user);
  }

  @Get('por-confirmar')
  porConfirmar() {
    return this.service.porConfirmar();
  }

  @Post('confirmar-lote')
  @HttpCode(200)
  confirmarLote(@Body() dto: ConfirmarLoteDto, @CurrentUser() user: SessionUser) {
    return this.service.confirmarLote(dto.itens, user);
  }

  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarInscricaoDto, @CurrentUser() user: SessionUser) {
    return this.service.editar(id, dto, user);
  }

  @Roles('ADMIN')
  @Post(':id/suspender')
  @HttpCode(200)
  suspender(@Param('id', ParseIntPipe) id: number, @Body() dto: MesMotivoDto, @CurrentUser() user: SessionUser) {
    return this.service.suspender(id, 'SUSPENSA', dto.mes, dto.motivo.trim(), user.id);
  }

  @Roles('ADMIN')
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id', ParseIntPipe) id: number, @Body() dto: MesMotivoDto, @CurrentUser() user: SessionUser) {
    return this.service.suspender(id, 'CANCELADA', dto.mes, dto.motivo.trim(), user.id);
  }

  @Roles('ADMIN')
  @Post(':id/reactivar')
  @HttpCode(200)
  reactivar(@Param('id', ParseIntPipe) id: number, @Body() dto: ReactivarDto, @CurrentUser() user: SessionUser) {
    return this.service.reactivar(id, dto.mes, user, dto.forcarLotacao);
  }

  @Roles('ADMIN')
  @Post(':id/meses')
  @HttpCode(200)
  acrescentarMes(@Param('id', ParseIntPipe) id: number, @Body() dto: MesDto, @CurrentUser() user: SessionUser) {
    return this.service.acrescentarMes(id, dto.mes, user.id);
  }
}
