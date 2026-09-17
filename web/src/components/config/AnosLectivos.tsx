'use client';

import { useState } from 'react';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { MESES } from '@/lib/format';
import { useAnos, useInvalidar } from '@/lib/hooks';
import type { AnoLectivo } from '@/lib/types';
import { ConfirmDialog, FormDialog } from '@/components/FormDialog';
import { Badge, Button, Empty, Spinner, Table } from '@/components/ui';

export function AnosLectivos() {
  const { data: lista, isLoading } = useAnos();
  const invalidar = useInvalidar();
  const [edit, setEdit] = useState<AnoLectivo | 'novo' | null>(null);
  const [remover, setRemover] = useState<AnoLectivo | null>(null);
  const refresh = () => invalidar('anos', 'ano-activo', 'rotas', 'painel', 'mapa');
  const anoSeguinte = (lista?.data[0]?.anoInicio ?? new Date().getFullYear() - 1) + 1;

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <Button onClick={() => setEdit('novo')}><Plus className="size-4" /> Novo ano lectivo</Button>
      {!lista?.data.length ? (
        <Empty>Ainda não há anos lectivos.</Empty>
      ) : (
        <Table>
          <thead><tr><th>Nome</th><th>Meses cobrados</th><th>Inscrições</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {lista.data.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.nome}</td>
                <td>{a.mesesServico} ({a.meses[0]?.nome} a {a.meses[a.meses.length - 1]?.nome})</td>
                <td>{a._count?.inscricoes ?? 0}</td>
                <td>{a.activo ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td className="text-right whitespace-nowrap">
                  {!a.activo && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try { await api.post(`/anos-lectivos/${a.id}/activar`); await refresh(); toast.success(`${a.nome} é agora o ano activo.`); }
                      catch (e) { toast.error((e as Error).message); }
                    }}><CheckCircle2 className="size-4" /> Activar</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemover(a)} aria-label="Remover"><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-sm text-muted">Para confirmar alunos no ano seguinte: crie o novo ano, active-o e use o ecrã Confirmações.</p>
      <FormDialog
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit === 'novo' ? 'Novo ano lectivo' : 'Editar ano lectivo'}
        fields={[
          { name: 'nome', label: 'Nome', required: true, hint: 'Ex.: 2026/2027', full: true },
          { name: 'anoInicio', label: 'Ano do 1.º mês', type: 'number', required: true, min: 2000, max: 2100 },
          { name: 'mesInicio', label: '1.º mês cobrado', type: 'select', required: true, options: MESES.map((m, i) => ({ value: i + 1, label: m })) },
          { name: 'mesesServico', label: 'Nº de mensalidades', type: 'number', required: true, min: 1, max: 12, hint: 'Ex.: 10 (Setembro a Junho)' },
        ]}
        initial={edit && edit !== 'novo' ? edit : { nome: `${anoSeguinte}/${anoSeguinte + 1}`, anoInicio: anoSeguinte, mesInicio: 9, mesesServico: 10 }}
        onSubmit={async (v) => {
          if (edit === 'novo') await api.post('/anos-lectivos', v);
          else if (edit) await api.patch(`/anos-lectivos/${edit.id}`, v);
          await refresh();
          toast.success('Ano lectivo guardado.');
        }}
      />
      <ConfirmDialog
        open={!!remover}
        onClose={() => setRemover(null)}
        title="Remover ano lectivo"
        danger
        confirmLabel="Remover"
        message={<>Remover o ano lectivo <b>{remover?.nome}</b>? Só é possível se não tiver inscrições.</>}
        onConfirm={async () => { await api.del(`/anos-lectivos/${remover!.id}`); await refresh(); }}
      />
    </div>
  );
}
