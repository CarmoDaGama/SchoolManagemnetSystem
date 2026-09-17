import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { TipoMulta } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/auth.decorators';

class EmpresaDto {
  @IsString() @IsNotEmpty({ message: 'Indique o nome da empresa.' }) nome: string;
  @IsOptional() @IsString() nif?: string | null;
  @IsOptional() @IsString() endereco?: string | null;
  @IsOptional() @IsString() telefone?: string | null;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail({}, { message: 'E-mail inválido.' }) email?: string | null;
  @IsOptional() @IsString() @MaxLength(700_000, { message: 'O logótipo é demasiado grande (máx. 500 KB).' }) logotipo?: string | null;
  @IsOptional() @IsString() moeda?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(31) diaLimite: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(60) diasTolerancia: number;
  @IsEnum(TipoMulta) tipoMulta: TipoMulta;
  @Type(() => Number) @IsNumber() @Min(0) multaValor: number;
  @Type(() => Number) @IsNumber() @Min(0) taxaInscricao: number;
  @Type(() => Number) @IsNumber() @Min(0) taxaConfirmacao: number;
}

@Controller('empresa')
export class EmpresaController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('publico')
  async publico() {
    const e = await this.prisma.empresa.findUnique({ where: { id: 1 }, select: { nome: true, logotipo: true } });
    return e ?? { nome: 'Transporte Escolar', logotipo: null };
  }

  @Get()
  empresa() {
    return this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });
  }

  @Roles('ADMIN')
  @Put()
  guardar(@Body() dto: EmpresaDto) {
    if (dto.logotipo && !/^data:image\/(png|jpeg);base64,/.test(dto.logotipo)) throw new BadRequestException('O logótipo deve ser PNG ou JPG.');
    if (dto.tipoMulta === 'PERCENTAGEM' && dto.multaValor > 100) throw new BadRequestException('A multa em percentagem não pode passar de 100%.');
    const data = { ...dto, configurada: true };
    return this.prisma.empresa.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  }
}
