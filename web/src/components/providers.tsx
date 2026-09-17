'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { api } from '@/lib/api';
import type { Empresa, Utilizador } from '@/lib/types';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

export function useSessao() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Utilizador>('/auth/me'), staleTime: 5 * 60_000 });
}

export function useEmpresa() {
  return useQuery({ queryKey: ['empresa'], queryFn: () => api.get<Empresa>('/empresa'), staleTime: 5 * 60_000 });
}

export const useAdmin = () => useSessao().data?.role === 'ADMIN';
