'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FileSpreadsheet, Plus, Search } from 'lucide-react';
import { api, Lista, qs } from '@/lib/api';
import { ESTADOS_INSCRICAO } from '@/lib/format';
import { useRotas } from '@/lib/hooks';
import type { Aluno, Inscricao } from '@/lib/types';
import { useAdmin } from '@/components/providers';
import { Badge, Button, Empty, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';

type AlunoLinha = Aluno & { inscricaoActual: Inscricao | null; mesesEmAtraso: number };

export default function AlunosPage() {
  const admin = useAdmin();
  const [q, setQ] = useState('');
  const [rotaId, setRotaId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data: rotas } = useRotas();
  const { data, isLoading } = useQuery({
    queryKey: ['alunos', q, rotaId, page],
    queryFn: () => api.get<Lista<AlunoLinha>>(`/alunos${qs({ q, rotaId, page, pageSize })}`),
  });
  const paginas = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <>
      <PageHeader
        title="Alunos"
        subtitle={data ? `${data.total} alunos` : undefined}
        actions={
          <>
            {admin && <a href="/alunos/importar/"><Button variant="secondary"><FileSpreadsheet className="size-4" /> Importar Excel</Button></a>}
            <a href="/alunos/novo/"><Button><Plus className="size-4" /> Novo aluno</Button></a>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-3 size-4 text-muted" />
          <Input autoFocus className="pl-9" placeholder="Pesquisar por nome, nº do aluno, encarregado ou telefone" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Select className="w-56" value={rotaId} onChange={(e) => { setRotaId(e.target.value); setPage(1); }}>
          <option value="">Todas as rotas</option>
          {rotas?.data.map((r) => <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>)}
        </Select>
      </div>
      {isLoading ? <Spinner /> : !data?.data.length ? <Empty>Nenhum aluno encontrado.</Empty> : (
        <>
          <Table>
            <thead><tr><th>Nº</th><th>Nome</th><th>Colégio / classe</th><th>Rota</th><th>Encarregado</th><th>Situação</th></tr></thead>
            <tbody>
              {data.data.map((a) => {
                const i = a.inscricaoActual;
                return (
                  <tr key={a.id} className="cursor-pointer" onClick={() => (window.location.href = `/alunos/ver/?id=${a.id}`)}>
                    <td className="font-mono text-xs">{a.numero}</td>
                    <td className="font-medium text-primary">{a.nome}</td>
                    <td>{[a.colegio, a.classe, a.turma].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{i ? <>{i.rota.codigo} {i.estado !== 'ACTIVA' && <Badge tone="amber">{ESTADOS_INSCRICAO[i.estado]}</Badge>}</> : <Badge tone="amber">Sem inscrição</Badge>}</td>
                    <td>{a.encarregado ? `${a.encarregado.nome} · ${a.encarregado.telefone}` : '—'}</td>
                    <td>{!i ? '—' : a.mesesEmAtraso ? <Badge tone="red">! {a.mesesEmAtraso} em atraso</Badge> : <Badge tone="green">✓ Em dia</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {paginas > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span>Página {page} de {paginas}</span>
              <Button size="sm" variant="secondary" disabled={page >= paginas} onClick={() => setPage(page + 1)}>Seguinte</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
