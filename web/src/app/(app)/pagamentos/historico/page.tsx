'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Ban, Printer } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { dataHora, hojeIso, kz, METODOS } from '@/lib/format';
import { useInvalidar, useRotas } from '@/lib/hooks';
import { useAdmin, useEmpresa } from '@/components/providers';
import { abrirRecibo, AnularPagamento } from '@/components/Extracto';
import { CabecalhoEmpresa } from '@/components/Impressao';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';

type Pag = {
  id: number; numeroRecibo: string; data: string; metodo: string; total: string; estado: 'VALIDO' | 'ANULADO';
  inscricao: { aluno: { id: number; nome: string; numero: string }; rota: { codigo: string } };
  utilizador: { nome: string }; meses: string[];
};

export default function HistoricoPage() {
  const admin = useAdmin();
  const { data: empresa } = useEmpresa();
  const { data: rotas } = useRotas();
  const invalidar = useInvalidar();
  const [de, setDe] = useState(hojeIso());
  const [ate, setAte] = useState(hojeIso());
  const [rotaId, setRotaId] = useState('');
  const [anular, setAnular] = useState<Pag | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['pagamentos', de, ate, rotaId],
    queryFn: () => api.get<{ data: Pag[]; resumo: { total: string; porMetodo: Record<string, string>; porRota: Record<string, string> } }>(`/financeiro/pagamentos${qs({ de, ate, rotaId })}`),
  });

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Pagamentos por data"
          subtitle="Caixa por período. Os pagamentos anulados não entram nos totais."
          actions={<Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>}
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="De"><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field>
          <Field label="Até"><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field>
          <Field label="Rota">
            <Select className="w-48" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">Todas</option>
              {rotas?.data.map((r) => <option key={r.id} value={r.id}>{r.codigo}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <div className="hidden print:block">
        {empresa && <CabecalhoEmpresa empresa={empresa} titulo="Pagamentos" subtitulo={`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`} />}
      </div>
      {isLoading || !data ? <Spinner /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Card className="p-4"><p className="text-xs text-muted">Total recebido</p><p className="text-lg font-bold">{kz(data.resumo.total)}</p></Card>
            {Object.entries(data.resumo.porMetodo).map(([k, v]) => (
              <Card key={k} className="p-4"><p className="text-xs text-muted">{METODOS[k]}</p><p className="text-lg font-bold">{kz(v)}</p></Card>
            ))}
            {Object.entries(data.resumo.porRota).map(([k, v]) => (
              <Card key={k} className="p-4"><p className="text-xs text-muted">Rota {k}</p><p className="text-lg font-bold">{kz(v)}</p></Card>
            ))}
          </div>
          {!data.data.length ? <Empty>Sem pagamentos neste período.</Empty> : (
            <Table className="print:text-[9pt]">
              <thead><tr><th>Recibo</th><th>Data</th><th>Aluno</th><th>Rota</th><th>Meses</th><th>Método</th><th>Operador</th><th className="text-right">Total</th><th className="no-print" /></tr></thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id} className={p.estado === 'ANULADO' ? 'text-muted' : ''}>
                    <td className="font-mono text-xs">{p.numeroRecibo} {p.estado === 'ANULADO' && <Badge tone="red">Anulado</Badge>}</td>
                    <td>{dataHora(p.data)}</td>
                    <td><a className="text-primary hover:underline" href={`/alunos/ver/?id=${p.inscricao.aluno.id}&tab=pagamentos`}>{p.inscricao.aluno.nome}</a></td>
                    <td>{p.inscricao.rota.codigo}</td>
                    <td className="text-xs">{p.meses.join(', ')}</td>
                    <td>{METODOS[p.metodo]}</td>
                    <td>{p.utilizador.nome}</td>
                    <td className={`text-right ${p.estado === 'ANULADO' ? 'line-through' : ''}`}>{kz(p.total)}</td>
                    <td className="no-print text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => abrirRecibo(p.id)} aria-label="Reimprimir"><Printer className="size-4" /></Button>
                      {admin && p.estado === 'VALIDO' && <Button size="sm" variant="ghost" onClick={() => setAnular(p)} title="Anular"><Ban className="size-4 text-danger" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
      <AnularPagamento pagamento={anular} onClose={() => setAnular(null)} onDone={() => invalidar('pagamentos', 'painel', 'devedores', 'pagos', 'extracto', 'mapa')} />
    </>
  );
}
