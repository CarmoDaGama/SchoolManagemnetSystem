import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ListQuery, paginar } from '../common/util';

export class EncarregadoDto {
  @IsString() @IsNotEmpty({ message: 'Indique o nome do encarregado.' }) nome: string;
  @IsString() @IsNotEmpty({ message: 'Indique o telefone do encarregado.' }) telefone: string;
  @IsOptional() @IsString() telefoneAlt?: string | null;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail({}, { message: 'E-mail do encarregado inválido.' }) email?: string | null;
  @IsOptional() @IsString() parentesco?: string | null;
  @IsOptional() @IsString() morada?: string | null;
}

@Controller('encarregados')
export class EncarregadosController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async listar(@Query() q: ListQuery) {
    const where = q.q ? { OR: [{ nome: { contains: q.q } }, { telefone: { contains: q.q.replace(/\s/g, '') } }] } : {};
    const [data, total] = await Promise.all([
      this.prisma.encarregado.findMany({
        where, orderBy: { nome: 'asc' }, ...paginar(q),
        include: { alunos: { select: { id: true, nome: true } } },
      }),
      this.prisma.encarregado.count({ where }),
    ]);
    return { data, total };
  }

  @Post()
  criar(@Body() dto: EncarregadoDto) {
    return this.prisma.encarregado.create({ data: dto });
  }

  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EncarregadoDto) {
    return this.prisma.encarregado.update({ where: { id }, data: dto });
  }
}
