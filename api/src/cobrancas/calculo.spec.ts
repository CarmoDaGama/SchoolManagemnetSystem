import { Prisma } from '@prisma/client';
import {
  calcularMulta, chaveMes, emAtraso, estadoVisivel, hojeUTC, mesesDoAno, mesNoAno, nomeMes, parseMes, planoCobrancas, vencimento,
} from './calculo';

const D = (v: number | string) => new Prisma.Decimal(v);
const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const ano = { anoInicio: 2026, mesInicio: 9, mesesServico: 10 };
const empresa = (o: Record<string, unknown> = {}) => ({
  diaLimite: 10, diasTolerancia: 0, tipoMulta: 'PERCENTAGEM' as const, multaValor: D(10),
  taxaInscricao: D(0), taxaConfirmacao: D(0), ...o,
});

describe('datas', () => {
  it('hojeUTC usa a data local à meia-noite UTC', () => {
    expect(hojeUTC(new Date(2026, 8, 17, 23, 59)).toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('meses do ano atravessam Dezembro→Janeiro', () => {
    const m = mesesDoAno(ano).map(chaveMes);
    expect(m).toHaveLength(10);
    expect(m[0]).toBe('2026-09');
    expect(m[3]).toBe('2026-12');
    expect(m[4]).toBe('2027-01');
    expect(m[9]).toBe('2027-06');
    expect(nomeMes(parseMes('2027-01'))).toBe('Janeiro 2027');
    expect(mesNoAno(parseMes('2027-06'), ano)).toBe(true);
    expect(mesNoAno(parseMes('2027-07'), ano)).toBe(false);
  });

  it('vencimento usa o último dia em meses curtos', () => {
    expect(vencimento(parseMes('2027-02'), { diaLimite: 30 }).toISOString().slice(0, 10)).toBe('2027-02-28');
    expect(vencimento(parseMes('2028-02'), { diaLimite: 31 }).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(vencimento(parseMes('2026-10'), { diaLimite: 10 }).toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('parseMes rejeita valores inválidos', () => {
    expect(() => parseMes('2026-13')).toThrow();
    expect(() => parseMes('abc')).toThrow();
  });
});

describe('estado e multa', () => {
  const c = { valor: D(15000), vencimento: dia('2026-10-10') };

  it('em atraso só depois do vencimento + tolerância', () => {
    expect(emAtraso(c.vencimento, { diasTolerancia: 0 }, dia('2026-10-10'))).toBe(false);
    expect(emAtraso(c.vencimento, { diasTolerancia: 0 }, dia('2026-10-11'))).toBe(true);
    expect(emAtraso(c.vencimento, { diasTolerancia: 5 }, dia('2026-10-15'))).toBe(false);
    expect(emAtraso(c.vencimento, { diasTolerancia: 5 }, dia('2026-10-16'))).toBe(true);
  });

  it('estado visível', () => {
    const e = { diasTolerancia: 0 };
    expect(estadoVisivel({ estado: 'PENDENTE', vencimento: c.vencimento }, e, dia('2026-10-01'))).toBe('POR_PAGAR');
    expect(estadoVisivel({ estado: 'PENDENTE', vencimento: c.vencimento }, e, dia('2026-10-11'))).toBe('ATRASO');
    expect(estadoVisivel({ estado: 'PAGA', vencimento: c.vencimento }, e, dia('2026-12-01'))).toBe('PAGA');
    expect(estadoVisivel({ estado: 'ISENTA', vencimento: c.vencimento }, e, dia('2026-12-01'))).toBe('ISENTA');
    expect(estadoVisivel({ estado: 'ANULADA', vencimento: c.vencimento }, e, dia('2026-12-01'))).toBe('ANULADA');
  });

  it('multa em percentagem, valor fixo, zero e com cêntimos', () => {
    expect(calcularMulta(c, empresa(), dia('2026-10-10')).toString()).toBe('0');
    expect(calcularMulta(c, empresa(), dia('2026-10-11')).toString()).toBe('1500');
    expect(calcularMulta(c, empresa({ diasTolerancia: 5 }), dia('2026-10-15')).toString()).toBe('0');
    expect(calcularMulta(c, empresa({ tipoMulta: 'VALOR_FIXO', multaValor: D(2000) }), dia('2026-11-01')).toString()).toBe('2000');
    expect(calcularMulta(c, empresa({ multaValor: D(0) }), dia('2026-11-01')).toString()).toBe('0');
    expect(calcularMulta({ valor: D(12345.67), vencimento: c.vencimento }, empresa({ multaValor: D(7.5) }), dia('2026-10-11')).toString()).toBe('925.93');
  });
});

describe('planoCobrancas', () => {
  const hoje = dia('2026-10-05');

  it('entrada em Outubro gera Outubro–Junho sem taxa quando a taxa é 0', () => {
    const p = planoCobrancas(ano, empresa(), parseMes('2026-10'), D(20000), 'NOVA', true, hoje);
    expect(p).toHaveLength(9);
    expect(p.every((c) => c.tipo === 'MENSALIDADE')).toBe(true);
    expect(p[0].descricao).toBe('Mensalidade Outubro 2026');
    expect(chaveMes(p[8].referencia)).toBe('2027-06');
    expect(p[0].vencimento.toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(p[0].valor.toString()).toBe('20000');
  });

  it('inclui taxa de inscrição ou confirmação quando > 0', () => {
    const e = empresa({ taxaInscricao: D(5000), taxaConfirmacao: D(3000) });
    const nova = planoCobrancas(ano, e, parseMes('2026-09'), D(20000), 'NOVA', true, hoje);
    expect(nova).toHaveLength(11);
    expect(nova[0]).toMatchObject({ tipo: 'INSCRICAO', descricao: 'Taxa de inscrição' });
    expect(nova[0].valor.toString()).toBe('5000');
    expect(nova[0].vencimento.toISOString().slice(0, 10)).toBe('2026-10-05');

    const conf = planoCobrancas(ano, e, parseMes('2026-09'), D(20000), 'CONFIRMACAO', true, hoje);
    expect(conf[0]).toMatchObject({ tipo: 'CONFIRMACAO' });
    expect(conf[0].valor.toString()).toBe('3000');

    const reactivar = planoCobrancas(ano, e, parseMes('2027-03'), D(20000), 'NOVA', false, hoje);
    expect(reactivar.map((c) => chaveMes(c.referencia))).toEqual(['2027-03', '2027-04', '2027-05', '2027-06']);
  });

  it('mês de entrada depois do fim do ano não gera mensalidades', () => {
    expect(planoCobrancas(ano, empresa(), parseMes('2027-08'), D(1), 'NOVA', true, hoje)).toHaveLength(0);
  });
});
