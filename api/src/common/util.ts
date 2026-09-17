import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

export function paginar(query: ListQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** "2026-09-16" → Date à meia-noite UTC (o que o Prisma grava num @db.Date). */
export function dataSimples(s: string | Date): Date {
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Hoje no relógio local do Windows, como data simples (meia-noite UTC). */
export function hoje(agora = new Date()): Date {
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

export function ultimoDiaDoMes(ano: number, mes0: number): number {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
