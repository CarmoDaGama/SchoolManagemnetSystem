'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Bus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Utilizador } from '@/lib/types';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const qc = useQueryClient();
  const { data: empresa } = useQuery({
    queryKey: ['empresa-publico'],
    queryFn: () => api.get<{ nome: string; logotipo: string | null }>('/empresa/publico'),
  });
  const { register, handleSubmit, formState } = useForm<{ username: string; senha: string }>();
  const [erro, setErro] = useState<string | null>(null);

  const entrar = handleSubmit(async (v) => {
    setErro(null);
    try {
      const user = await api.post<Utilizador>('/auth/login', v);
      qc.setQueryData(['me'], user);
      window.location.href = '/painel/';
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {empresa?.logotipo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logotipo} alt="" className="mb-3 h-20 w-auto object-contain" />
          ) : (
            <div className="mb-3 rounded-full bg-primary-soft p-4 text-primary">
              <Bus className="size-8" />
            </div>
          )}
          <h1 className="text-xl font-bold">{empresa?.nome ?? 'Transporte Escolar'}</h1>
          <p className="text-sm text-muted">Entre com a sua conta</p>
        </div>
        <form onSubmit={entrar} className="space-y-4">
          <Field label="Utilizador">
            <Input autoFocus autoComplete="username" {...register('username', { required: true })} />
          </Field>
          <Field label="Senha">
            <Input type="password" autoComplete="current-password" {...register('senha', { required: true })} />
          </Field>
          {erro && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</p>}
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>Entrar</Button>
        </form>
      </div>
    </main>
  );
}
