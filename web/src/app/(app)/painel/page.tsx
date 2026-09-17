'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Coins, DatabaseBackup, Plus, TrendingUp, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { dataHora, kz } from '@/lib/format';
import { useAdmin, useSessao } from '@/components/providers';
import { abrirRecibo } from '@/components/Extracto';
import { Alert, Badge, Button, Card, Empty, PageHeader, Spinner, Table, cn } from '@/components/ui';

type Painel = {
  anoLectivo: { nome: string } | null;
  alunosActivos: number; recebidoMes: string; pagamentosMes: number; totalEmAtraso: string; alunosEmAtraso: number;
  rotas: { id: number; codigo: string; nome: string; capacidade: number; ocupacao: number }[];
  ultimosPagamentos: { id: number; numeroRecibo: string; data: string; total: string; estado: string; inscricao: { aluno: { id: number; nome: string } }; utilizador: { nome: string } }[];
};

export default function PainelPage() {
  const { data: user } = useSessao();
  const admin = useAdmin();
  const { data: estadoCopias } = useQuery({ queryKey: ['backup-estado'], queryFn: () => api.get<{ alertas: string[] }>('/backup/estado'), refetchInterval: 5 * 60_000 });
  const { data, isLoading } = useQuery({ queryKey: ['painel'], queryFn: () => api.get<Painel>('/painel') });

  return (
    <>
      <PageHeader
        title={`Olá, ${user?.nome ?? ''}`}
        subtitle={`${new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${data?.anoLectivo ? ` · Ano lectivo ${data.anoLectivo.nome}` : ''}`}
        actions={
          <>
            <a href="/alunos/novo/"><Button variant="secondary"><Plus className="size-4" /> Novo aluno</Button></a>
            <a href="/pagamentos/receber/"><Button><Coins className="size-4" /> Receber pagamento</Button></a>
          </>
        }
      />

      {/* O aviso de cópias fica sempre, mesmo que o resto do painel seja cortado */}
      {!!estadoCopias?.alertas.length && (
        <div className="mb-6">
          <Alert tone="red">
            <p className="flex items-center gap-2 font-semibold"><DatabaseBackup className="size-4" /> Cópias de segurança</p>
            {estadoCopias.alertas.map((a) => <p key={a}>{a}</p>)}
            {admin && <a className="underline" href="/config/copias/">Abrir cópias de segurança</a>}
          </Alert>
        </div>
      )}
      {data && !data.anoLectivo && <div className="mb-6"><Alert tone="amber">Não há ano lectivo activo. {admin ? <a className="underline" href="/config/anos/">Criar ano lectivo</a> : 'Contacte o administrador.'}</Alert></div>}

      {isLoading || !data ? <Spinner /> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador icon={Users} label="Alunos activos" valor={String(data.alunosActivos)} href="/alunos/" />
            <Indicador icon={TrendingUp} label="Recebido este mês" valor={kz(data.recebidoMes)} detalhe={`${data.pagamentosMes} pagamentos`} href="/pagamentos/historico/" />
            <Indicador icon={AlertTriangle} label="Total em atraso" valor={kz(data.totalEmAtraso)} tone="danger" href="/devedores/" />
            <Indicador icon={Users} label="Alunos com atraso" valor={String(data.alunosEmAtraso)} tone="danger" href="/devedores/" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h2 className="mb-2 font-semibold">Ocupação das rotas</h2>
              {!data.rotas.length ? <Empty>Sem rotas activas.</Empty> : (
                <Card className="space-y-3">
                  {data.rotas.map((r) => {
                    const pct = Math.min(100, Math.round((r.ocupacao / Math.max(1, r.capacidade)) * 100));
                    return (
                      <a key={r.id} href={`/rotas/ver/?id=${r.id}`} className="block">
                        <div className="mb-1 flex justify-between text-sm"><span><b>{r.codigo}</b> {r.nome}</span><span>{r.ocupacao}/{r.capacidade}</span></div>
                        <div className="h-2 overflow-hidden rounded bg-bg">
                          <div className={cn('h-full', pct >= 100 ? 'bg-danger' : pct >= 85 ? 'bg-warn' : 'bg-primary')} style={{ width: `${pct}%` }} />
                        </div>
                      </a>
                    );
                  })}
                </Card>
              )}
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Últimos pagamentos</h2>
              {!data.ultimosPagamentos.length ? <Empty>Ainda não há pagamentos.</Empty> : (
                <Table>
                  <thead><tr><th>Recibo</th><th>Data</th><th>Aluno</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {data.ultimosPagamentos.map((p) => (
                      <tr key={p.id} className="cursor-pointer" onClick={() => abrirRecibo(p.id)}>
                        <td className="font-mono text-xs">{p.numeroRecibo} {p.estado === 'ANULADO' && <Badge tone="red">Anulado</Badge>}</td>
                        <td>{dataHora(p.data)}</td>
                        <td>{p.inscricao.aluno.nome}</td>
                        <td className="text-right">{kz(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Indicador({ icon: Icon, label, valor, detalhe, tone, href }: {
  icon: typeof Users; label: string; valor: string; detalhe?: string; tone?: 'danger'; href: string;
}) {
  return (
    <a href={href}>
      <Card className="h-full transition hover:border-primary">
        <div className="flex items-center gap-2 text-sm text-muted"><Icon className="size-4" /> {label}</div>
        <p className={`mt-2 text-2xl font-bold ${tone === 'danger' ? 'text-danger' : ''}`}>{valor}</p>
        {detalhe && <p className="text-xs text-muted">{detalhe}</p>}
      </Card>
    </a>
  );
}
