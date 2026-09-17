'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Empresa } from '@/lib/types';
import { useInvalidar } from '@/lib/hooks';
import { LogoUpload } from '@/components/LogoUpload';
import { Alert, Button, Card, Field, Input, Select, cn } from '@/components/ui';

export function EmpresaForm({ empresa }: { empresa: Empresa }) {
  const invalidar = useInvalidar();
  const [tab, setTab] = useState<'dados' | 'financeiro'>('dados');
  const [logo, setLogo] = useState<string | null>(empresa.logotipo);
  const { register, handleSubmit, reset, watch, formState } = useForm<Empresa>({ defaultValues: empresa });
  useEffect(() => {
    reset(empresa);
    setLogo(empresa.logotipo);
  }, [empresa, reset]);
  const tipoMulta = watch('tipoMulta');

  const guardar = handleSubmit(async (v) => {
    try {
      await api.put('/empresa', {
        nome: v.nome, nif: v.nif || null, endereco: v.endereco || null, telefone: v.telefone || null, email: v.email || null,
        logotipo: logo, moeda: v.moeda || 'Kz',
        diaLimite: Number(v.diaLimite), diasTolerancia: Number(v.diasTolerancia),
        tipoMulta: v.tipoMulta, multaValor: Number(v.multaValor),
        taxaInscricao: Number(v.taxaInscricao), taxaConfirmacao: Number(v.taxaConfirmacao),
      });
      await invalidar('empresa', 'empresa-publico');
      toast.success('Dados da empresa guardados.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <form onSubmit={guardar} className="max-w-3xl space-y-4">
      <div className="flex gap-1 border-b border-line">
        {(['dados', 'financeiro'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm', tab === t ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted')}>
            {t === 'dados' ? 'Dados' : 'Financeiro'}
          </button>
        ))}
      </div>
      <Card>
        <div className={cn('grid gap-4 sm:grid-cols-2', tab !== 'dados' && 'hidden')}>
          <Field label="Nome da empresa" className="sm:col-span-2" error={formState.errors.nome?.message}>
            <Input {...register('nome', { required: 'Indique o nome da empresa.' })} />
          </Field>
          <Field label="NIF"><Input {...register('nif')} /></Field>
          <Field label="Telefone"><Input {...register('telefone')} /></Field>
          <Field label="E-mail"><Input type="email" {...register('email')} /></Field>
          <Field label="Endereço"><Input {...register('endereco')} /></Field>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-medium">Logótipo</p>
            <LogoUpload value={logo} onChange={setLogo} onError={(m) => toast.error(m)} />
          </div>
        </div>
        <div className={cn('grid gap-4 sm:grid-cols-2', tab !== 'financeiro' && 'hidden')}>
          <Field label="Dia limite de pagamento" hint="Se o mês for mais curto, vence no último dia.">
            <Input type="number" min={1} max={31} {...register('diaLimite', { required: true })} />
          </Field>
          <Field label="Dias de tolerância" hint="Dias após o vencimento sem multa.">
            <Input type="number" min={0} max={60} {...register('diasTolerancia', { required: true })} />
          </Field>
          <Field label="Tipo de multa">
            <Select {...register('tipoMulta')}>
              <option value="PERCENTAGEM">Percentagem da mensalidade</option>
              <option value="VALOR_FIXO">Valor fixo</option>
            </Select>
          </Field>
          <Field label={tipoMulta === 'VALOR_FIXO' ? 'Valor da multa (Kz)' : 'Multa (%)'} hint="0 = sem multa">
            <Input type="number" step="0.01" min={0} {...register('multaValor', { required: true })} />
          </Field>
          <Field label="Taxa de inscrição (Kz)" hint="0 = não cobra">
            <Input type="number" step="0.01" min={0} {...register('taxaInscricao', { required: true })} />
          </Field>
          <Field label="Taxa de confirmação (Kz)" hint="0 = não cobra">
            <Input type="number" step="0.01" min={0} {...register('taxaConfirmacao', { required: true })} />
          </Field>
          <Field label="Moeda"><Input {...register('moeda')} /></Field>
          <div className="sm:col-span-2">
            <Alert tone="amber">A multa é calculada por cada mês em atraso, com as regras em vigor no dia do pagamento. As taxas aplicam-se a inscrições e confirmações novas.</Alert>
          </div>
        </div>
      </Card>
      <Button type="submit" loading={formState.isSubmitting}>Guardar</Button>
    </form>
  );
}
