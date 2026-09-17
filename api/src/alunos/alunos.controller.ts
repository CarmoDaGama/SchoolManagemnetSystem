import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Genero, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { dataSimples, ListQuery, paginar } from '../common/util';
import { hojeUTC } from '../cobrancas/calculo';
import { InscricoesService } from '../inscricoes/inscricoes.service';
import { InscricaoDto } from '../inscricoes/inscricoes.controller';
import { EncarregadoDto } from './encarregados.controller';

class AlunoDto {
  @IsString() @IsNotEmpty({ message: 'Indique o nome do aluno.' }) nome: string;
  @IsOptional() @IsDateString({}, { message: 'Data de nascimento inválida.' }) dataNascimento?: string | null;
  @IsOptional() @IsEnum(Genero) genero?: Genero | null;
  @IsOptional() @IsString() colegio?: string | null;
  @IsOptional() @IsString() classe?: string | null;
  @IsOptional() @IsString() turma?: string | null;
  @IsOptional() @IsString() morada?: string | null;
  @IsOptional() @IsString() pontoReferencia?: string | null;
  @IsOptional() @IsString() observacoes?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() encarregadoId?: number | null;
  @IsOptional() @ValidateNested() @Type(() => EncarregadoDto) encarregado?: EncarregadoDto;
}

class CriarAlunoDto extends AlunoDto {
  @IsOptional() @ValidateNested() @Type(() => InscricaoDto) inscricao?: InscricaoDto;
}

class AlunosQuery extends ListQuery {
  @IsOptional() @Type(() => Number) @IsInt() rotaId?: number;
}

class LinhaImportacao {
  @Type(() => Number) @IsInt() linha: number;
  @IsString() nome: string;
  @IsOptional() @IsString() colegio?: string;
  @IsOptional() @IsString() classe?: string;
  @IsOptional() @IsString() turma?: string;
  @IsOptional() @IsString() encarregado?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsString() rota: string;
  @IsOptional() @IsString() pontoRecolha?: string;
  @IsOptional() @IsString() horaRecolha?: string;
  @IsOptional() @IsString() mesEntrada?: string;
}

class ImportarDto {
  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => LinhaImportacao) linhas: LinhaImportacao[];
}

const vazio = (s?: string | null) => (s && s.trim() ? s.trim() : null);

@Controller('alunos')
export class AlunosController {
  constructor(
    private prisma: PrismaService,
    private inscricoes: InscricoesService,
  ) {}

  @Get()
  async listar(@Query() q: AlunosQuery) {
    const ano = await this.prisma.anoLectivo.findFirst({ where: { activo: true } });
    const anoId = ano?.id ?? -1;
    const where: Prisma.AlunoWhereInput = {};
    if (q.q) {
      where.OR = [
        { nome: { contains: q.q } }, { numero: { contains: q.q } },
        { encarregado: { OR: [{ nome: { contains: q.q } }, { telefone: { contains: q.q.replace(/\s/g, '') } }] } },
      ];
    }
    if (q.rotaId) where.inscricoes = { some: { anoLectivoId: anoId, rotaId: q.rotaId } };

    const [alunos, total, empresa] = await Promise.all([
      this.prisma.aluno.findMany({
        where, orderBy: { nome: 'asc' }, ...paginar(q),
        include: {
          encarregado: { select: { nome: true, telefone: true } },
          inscricoes: { where: { anoLectivoId: anoId }, include: { rota: { select: { id: true, codigo: true, nome: true } } } },
        },
      }),
      this.prisma.aluno.count({ where }),
      this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } }),
    ]);

    const limite = hojeUTC();
    limite.setUTCDate(limite.getUTCDate() - empresa.diasTolerancia);
    const ids = alunos.flatMap((a) => a.inscricoes.map((i) => i.id));
    const atrasos = ids.length
      ? await this.prisma.cobranca.groupBy({
          by: ['inscricaoId'],
          where: { inscricaoId: { in: ids }, estado: 'PENDENTE', vencimento: { lt: limite } },
          _count: true,
        })
      : [];
    const mapa = new Map(atrasos.map((a) => [a.inscricaoId, a._count]));
    const data = alunos.map(({ inscricoes, ...a }) => {
      const i = inscricoes[0] ?? null;
      return { ...a, inscricaoActual: i, mesesEmAtraso: i ? (mapa.get(i.id) ?? 0) : 0 };
    });
    return { data, total };
  }

  @Get('sugestoes')
  async sugestoes() {
    const [colegios, classes] = await Promise.all([
      this.prisma.aluno.findMany({ where: { colegio: { not: null } }, distinct: ['colegio'], select: { colegio: true }, orderBy: { colegio: 'asc' } }),
      this.prisma.aluno.findMany({ where: { classe: { not: null } }, distinct: ['classe'], select: { classe: true }, orderBy: { classe: 'asc' } }),
    ]);
    return { colegios: colegios.map((c) => c.colegio), classes: classes.map((c) => c.classe) };
  }

  @Get(':id')
  async obter(@Param('id', ParseIntPipe) id: number) {
    const aluno = await this.prisma.aluno.findUniqueOrThrow({
      where: { id },
      include: {
        encarregado: true,
        inscricoes: { orderBy: { anoLectivo: { anoInicio: 'desc' } }, include: { rota: true, anoLectivo: true } },
      },
    });
    return { ...aluno, inscricaoActual: aluno.inscricoes.find((i) => i.anoLectivo.activo) ?? null };
  }

  @Post()
  async criar(@Body() dto: CriarAlunoDto, @CurrentUser() user: SessionUser) {
    const { inscricao, ...dados } = dto;
    return this.prisma.$transaction(async (tx) => {
      const aluno = await tx.aluno.create({
        data: { ...(await this.dadosAluno(tx, dados)), numero: await this.proximoNumero(tx) },
      });
      if (inscricao) await this.inscricoes.criar({ ...inscricao, alunoId: aluno.id }, user, tx);
      return aluno;
    });
  }

  @Patch(':id')
  async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: AlunoDto) {
    return this.prisma.$transaction(async (tx) => tx.aluno.update({ where: { id }, data: await this.dadosAluno(tx, dto) }));
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remover(@Param('id', ParseIntPipe) id: number) {
    const n = await this.prisma.inscricao.count({ where: { alunoId: id } });
    if (n) throw new BadRequestException('O aluno tem inscrições e não pode ser removido. Cancele a inscrição.');
    await this.prisma.aluno.delete({ where: { id } });
    return { ok: true };
  }

  /** Cada linha na sua transacção; encarregado reutilizado pelo telefone. */
  @Roles('ADMIN')
  @Post('importar')
  async importar(@Body() dto: ImportarDto, @CurrentUser() user: SessionUser) {
    const rotas = new Map((await this.prisma.rota.findMany()).map((r) => [r.codigo.toUpperCase(), r]));
    const resultados: { linha: number; ok: boolean; mensagem: string }[] = [];
    for (const l of dto.linhas) {
      try {
        const nome = l.nome?.trim();
        if (!nome) throw new Error('Nome em falta.');
        const rota = rotas.get(l.rota?.trim().toUpperCase());
        if (!rota) throw new Error(`Rota "${l.rota}" não existe.`);
        const mesEntrada = vazio(l.mesEntrada);
        if (mesEntrada && !/^\d{4}-\d{2}$/.test(mesEntrada)) throw new Error('Mês de entrada deve ser AAAA-MM.');
        const hora = vazio(l.horaRecolha);
        if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Hora deve ser HH:mm.');

        await this.prisma.$transaction(async (tx) => {
          const telefone = l.telefone?.replace(/\s/g, '') || null;
          let encarregadoId: number | null = null;
          if (telefone) {
            const enc = (await tx.encarregado.findFirst({ where: { telefone } }))
              ?? (await tx.encarregado.create({ data: { nome: vazio(l.encarregado) ?? 'Encarregado', telefone } }));
            encarregadoId = enc.id;
          }
          const aluno = await tx.aluno.create({
            data: {
              numero: await this.proximoNumero(tx), nome,
              colegio: vazio(l.colegio), classe: vazio(l.classe), turma: vazio(l.turma), encarregadoId,
            },
          });
          await this.inscricoes.criar(
            { alunoId: aluno.id, rotaId: rota.id, pontoRecolha: vazio(l.pontoRecolha), horaRecolha: hora, mesEntrada, forcarLotacao: true },
            user, tx,
          );
        });
        resultados.push({ linha: l.linha, ok: true, mensagem: 'Importado' });
      } catch (e) {
        resultados.push({ linha: l.linha, ok: false, mensagem: (e as Error).message });
      }
    }
    return { criados: resultados.filter((r) => r.ok).length, erros: resultados.filter((r) => !r.ok) };
  }

  private async proximoNumero(tx: Prisma.TransactionClient) {
    const n = await this.prisma.proximo(tx, 'aluno');
    return `T-${String(n).padStart(5, '0')}`;
  }

  private async dadosAluno(tx: Prisma.TransactionClient, dto: AlunoDto) {
    const { encarregado, encarregadoId, dataNascimento, ...dados } = dto;
    let encId = encarregadoId ?? null;
    if (!encId && encarregado) {
      const telefone = encarregado.telefone.replace(/\s/g, '');
      encId = (await tx.encarregado.create({ data: { ...encarregado, telefone } })).id;
    }
    return {
      ...dados,
      colegio: vazio(dados.colegio), classe: vazio(dados.classe), turma: vazio(dados.turma),
      dataNascimento: dataNascimento ? dataSimples(dataNascimento) : null,
      encarregadoId: encId,
    };
  }
}
