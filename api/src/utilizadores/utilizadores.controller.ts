import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';

class CriarUtilizadorDto {
  @IsString() @IsNotEmpty() nome: string;
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,30}$/, { message: 'Utilizador: 3 a 30 letras, números, ponto ou hífen.' }) username: string;
  @IsString() @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }) senha: string;
  @IsEnum(Role) role: Role;
}

class EditarUtilizadorDto {
  @IsOptional() @IsString() @IsNotEmpty() nome?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }) senha?: string;
}

const select = { id: true, nome: true, username: true, role: true, activo: true, criadoEm: true };

@Roles('ADMIN')
@Controller('utilizadores')
export class UtilizadoresController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async listar() {
    const data = await this.prisma.utilizador.findMany({ select, orderBy: { nome: 'asc' } });
    return { data, total: data.length };
  }

  @Post()
  async criar(@Body() dto: CriarUtilizadorDto) {
    return this.prisma.utilizador.create({
      data: { nome: dto.nome, username: dto.username.toLowerCase(), role: dto.role, senhaHash: await bcrypt.hash(dto.senha, 10) },
      select,
    });
  }

  @Patch(':id')
  async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarUtilizadorDto, @CurrentUser() user: SessionUser) {
    if (id === user.id && (dto.activo === false || (dto.role && dto.role !== 'ADMIN'))) {
      throw new BadRequestException('Não pode desactivar nem retirar o perfil de administrador à sua própria conta.');
    }
    const { senha, ...resto } = dto;
    return this.prisma.utilizador.update({
      where: { id },
      data: { ...resto, ...(senha ? { senhaHash: await bcrypt.hash(senha, 10) } : {}) },
      select,
    });
  }

  @Delete(':id')
  async remover(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    if (id === user.id) throw new BadRequestException('Não pode remover a sua própria conta.');
    const usado = await this.prisma.pagamento.count({ where: { OR: [{ utilizadorId: id }, { anuladoPorId: id }] } });
    if (usado) {
      await this.prisma.utilizador.update({ where: { id }, data: { activo: false } });
      return { ok: true, desactivado: true };
    }
    await this.prisma.auditLog.updateMany({ where: { utilizadorId: id }, data: { utilizadorId: null } });
    await this.prisma.utilizador.delete({ where: { id } });
    return { ok: true };
  }
}
