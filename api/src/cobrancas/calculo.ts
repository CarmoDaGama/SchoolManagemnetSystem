import { Prisma, TipoInscricao } from '@prisma/client';

/** O único sítio com contas de datas, estados e multas. Extracto, mapa, devedores e pagamentos usam só isto. */
const D = Prisma.Decimal;
type D = Prisma.Decimal;

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type AnoCalc = { anoInicio: number; mesInicio: number; mesesServico: number };
type EmpresaCalc = {
  diaLimite: number; diasTolerancia: number; tipoMulta: 'PERCENTAGEM' | 'VALOR_FIXO'; multaValor: D;
  taxaInscricao: D; taxaConfirmacao: D;
};

// Colunas @db.Date chegam como meia-noite UTC: comparar sempre em UTC
export const hojeUTC = (agora = new Date()) => new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
export const inicioMes = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const chaveMes = (d: Date) => d.toISOString().slice(0, 7); // "2026-10"
export const nomeMes = (d: Date) => `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** "2026-10" ou "2026-10-15" → 1 de Outubro de 2026 (UTC). */
export function parseMes(s: string): Date {
  const [y, m] = s.slice(0, 7).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Mês inválido: ${s}`);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function mesesDoAno(ano: AnoCalc): Date[] {
  return Array.from({ length: ano.mesesServico }, (_, i) => new Date(Date.UTC(ano.anoInicio, ano.mesInicio - 1 + i, 1)));
}

export function mesNoAno(mes: Date, ano: AnoCalc): boolean {
  return mesesDoAno(ano).some((m) => m.getTime() === inicioMes(mes).getTime());
}

export function vencimento(ref: Date, e: Pick<EmpresaCalc, 'diaLimite'>): Date {
  const ultimo = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), Math.min(e.diaLimite, ultimo)));
}

export function emAtraso(venc: Date, e: Pick<EmpresaCalc, 'diasTolerancia'>, hoje: Date): boolean {
  const limite = new Date(venc);
  limite.setUTCDate(limite.getUTCDate() + e.diasTolerancia);
  return hoje > limite;
}

export type EstadoVisivel = 'PAGA' | 'ISENTA' | 'ANULADA' | 'ATRASO' | 'POR_PAGAR';

export function estadoVisivel(
  c: { estado: 'PENDENTE' | 'PAGA' | 'ISENTA' | 'ANULADA'; vencimento: Date },
  e: Pick<EmpresaCalc, 'diasTolerancia'>,
  hoje: Date,
): EstadoVisivel {
  if (c.estado !== 'PENDENTE') return c.estado;
  return emAtraso(c.vencimento, e, hoje) ? 'ATRASO' : 'POR_PAGAR';
}

export function calcularMulta(c: { valor: D; vencimento: Date }, e: EmpresaCalc | Omit<EmpresaCalc, 'taxaInscricao' | 'taxaConfirmacao' | 'diaLimite'>, hoje: Date): D {
  if (!emAtraso(c.vencimento, e, hoje) || e.multaValor.isZero()) return new D(0);
  return e.tipoMulta === 'VALOR_FIXO' ? new D(e.multaValor) : c.valor.mul(e.multaValor).div(100).toDecimalPlaces(2);
}

export type CobrancaPlano = {
  tipo: 'INSCRICAO' | 'CONFIRMACAO' | 'MENSALIDADE';
  descricao: string;
  referencia: Date;
  valor: D;
  vencimento: Date;
};

/** Cobranças a criar numa inscrição/confirmação (ou reactivação, com incluirTaxa=false). */
export function planoCobrancas(
  ano: AnoCalc, e: EmpresaCalc, aPartirDe: Date, valor: D, tipo: TipoInscricao, incluirTaxa = true, hoje = hojeUTC(),
): CobrancaPlano[] {
  const desde = inicioMes(aPartirDe);
  const itens: CobrancaPlano[] = [];
  const taxa = tipo === 'CONFIRMACAO' ? e.taxaConfirmacao : e.taxaInscricao;
  if (incluirTaxa && taxa.gt(0)) {
    itens.push({
      tipo: tipo === 'CONFIRMACAO' ? 'CONFIRMACAO' : 'INSCRICAO',
      descricao: tipo === 'CONFIRMACAO' ? 'Taxa de confirmação' : 'Taxa de inscrição',
      referencia: desde, valor: new D(taxa), vencimento: hoje,
    });
  }
  for (const ref of mesesDoAno(ano)) {
    if (ref < desde) continue;
    itens.push({ tipo: 'MENSALIDADE', descricao: `Mensalidade ${nomeMes(ref)}`, referencia: ref, valor: new D(valor), vencimento: vencimento(ref, e) });
  }
  return itens;
}
