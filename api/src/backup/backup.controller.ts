import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from './backup.service';

class ConfigBackupDto {
  @IsBoolean() activo: boolean;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Hora no formato HH:mm.' }) hora: string;
  @IsString() @IsNotEmpty({ message: 'Indique a pasta no computador.' }) pastaLocal: string;
  @IsOptional() @IsString() pastaExterna?: string | null;
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) retencaoDias: number;
}

class PastaDto {
  @IsString() @IsNotEmpty() caminho: string;
}

class RestaurarDto {
  @IsIn(['LOCAL', 'EXTERNA']) local: 'LOCAL' | 'EXTERNA';
  @IsString() @IsNotEmpty() ficheiro: string;
  @IsString() confirmacao: string;
}

@Controller('backup')
export class BackupController {
  constructor(
    private service: BackupService,
    private prisma: PrismaService,
  ) {}

  /** Para o aviso no painel: visível a todos. */
  @Get('estado')
  estado() {
    return this.service.estado();
  }

  @Roles('ADMIN')
  @Get('config')
  config() {
    return this.service.config();
  }

  @Roles('ADMIN')
  @Put('config')
  guardar(@Body() dto: ConfigBackupDto) {
    const data = { ...dto, pastaLocal: dto.pastaLocal.trim(), pastaExterna: dto.pastaExterna?.trim() || null };
    return this.prisma.configBackup.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  }

  @Roles('ADMIN')
  @Post('verificar-pasta')
  @HttpCode(200)
  verificarPasta(@Body() dto: PastaDto) {
    return this.service.verificarPasta(dto.caminho.trim());
  }

  @Roles('ADMIN')
  @Post('agora')
  @HttpCode(200)
  agora(@CurrentUser() user: SessionUser) {
    return this.service.executar('MANUAL', user.id);
  }

  @Roles('ADMIN')
  @Get('historico')
  historico() {
    return this.service.historico();
  }

  @Roles('ADMIN')
  @Get('ficheiros')
  ficheiros() {
    return this.service.ficheiros();
  }

  @Roles('ADMIN')
  @Post('restaurar')
  @HttpCode(200)
  restaurar(@Body() dto: RestaurarDto, @CurrentUser() user: SessionUser) {
    return this.service.restaurar(dto, user.id);
  }
}
