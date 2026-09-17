'use client';

import { toast } from 'sonner';
import { AlunoForm } from '@/components/AlunoForm';
import { PageHeader } from '@/components/ui';

export default function NovoAlunoPage() {
  return (
    <>
      <PageHeader title="Novo aluno" subtitle="O nº do aluno é gerado automaticamente. A inscrição gera as mensalidades do ano lectivo activo." />
      <AlunoForm
        comInscricao
        onSaved={(a) => {
          toast.success(`Aluno ${a.nome} registado (${a.numero}).`);
          window.location.href = `/alunos/ver/?id=${a.id}&tab=pagamentos`;
        }}
      />
    </>
  );
}
