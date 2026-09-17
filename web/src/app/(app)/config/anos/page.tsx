'use client';

import { AnosLectivos } from '@/components/config/AnosLectivos';
import { PageHeader } from '@/components/ui';

export default function AnosPage() {
  return (
    <>
      <PageHeader title="Anos lectivos" subtitle="Só um ano fica activo. As inscrições e as mensalidades usam o ano activo." />
      <AnosLectivos />
    </>
  );
}
