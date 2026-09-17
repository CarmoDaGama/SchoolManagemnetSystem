'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Printer } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { dataHora, kz, mesActual, METODOS } from '@/lib/format';
import { useRotas } from '@/lib/hooks';
import { useEmpresa } from '@/components/providers';
import { CabecalhoEmpresa } from '@/components/Impressao';
import { abrirRecibo } from '@/components/Extracto';
import { Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';

type Pago = {
  cobrancaId: number; valor: string; multa: string;
  aluno: { id: number; nome: string; numero: string }; rota: { codigo: string; nome: string };
  pagamento: { id: number; numeroRecibo: string; data: string; metodo: string } | null;
};

export default function PagosPage() {
  const { data: empresa } = useEmpresa();
  const { data: rotas } = useRotas();
  const [mes, setMes] = useState(mesActual());
  const [rotaId, setRotaId] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['pagos', mes, rotaId],
    queryFn: () => api.get<{ mes: { nome: string }; data: Pago[]; resumo: { total: string; porRota: Record<string, { alunos: number; valor: string }> } }>(`/financeiro/pagos${qs({ mes, rotaId })}`),
  });
  const rota = rotas?.data.find((r) => r.id === Number(rotaId));

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Alunos pagos por mês"
          subtitle="Quem já pagou a mensalidade do mês escolhido, independentemente do dia em que pagou."
          actions={<Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>}
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Mês de referência"><Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></Field>
          <Field label="Rota">
            <Select className="w-56" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">Todas as rotas</option>
              {rotas?.data.map((r) => <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <div className="hidden print:block">
        {empresa && data && <CabecalhoEmpresa empresa={empresa} titulo={`Pagos — ${data.mes.nome}`} subtitulo={<>{rota ? `Rota ${rota.codigo}` : 'Todas as rotas'} · emitido {new Date().toLocaleDateString('pt-PT')}</>} />}
      </div>
      {isLoading || !data ? <Spinner /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Card className="p-4"><p className="text-xs text-muted">Alunos · {data.mes.nome}</p><p className="text-lg font-bold">{data.data.length} · {kz(data.resumo.total)}</p></Card>
            {Object.entries(data.resumo.porRota).map(([codigo, r]) => (
              <Card key={codigo} className="p-4"><p className="text-xs text-muted">Rota {codigo}</p><p className="text-lg font-bold">{r.alunos} · {kz(r.valor)}</p></Card>
            ))}
          </div>
          {!data.data.length ? <Empty>Ninguém pagou {data.mes.nome} ainda.</Empty> : (
            <Table className="print:text-[9pt]">
              <thead><tr><th>Aluno</th><th>Rota</th><th>Data do pagamento</th><th>Método</th><th>Recibo</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.cobrancaId}>
                    <td><a className="text-primary hover:underline" href={`/alunos/ver/?id=${p.aluno.id}&tab=pagamentos`}>{p.aluno.nome}</a></td>
                    <td>{p.rota.codigo}</td>
                    <td>{dataHora(p.pagamento?.data)}</td>
                    <td>{p.pagamento ? METODOS[p.pagamento.metodo] : '—'}</td>
                    <td>{p.pagamento ? <button className="font-mono text-xs text-primary hover:underline" onClick={() => abrirRecibo(p.pagamento!.id)}>{p.pagamento.numeroRecibo}</button> : '—'}</td>
                    <td className="text-right">{kz(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
