'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Coins, Printer } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { kz } from '@/lib/format';
import { useRotas } from '@/lib/hooks';
import { useEmpresa } from '@/components/providers';
import { CabecalhoEmpresa } from '@/components/Impressao';
import { Button, Card, Empty, Field, PageHeader, Select, Spinner, Table } from '@/components/ui';

type Devedor = {
  inscricaoId: number; alunoId: number; aluno: string; numero: string; rota: string; estadoInscricao: string;
  encarregado: string | null; telefone: string | null; meses: string[]; valor: string; multa: string; total: string;
};

export default function DevedoresPage() {
  const { data: empresa } = useEmpresa();
  const { data: rotas } = useRotas();
  const [rotaId, setRotaId] = useState('');
  const [minMeses, setMinMeses] = useState('1');
  const { data, isLoading } = useQuery({
    queryKey: ['devedores', rotaId, minMeses],
    queryFn: () => api.get<{ data: Devedor[]; resumo: { valor: string; multa: string; total: string } }>(`/financeiro/devedores${qs({ rotaId, minMeses })}`),
  });
  const rota = rotas?.data.find((r) => r.id === Number(rotaId));

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Devedores"
          subtitle="Alunos com mensalidades vencidas (depois dos dias de tolerância) no ano activo, do maior para o menor valor."
          actions={<Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>}
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Rota">
            <Select className="w-56" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">Todas as rotas</option>
              {rotas?.data.map((r) => <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>)}
            </Select>
          </Field>
          <Field label="Mínimo de meses em atraso">
            <Select className="w-40" value={minMeses} onChange={(e) => setMinMeses(e.target.value)}>
              {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n} ou mais</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <div className="hidden print:block">
        {empresa && <CabecalhoEmpresa empresa={empresa} titulo="Lista de devedores" subtitulo={<>{rota ? `Rota ${rota.codigo}` : 'Todas as rotas'} · {minMeses}+ meses · {new Date().toLocaleDateString('pt-PT')}</>} />}
      </div>
      {isLoading || !data ? <Spinner /> : !data.data.length ? <Empty>Não há devedores com estes critérios.</Empty> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4 print:grid-cols-4 print:text-[9pt]">
            <Card className="p-4"><p className="text-xs text-muted">Alunos</p><p className="text-lg font-bold">{data.data.length}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Valor em atraso</p><p className="text-lg font-bold text-danger">{kz(data.resumo.valor)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Multas à data de hoje</p><p className="text-lg font-bold text-warn">{kz(data.resumo.multa)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Total</p><p className="text-lg font-bold">{kz(data.resumo.total)}</p></Card>
          </div>
          <Table className="print:text-[9pt]">
            <thead><tr><th>Aluno</th><th>Rota</th><th>Meses em atraso</th><th className="text-right">Valor</th><th className="text-right">Multa</th><th className="text-right">Total</th><th>Encarregado · telefone</th><th className="no-print" /></tr></thead>
            <tbody>
              {data.data.map((d) => (
                <tr key={d.inscricaoId}>
                  <td><a className="font-medium text-primary hover:underline" href={`/alunos/ver/?id=${d.alunoId}&tab=pagamentos`}>{d.aluno}</a> <span className="font-mono text-xs text-muted">{d.numero}</span></td>
                  <td>{d.rota}</td>
                  <td><b>{d.meses.length}</b>: {d.meses.join(', ')}</td>
                  <td className="text-right">{kz(d.valor)}</td>
                  <td className="text-right">{kz(d.multa)}</td>
                  <td className="text-right font-semibold">{kz(d.total)}</td>
                  <td>{d.encarregado ? `${d.encarregado} · ${d.telefone}` : '—'}</td>
                  <td className="no-print text-right">
                    <a href={`/pagamentos/receber/?alunoId=${d.alunoId}`}><Button size="sm" variant="ghost"><Coins className="size-4" /> Receber</Button></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}
