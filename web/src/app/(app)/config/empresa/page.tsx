'use client';

import { useEmpresa } from '@/components/providers';
import { EmpresaForm } from '@/components/config/EmpresaForm';
import { PageHeader, Spinner } from '@/components/ui';

export default function EmpresaPage() {
  const { data, isLoading } = useEmpresa();
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Empresa" subtitle="Dados que aparecem no login, recibos e listas, e parâmetros financeiros." />
      <EmpresaForm empresa={data} />
    </>
  );
}
