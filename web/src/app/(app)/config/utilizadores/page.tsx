'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ROLES } from '@/lib/format';
import { useInvalidar, useLista } from '@/lib/hooks';
import type { Utilizador } from '@/lib/types';
import { ConfirmDialog, FormDialog } from '@/components/FormDialog';
import { Badge, Button, PageHeader, Spinner, Table } from '@/components/ui';

const roleOptions = Object.entries(ROLES).map(([value, label]) => ({ value, label }));

export default function UtilizadoresPage() {
  const { data: lista, isLoading } = useLista<Utilizador>(['utilizadores'], '/utilizadores');
  const invalidar = useInvalidar();
  const [edit, setEdit] = useState<Utilizador | 'novo' | null>(null);
  const [remover, setRemover] = useState<Utilizador | null>(null);

  return (
    <>
      <PageHeader
        title="Utilizadores"
        subtitle="O operador não acede a configuração, anulações, isenções, valores especiais nem cópias de segurança."
        actions={<Button onClick={() => setEdit('novo')}><Plus className="size-4" /> Novo utilizador</Button>}
      />
      {isLoading ? <Spinner /> : (
        <Table>
          <thead><tr><th>Nome</th><th>Utilizador</th><th>Perfil</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {lista?.data.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.nome}</td>
                <td>{u.username}</td>
                <td>{ROLES[u.role]}</td>
                <td>{u.activo ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(u)} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemover(u)} aria-label="Remover"><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <FormDialog
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit === 'novo' ? 'Novo utilizador' : 'Editar utilizador'}
        fields={edit === 'novo' ? [
          { name: 'nome', label: 'Nome', required: true, full: true },
          { name: 'username', label: 'Utilizador', required: true },
          { name: 'role', label: 'Perfil', type: 'select', required: true, options: roleOptions },
          { name: 'senha', label: 'Senha', type: 'password', required: true, hint: 'Mínimo 6 caracteres' },
        ] : [
          { name: 'nome', label: 'Nome', required: true, full: true },
          { name: 'role', label: 'Perfil', type: 'select', required: true, options: roleOptions },
          { name: 'activo', label: 'Estado', type: 'select', required: true, options: [{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }] },
          { name: 'senha', label: 'Nova senha', type: 'password', hint: 'Deixe em branco para manter' },
        ]}
        initial={edit && edit !== 'novo' ? { ...edit, activo: String(edit.activo) } : { role: 'OPERADOR' }}
        onSubmit={async (v) => {
          if (edit === 'novo') await api.post('/utilizadores', v);
          else if (edit) {
            const body: Record<string, unknown> = { nome: v.nome, role: v.role, activo: v.activo === 'true' };
            if (v.senha) body.senha = v.senha;
            await api.patch(`/utilizadores/${edit.id}`, body);
          }
          await invalidar('utilizadores');
          toast.success('Utilizador guardado.');
        }}
      />
      <ConfirmDialog
        open={!!remover}
        onClose={() => setRemover(null)}
        title="Remover utilizador"
        danger
        confirmLabel="Remover"
        message={<>Remover <b>{remover?.nome}</b>? Se já registou pagamentos, a conta é apenas desactivada.</>}
        onConfirm={async () => { await api.del(`/utilizadores/${remover!.id}`); await invalidar('utilizadores'); }}
      />
    </>
  );
}
