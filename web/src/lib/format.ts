import type { EstadoVisivel } from './types';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const nf = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function kz(v: string | number | null | undefined, moeda = 'Kz') {
  if (v === null || v === undefined || v === '') return '—';
  return `${nf.format(Number(v))} ${moeda}`;
}

/** Datas @db.Date chegam como "2026-10-10T00:00:00.000Z": mostrar sem conversão de fuso. */
export function data(v: string | null | undefined) {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function dataHora(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

export const isoDia = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
export const chaveMes = (v: string) => v.slice(0, 7);
export const nomeMes = (chave: string) => `${MESES[Number(chave.slice(5, 7)) - 1]} ${chave.slice(0, 4)}`;
export const mesCurto = (chave: string) => `${MESES[Number(chave.slice(5, 7)) - 1].slice(0, 3)}/${chave.slice(2, 4)}`;

export function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const mesActual = () => hojeIso().slice(0, 7);

export const bytes = (b: number | null | undefined) =>
  b === null || b === undefined ? '—' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(b / 1024))} KB`;

export const TURNOS: Record<string, string> = { MANHA: 'Manhã', TARDE: 'Tarde', MANHA_E_TARDE: 'Manhã e tarde' };
export const SENTIDOS: Record<string, string> = { IDA_E_VOLTA: 'Ida e volta', SO_IDA: 'Só ida', SO_VOLTA: 'Só volta' };
export const METODOS: Record<string, string> = {
  NUMERARIO: 'Numerário', TPA: 'TPA', TRANSFERENCIA: 'Transferência', MULTICAIXA_EXPRESS: 'Multicaixa Express',
};
export const ESTADOS_INSCRICAO: Record<string, string> = { ACTIVA: 'Activa', SUSPENSA: 'Suspensa', CANCELADA: 'Cancelada' };
export const ROLES: Record<string, string> = { ADMIN: 'Administrador', OPERADOR: 'Operador' };

/** Estado do mês: texto, símbolo (impressão a preto e branco / daltonismo) e tom. */
export const ESTADO_MES: Record<EstadoVisivel, { texto: string; simbolo: string; tone: 'green' | 'red' | 'blue' | 'amber' | 'neutral'; cls: string }> = {
  PAGA: { texto: 'Pago', simbolo: '✓', tone: 'green', cls: 'bg-success-soft text-success' },
  ATRASO: { texto: 'Em atraso', simbolo: '!', tone: 'red', cls: 'bg-danger-soft text-danger font-bold' },
  POR_PAGAR: { texto: 'Por pagar', simbolo: '·', tone: 'blue', cls: 'bg-primary-soft text-primary' },
  ISENTA: { texto: 'Isento', simbolo: 'I', tone: 'amber', cls: 'bg-warn-soft text-warn' },
  ANULADA: { texto: 'Sem serviço', simbolo: '—', tone: 'neutral', cls: 'bg-bg text-muted' },
};
