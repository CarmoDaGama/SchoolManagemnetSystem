'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { ESTADO_MES, mesActual, SENTIDOS, TURNOS } from '@/lib/format';
import type { EstadoVisivel, Inscricao, Aluno, Rota, Mes } from '@/lib/types';
import { Badge, Button, Empty, Field, Input, PageHeader, Spinner, Table } from '@/components/ui';

type ListaRota = {
  rota: Rota;
  anoLectivo: { nome: string } | null;
  mes: Mes;
  data: (Inscricao & { aluno: Aluno; situacaoMes: EstadoVisivel | null })[];
};

export default function Page() {
  return <Suspense fallback={<Spinner />}><RotaVer /></Suspense>;
}

function RotaVer() {
  const id = Number(useSearchParams().get('id'));
  const [mes, setMes] = useState(mesActual());
  const { data, isLoading } = useQuery({
    queryKey: ['rota-alunos', id, mes],
    queryFn: () => api.get<ListaRota>(`/rotas/${id}/alunos?mes=${mes}`),
    enabled: !!id,
  });
  if (isLoading || !data) return <Spinner />;
  const r = data.rota;

  return (
    <>
      <PageHeader
        title={`${r.codigo} — ${r.nome}`}
        subtitle={`${TURNOS[r.turno]} · ${r.motorista ?? 'sem motorista'}${r.telefoneMotorista ? ` (${r.telefoneMotorista})` : ''} · ${r.viatura ?? 'sem viatura'} · ${data.data.length}/${r.capacidade} alunos`}
        actions={<Button variant="secondary" onClick={() => window.open(`/imprimir/rota/?id=${id}&mes=${mes}`, '_blank')}><Printer className="size-4" /> Imprimir lista para o motorista</Button>}
      />
      <div className="mb-4 flex items-end gap-3">
        <Field label="Situação do mês"><Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></Field>
      </div>
      {!data.data.length ? <Empty>Sem alunos activos nesta rota.</Empty> : (
        <Table>
          <thead><tr><th>Nº</th><th>Hora</th><th>Aluno</th><th>Colégio / classe</th><th>Ponto de recolha</th><th>Sentido</th><th>Encarregado</th><th>{data.mes.nome}</th></tr></thead>
          <tbody>
            {data.data.map((i, n) => (
              <tr key={i.id} className="cursor-pointer" onClick={() => (window.location.href = `/alunos/ver/?id=${i.alunoId}`)}>
                <td>{n + 1}</td>
                <td className="font-mono">{i.horaRecolha ?? '—'}</td>
                <td className="font-medium text-primary">{i.aluno.nome}</td>
                <td>{[i.aluno.colegio, i.aluno.classe].filter(Boolean).join(' · ') || '—'}</td>
                <td>{i.pontoRecolha ?? i.aluno.pontoReferencia ?? '—'}</td>
                <td>{SENTIDOS[i.sentido]}</td>
                <td>{i.aluno.encarregado ? `${i.aluno.encarregado.nome} · ${i.aluno.encarregado.telefone}` : '—'}</td>
                <td>{i.situacaoMes ? <Badge tone={ESTADO_MES[i.situacaoMes].tone}>{ESTADO_MES[i.situacaoMes].simbolo} {ESTADO_MES[i.situacaoMes].texto}</Badge> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
