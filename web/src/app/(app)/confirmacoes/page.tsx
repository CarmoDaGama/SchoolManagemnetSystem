'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { kz } from '@/lib/format';
import { useInvalidar, useRotas } from '@/lib/hooks';
import type { Aluno, AnoLectivo, Inscricao } from '@/lib/types';
import { Alert, Badge, Button, Empty, PageHeader, Select, Spinner, Table } from '@/components/ui';

type PorConfirmar = {
  anoActivo: AnoLectivo | null;
  anoAnterior: AnoLectivo | null;
  data: (Inscricao & { aluno: Aluno })[];
};
type Resultado = { alunoId: number; ok: boolean; mensagem: string };

export default function ConfirmacoesPage() {
  const invalidar = useInvalidar();
  const { data: rotas } = useRotas();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['por-confirmar'], queryFn: () => api.get<PorConfirmar>('/inscricoes/por-confirmar') });
  const [sel, setSel] = useState<Record<number, { marcado: boolean; rotaId: number }>>({});
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data) setSel(Object.fromEntries(data.data.map((i) => [i.alunoId, { marcado: false, rotaId: i.rotaId }])));
  }, [data]);

  if (isLoading || !data) return <Spinner />;
  const marcados = Object.entries(sel).filter(([, v]) => v.marcado);
  const nomes = new Map(data.data.map((i) => [i.alunoId, i.aluno.nome]));

  return (
    <>
      <PageHeader
        title="Confirmações"
        subtitle={data.anoActivo && data.anoAnterior
          ? `Alunos de ${data.anoAnterior.nome} ainda sem inscrição em ${data.anoActivo.nome}. A rota anterior vem pré-seleccionada.`
          : 'Confirmação de alunos do ano anterior para o ano activo.'}
        actions={
          <Button disabled={!marcados.length} loading={loading} onClick={async () => {
            setLoading(true);
            try {
              const r = await api.post<{ confirmados: number; falhados: number; resultados: Resultado[] }>('/inscricoes/confirmar-lote', {
                itens: marcados.map(([alunoId, v]) => ({ alunoId: Number(alunoId), rotaId: v.rotaId })),
              });
              setResultados(r.resultados);
              if (r.confirmados) toast.success(`${r.confirmados} alunos confirmados.`);
              if (r.falhados) toast.error(`${r.falhados} não foram confirmados. Veja o motivo abaixo.`);
              await refetch();
              await invalidar('alunos', 'rotas', 'painel', 'mapa');
            } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
          }}><CheckCheck className="size-4" /> Confirmar seleccionados ({marcados.length})</Button>
        }
      />
      {!data.anoActivo && <Alert tone="amber">Não há ano lectivo activo.</Alert>}
      {data.anoActivo && !data.anoAnterior && <Alert tone="blue">Não existe um ano lectivo anterior a {data.anoActivo.nome}. Para confirmar alunos, crie e active o novo ano em Configuração › Anos lectivos.</Alert>}

      {resultados.some((r) => !r.ok) && (
        <div className="mb-4">
          <Alert tone="red">
            <p className="mb-1 font-semibold">Não confirmados:</p>
            {resultados.filter((r) => !r.ok).map((r) => <p key={r.alunoId}>{nomes.get(r.alunoId) ?? `Aluno ${r.alunoId}`}: {r.mensagem}</p>)}
          </Alert>
        </div>
      )}

      {data.anoAnterior && (!data.data.length ? <Empty>Todos os alunos de {data.anoAnterior.nome} já foram confirmados ou não voltam.</Empty> : (
        <Table>
          <thead>
            <tr>
              <th className="w-8">
                <input type="checkbox" className="size-4 accent-primary" checked={marcados.length === data.data.length}
                  onChange={(e) => setSel(Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, { ...v, marcado: e.target.checked }])))} />
              </th>
              <th>Aluno</th><th>Colégio / classe</th><th>Rota em {data.anoAnterior.nome}</th><th>Rota em {data.anoActivo?.nome}</th><th>Encarregado</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((i) => {
              const s = sel[i.alunoId];
              if (!s) return null;
              return (
                <tr key={i.id}>
                  <td><input type="checkbox" className="size-4 accent-primary" checked={s.marcado} onChange={(e) => setSel({ ...sel, [i.alunoId]: { ...s, marcado: e.target.checked } })} /></td>
                  <td><a className="font-medium text-primary hover:underline" href={`/alunos/ver/?id=${i.alunoId}`}>{i.aluno.nome}</a> {i.estado !== 'ACTIVA' && <Badge tone="amber">{i.estado}</Badge>}</td>
                  <td>{[i.aluno.colegio, i.aluno.classe].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{i.rota.codigo}{i.valorEspecial && <span className="text-xs text-muted"> (valor especial {kz(i.valorMensal)})</span>}</td>
                  <td>
                    <Select className="h-8 w-48" value={s.rotaId} onChange={(e) => setSel({ ...sel, [i.alunoId]: { marcado: true, rotaId: Number(e.target.value) } })}>
                      {rotas?.data.filter((r) => r.activa || r.id === i.rotaId).map((r) => <option key={r.id} value={r.id}>{r.codigo} ({r.ocupacao}/{r.capacidade})</option>)}
                    </Select>
                  </td>
                  <td>{i.aluno.encarregado ? `${i.aluno.encarregado.nome} · ${i.aluno.encarregado.telefone}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ))}
      <p className="mt-2 text-sm text-muted">O valor especial mantém-se se a rota não mudar. A confirmação cobra a taxa de confirmação configurada e as mensalidades desde o início do ano.</p>
    </>
  );
}
