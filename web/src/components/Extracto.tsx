'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Ban, MoreHorizontal, Printer } from 'lucide-react';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { api } from '@/lib/api';
import { data, dataHora, ESTADO_MES, kz, METODOS } from '@/lib/format';
import { useInvalidar } from '@/lib/hooks';
import type { Aluno, AnoLectivo, Cobranca, Inscricao } from '@/lib/types';
import { useAdmin } from './providers';
import { FormDialog } from './FormDialog';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Spinner, Table } from './ui';

type Pagamento = {
  id: number; numeroRecibo: string; data: string; metodo: string; total: string; estado: 'VALIDO' | 'ANULADO';
  motivoAnulacao: string | null; utilizador: { nome: string };
};

export type ExtractoData = Inscricao & {
  aluno: Aluno;
  anoLectivo: AnoLectivo;
  cobrancas: Cobranca[];
  pagamentos: Pagamento[];
  totais: { porPagar: string; emAtraso: string; multa: string };
};

export const abrirRecibo = (id: number) => window.open(`/imprimir/recibo/?id=${id}`, '_blank', 'width=900,height=900');

export function Extracto({ inscricaoId }: { inscricaoId: number }) {
  const admin = useAdmin();
  const invalidar = useInvalidar();
  const { data: ext, isLoading, refetch } = useQuery({
    queryKey: ['extracto', inscricaoId],
    queryFn: () => api.get<ExtractoData>(`/financeiro/extracto/${inscricaoId}`),
  });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [metodo, setMetodo] = useState('NUMERARIO');
  const [referencia, setReferencia] = useState('');
  const [desconto, setDesconto] = useState('');
  const [aPagar, setAPagar] = useState(false);
  const [anular, setAnular] = useState<Pagamento | null>(null);
  const [accao, setAccao] = useState<Cobranca | null>(null);

  // Meses em atraso (e taxas pendentes) aparecem já seleccionados
  useEffect(() => {
    if (ext) setSel(new Set(ext.cobrancas.filter((c) => c.estadoVisivel === 'ATRASO' || (c.estado === 'PENDENTE' && c.tipo !== 'MENSALIDADE')).map((c) => c.id)));
  }, [ext]);

  const pendentes = useMemo(() => ext?.cobrancas.filter((c) => c.estado === 'PENDENTE') ?? [], [ext]);
  const escolhidas = pendentes.filter((c) => sel.has(c.id));
  const subtotal = escolhidas.reduce((s, c) => s.add(c.valor), new Decimal(0));
  const multa = escolhidas.reduce((s, c) => s.add(c.multa), new Decimal(0));
  const desc = new Decimal(desconto || 0);
  const total = subtotal.add(multa).sub(desc);

  const toggle = (c: Cobranca) => {
    const n = new Set(sel);
    if (n.has(c.id)) n.delete(c.id);
    else n.add(c.id);
    setSel(n);
  };

  const depois = async () => {
    await refetch();
    await invalidar('alunos', 'painel', 'pagamentos', 'devedores', 'pagos', 'mapa');
  };

  const pagar = async () => {
    setAPagar(true);
    try {
      const p = await api.post<{ id: number; numeroRecibo: string }>('/financeiro/pagamentos', {
        inscricaoId, cobrancaIds: [...sel], metodo, referenciaBanc: referencia || null, desconto: desc.isZero() ? null : desc.toNumber(),
      });
      toast.success(`Pagamento registado: ${p.numeroRecibo}`);
      setReferencia('');
      setDesconto('');
      await depois();
      abrirRecibo(p.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAPagar(false);
    }
  };

  if (isLoading || !ext) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted">Por pagar (ano)</p><p className="text-lg font-bold">{kz(ext.totais.porPagar)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Em atraso</p><p className="text-lg font-bold text-danger">{kz(ext.totais.emAtraso)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Multa à data de hoje</p><p className="text-lg font-bold text-warn">{kz(ext.totais.multa)}</p></Card>
      </div>

      <Table>
        <thead><tr><th className="w-8" /><th>Descrição</th><th>Vencimento</th><th className="text-right">Valor</th><th className="text-right">Multa</th><th>Estado</th>{admin && <th />}</tr></thead>
        <tbody>
          {ext.cobrancas.map((c) => {
            const e = ESTADO_MES[c.estadoVisivel];
            const pendente = c.estado === 'PENDENTE';
            return (
              <tr key={c.id} className={pendente ? 'cursor-pointer' : 'text-muted'} onClick={() => pendente && toggle(c)}>
                <td>{pendente && <input type="checkbox" className="size-4 accent-primary" checked={sel.has(c.id)} onChange={() => toggle(c)} onClick={(ev) => ev.stopPropagation()} />}</td>
                <td>{c.descricao}{c.motivo && <span className="block text-xs text-muted">{c.motivo}</span>}</td>
                <td>{data(c.vencimento)}</td>
                <td className="text-right">{kz(c.valor)}</td>
                <td className="text-right">{Number(c.multa) ? kz(c.multa) : '—'}</td>
                <td><Badge tone={e.tone}>{e.simbolo} {e.texto}</Badge></td>
                {admin && (
                  <td className="text-right" onClick={(ev) => ev.stopPropagation()}>
                    {c.tipo === 'MENSALIDADE' && c.estado !== 'PAGA' && (
                      <Button size="sm" variant="ghost" onClick={() => setAccao(c)} aria-label="Acções do mês"><MoreHorizontal className="size-4" /></Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Table>

      {pendentes.length > 0 ? (
        <Card>
          <h3 className="mb-3 font-semibold">Receber pagamento</h3>
          <p className="mb-3 text-sm text-muted">Pode pagar meses adiantados. Não é possível deixar por pagar um mês mais antigo do que os escolhidos.</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Método">
              <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {Object.entries(METODOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Referência" hint={metodo === 'NUMERARIO' ? 'Opcional' : 'Obrigatória'}>
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </Field>
            {admin && (
              <Field label="Desconto (Kz)" hint="Só administrador">
                <Input type="number" min={0} step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
              </Field>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
            <dl className="grid grid-cols-2 gap-x-6 text-sm">
              <dt className="text-muted">{escolhidas.length} mês(es) / taxa(s)</dt><dd className="text-right">{kz(subtotal.toString())}</dd>
              <dt className="text-muted">Multa</dt><dd className="text-right">{kz(multa.toString())}</dd>
              {!desc.isZero() && (<><dt className="text-muted">Desconto</dt><dd className="text-right">− {kz(desc.toString())}</dd></>)}
              <dt className="font-bold">Total</dt><dd className="text-right text-lg font-bold">{kz(total.toString())}</dd>
            </dl>
            <Button onClick={pagar} loading={aPagar} disabled={!escolhidas.length || total.isNegative()}>
              Registar pagamento e imprimir recibo
            </Button>
          </div>
        </Card>
      ) : (
        <Alert tone="green">Sem meses por pagar neste ano lectivo.</Alert>
      )}

      {ext.pagamentos.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Pagamentos</h3>
          <Table>
            <thead><tr><th>Recibo</th><th>Data</th><th>Método</th><th className="text-right">Total</th><th>Registado por</th><th /></tr></thead>
            <tbody>
              {ext.pagamentos.map((p) => (
                <tr key={p.id} className={p.estado === 'ANULADO' ? 'text-muted' : ''}>
                  <td className="font-mono text-xs">{p.numeroRecibo} {p.estado === 'ANULADO' && <Badge tone="red">Anulado</Badge>}</td>
                  <td>{dataHora(p.data)}</td>
                  <td>{METODOS[p.metodo]}</td>
                  <td className={`text-right ${p.estado === 'ANULADO' ? 'line-through' : ''}`}>{kz(p.total)}</td>
                  <td>{p.utilizador.nome}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => abrirRecibo(p.id)} aria-label="Reimprimir"><Printer className="size-4" /></Button>
                    {admin && p.estado === 'VALIDO' && (
                      <Button size="sm" variant="ghost" onClick={() => setAnular(p)} title="Anular"><Ban className="size-4 text-danger" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <AnularPagamento pagamento={anular} onClose={() => setAnular(null)} onDone={depois} />
      <AccoesMes cobranca={accao} onClose={() => setAccao(null)} onDone={depois} />
    </div>
  );
}

/** Acções de administrador sobre um mês: isentar, retirar (sem serviço) ou reabrir. */
export function AccoesMes({ cobranca, onClose, onDone }: { cobranca: Pick<Cobranca, 'id' | 'descricao' | 'estado'> | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => setMotivo(''), [cobranca]);
  const executar = async (acao: 'isentar' | 'retirar' | 'reabrir') => {
    setLoading(acao);
    try {
      await api.post(`/cobrancas/${cobranca!.id}/${acao}`, acao === 'reabrir' ? {} : { motivo });
      toast.success(acao === 'isentar' ? 'Mês isento.' : acao === 'retirar' ? 'Mês retirado (sem serviço).' : 'Mês reaberto (por pagar).');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(null);
    }
  };
  const pendente = cobranca?.estado === 'PENDENTE';
  return (
    <Modal open={!!cobranca} onClose={onClose} title={cobranca?.descricao ?? ''}
      footer={
        pendente ? (
          <>
            <Button variant="secondary" disabled={motivo.trim().length < 3} loading={loading === 'retirar'} onClick={() => executar('retirar')}>Retirar mês (sem serviço)</Button>
            <Button disabled={motivo.trim().length < 3} loading={loading === 'isentar'} onClick={() => executar('isentar')}>Isentar</Button>
          </>
        ) : (
          <Button loading={loading === 'reabrir'} onClick={() => executar('reabrir')}>Reabrir (voltar a por pagar)</Button>
        )
      }
    >
      {pendente ? (
        <div className="space-y-3 text-sm">
          <p><b>Isentar:</b> o serviço existe mas não é cobrado. <b>Retirar:</b> o aluno não usa o transporte nesse mês (férias, ausência combinada).</p>
          <Field label="Motivo (obrigatório)"><Input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
        </div>
      ) : (
        <p className="text-sm">Este mês está {cobranca?.estado === 'ISENTA' ? 'isento' : 'sem serviço'}. Reabrir volta a cobrá-lo. A operação fica registada.</p>
      )}
    </Modal>
  );
}

export function AnularPagamento({ pagamento, onClose, onDone }: {
  pagamento: { id: number; numeroRecibo: string; total: string } | null; onClose: () => void; onDone: () => Promise<unknown>;
}) {
  return (
    <FormDialog
      open={!!pagamento}
      onClose={onClose}
      title={`Anular ${pagamento?.numeroRecibo ?? ''} (${kz(pagamento?.total)})`}
      submitLabel="Anular pagamento"
      fields={[{ name: 'motivo', label: 'Motivo da anulação', type: 'textarea', required: true, hint: 'Os meses voltam a ficar por pagar. O pagamento não é apagado.' }]}
      onSubmit={async (v) => {
        await api.post(`/financeiro/pagamentos/${pagamento!.id}/anular`, v);
        toast.success('Pagamento anulado.');
        await onDone();
      }}
    />
  );
}
