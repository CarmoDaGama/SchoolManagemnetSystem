'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api, Lista, qs } from '@/lib/api';
import type { Aluno, Inscricao } from '@/lib/types';
import { Extracto } from '@/components/Extracto';
import { Alert, Badge, Button, Card, Input, PageHeader, Spinner } from '@/components/ui';

type AlunoLinha = Aluno & { inscricaoActual: Inscricao | null; mesesEmAtraso?: number };

export default function Page() {
  return <Suspense fallback={<Spinner />}><Receber /></Suspense>;
}

function Receber() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [aluno, setAluno] = useState<AlunoLinha | null>(null);
  const alunoParam = Number(params.get('alunoId'));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['receber-pesquisa', debounced],
    queryFn: () => api.get<Lista<AlunoLinha>>(`/alunos${qs({ q: debounced, pageSize: 10 })}`),
    enabled: debounced.length >= 2 && !aluno,
  });

  useEffect(() => {
    if (alunoParam) api.get<AlunoLinha>(`/alunos/${alunoParam}`).then(setAluno).catch(() => null);
  }, [alunoParam]);

  return (
    <>
      <PageHeader title="Receber pagamento" subtitle="Pesquise o aluno; os meses em atraso aparecem já seleccionados." />
      {!aluno ? (
        <Card className="max-w-3xl">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted" />
            <Input
              autoFocus
              className="pl-9"
              placeholder="Nome do aluno, nº, encarregado ou telefone — Enter escolhe o primeiro"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resultados?.data[0]) {
                  e.preventDefault();
                  setAluno(resultados.data[0]);
                }
              }}
            />
          </div>
          {isFetching && <Spinner label="A pesquisar…" />}
          {resultados && debounced.length >= 2 && (
            <ul className="mt-3 divide-y divide-line rounded-md border border-line">
              {resultados.data.map((a, i) => (
                <li key={a.id}>
                  <button onClick={() => setAluno(a)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg ${i === 0 ? 'bg-primary-soft/50' : ''}`}>
                    <span><b>{a.nome}</b> <span className="font-mono text-xs text-muted">{a.numero}</span></span>
                    <span className="flex items-center gap-2 text-muted">
                      {a.inscricaoActual ? `Rota ${a.inscricaoActual.rota.codigo}` : 'Sem inscrição'}
                      {!!a.mesesEmAtraso && <Badge tone="red">! {a.mesesEmAtraso} em atraso</Badge>}
                    </span>
                  </button>
                </li>
              ))}
              {!resultados.data.length && <li className="px-3 py-2 text-sm text-muted">Nenhum aluno encontrado.</li>}
            </ul>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <a href={`/alunos/ver/?id=${aluno.id}`} className="text-lg font-bold text-primary hover:underline">{aluno.nome}</a>
              <p className="text-sm text-muted">
                <span className="font-mono">{aluno.numero}</span>
                {aluno.inscricaoActual && <> · Rota {aluno.inscricaoActual.rota.codigo} — {aluno.inscricaoActual.rota.nome}</>}
                {aluno.encarregado && <> · {aluno.encarregado.nome} ({aluno.encarregado.telefone})</>}
              </p>
            </div>
            <Button variant="secondary" onClick={() => { setAluno(null); setQ(''); setDebounced(''); window.history.replaceState(null, '', '/pagamentos/receber/'); }}>
              <X className="size-4" /> Outro aluno
            </Button>
          </Card>
          {aluno.inscricaoActual ? (
            <Extracto inscricaoId={aluno.inscricaoActual.id} />
          ) : (
            <Alert tone="amber">Este aluno não tem inscrição no ano activo. <a className="underline" href={`/alunos/ver/?id=${aluno.id}&tab=inscricao`}>Inscrever ou confirmar</a></Alert>
          )}
        </div>
      )}
    </>
  );
}
