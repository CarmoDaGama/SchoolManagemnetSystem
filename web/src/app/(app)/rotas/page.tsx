'use client';

import { useState } from 'react';
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { kz, mesActual, TURNOS } from '@/lib/format';
import { useInvalidar, useRotas } from '@/lib/hooks';
import type { Rota } from '@/lib/types';
import { useAdmin } from '@/components/providers';
import { ConfirmDialog, FormDialog } from '@/components/FormDialog';
import { Badge, Button, Empty, PageHeader, Spinner, Table } from '@/components/ui';

export default function RotasPage() {
  const admin = useAdmin();
  const { data: lista, isLoading } = useRotas();
  const invalidar = useInvalidar();
  const [edit, setEdit] = useState<Rota | 'novo' | null>(null);
  const [remover, setRemover] = useState<Rota | null>(null);
  const [aplicar, setAplicar] = useState<Rota | null>(null);
  const refresh = () => invalidar('rotas', 'painel');

  return (
    <>
      <PageHeader
        title="Rotas"
        subtitle="Ocupação no ano lectivo activo. O valor mensal é copiado para cada inscrição nova."
        actions={admin && <Button onClick={() => setEdit('novo')}><Plus className="size-4" /> Nova rota</Button>}
      />
      {isLoading ? <Spinner /> : !lista?.data.length ? <Empty>Ainda não há rotas.</Empty> : (
        <Table>
          <thead><tr><th>Código</th><th>Nome</th><th>Turno</th><th>Motorista</th><th>Viatura</th><th>Ocupação</th><th className="text-right">Mensalidade</th><th /></tr></thead>
          <tbody>
            {lista.data.map((r) => (
              <tr key={r.id} className={r.activa ? '' : 'text-muted'}>
                <td className="font-mono font-semibold">{r.codigo}</td>
                <td>{r.nome} {!r.activa && <Badge>Inactiva</Badge>}</td>
                <td>{TURNOS[r.turno]}</td>
                <td>{r.motorista ?? '—'}{r.telefoneMotorista && <span className="block text-xs text-muted">{r.telefoneMotorista}</span>}</td>
                <td>{r.viatura ?? '—'}</td>
                <td><Badge tone={(r.ocupacao ?? 0) >= r.capacidade ? 'red' : 'neutral'}>{r.ocupacao ?? 0} / {r.capacidade}</Badge></td>
                <td className="text-right">{kz(r.valorMensal)}</td>
                <td className="text-right whitespace-nowrap">
                  <a href={`/rotas/ver/?id=${r.id}`} className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-sm text-muted hover:bg-primary-soft hover:text-ink"><Eye className="size-4" /> Alunos</a>
                  {admin && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setAplicar(r)} title="Aplicar valor às mensalidades pendentes"><RefreshCw className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label="Editar"><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemover(r)} aria-label="Remover"><Trash2 className="size-4" /></Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <FormDialog
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit === 'novo' ? 'Nova rota' : 'Editar rota'}
        fields={[
          { name: 'codigo', label: 'Código', required: true, hint: 'Ex.: R01' },
          { name: 'nome', label: 'Nome', required: true, hint: 'Ex.: Talatona – Morro Bento' },
          { name: 'turno', label: 'Turno', type: 'select', required: true, options: Object.entries(TURNOS).map(([value, label]) => ({ value, label })) },
          { name: 'valorMensal', label: 'Mensalidade (Kz)', type: 'number', step: '0.01', min: 0, required: true },
          { name: 'motorista', label: 'Motorista' },
          { name: 'telefoneMotorista', label: 'Telefone do motorista' },
          { name: 'viatura', label: 'Viatura', hint: 'Matrícula ou descrição' },
          { name: 'capacidade', label: 'Lugares', type: 'number', min: 1, required: true },
          { name: 'paragens', label: 'Paragens', type: 'textarea' },
          { name: 'activaStr', label: 'Estado', type: 'select', required: true, options: [{ value: 'true', label: 'Activa' }, { value: 'false', label: 'Inactiva' }] },
        ]}
        initial={edit && edit !== 'novo' ? { ...edit, valorMensal: Number(edit.valorMensal), activaStr: String(edit.activa) } : { turno: 'MANHA_E_TARDE', capacidade: 30, activaStr: 'true' }}
        onSubmit={async ({ activaStr, ...v }) => {
          const body = { ...v, activa: activaStr === 'true' };
          if (edit === 'novo') await api.post('/rotas', body);
          else if (edit) await api.patch(`/rotas/${edit.id}`, body);
          await refresh();
          toast.success(edit !== 'novo' ? 'Rota guardada. O novo valor só se aplica a inscrições novas; use o botão ↻ para as pendentes.' : 'Rota criada.');
        }}
      />
      <FormDialog
        open={!!aplicar}
        onClose={() => setAplicar(null)}
        title={`Aplicar ${kz(aplicar?.valorMensal)} às mensalidades pendentes da ${aplicar?.codigo ?? ''}`}
        submitLabel="Aplicar"
        fields={[{ name: 'aPartirDe', label: 'A partir do mês', type: 'month', required: true, full: true, hint: 'Alunos com valor especial não são afectados. Meses pagos não mudam.' }]}
        initial={{ aPartirDe: mesActual() }}
        onSubmit={async (v) => {
          const r = await api.post<{ inscricoes: number; mensalidades: number }>(`/rotas/${aplicar!.id}/aplicar-valor`, v);
          toast.success(`${r.mensalidades} mensalidades actualizadas em ${r.inscricoes} alunos.`);
          await invalidar('mapa', 'extracto');
        }}
      />
      <ConfirmDialog
        open={!!remover}
        onClose={() => setRemover(null)}
        title="Remover rota"
        danger
        confirmLabel="Remover"
        message={<>Remover a rota <b>{remover?.codigo}</b>? Só é possível se nunca teve inscrições; caso contrário marque-a como inactiva.</>}
        onConfirm={async () => { await api.del(`/rotas/${remover!.id}`); await refresh(); }}
      />
    </>
  );
}
