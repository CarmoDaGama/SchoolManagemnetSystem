'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Lista } from './api';
import type { AnoLectivo, Rota } from './types';

export function useLista<T>(key: unknown[], path: string, enabled = true) {
  return useQuery({ queryKey: key, queryFn: () => api.get<Lista<T>>(path), enabled });
}

export const useAnos = () => useLista<AnoLectivo>(['anos'], '/anos-lectivos');
export const useRotas = () => useLista<Rota>(['rotas'], '/rotas');
export const useAnoActivo = () =>
  useQuery({ queryKey: ['ano-activo'], queryFn: () => api.get<AnoLectivo | null>('/anos-lectivos/activo') });
export const useSugestoes = () =>
  useQuery({ queryKey: ['sugestoes'], queryFn: () => api.get<{ colegios: string[]; classes: string[] }>('/alunos/sugestoes') });

/** Invalida um conjunto de chaves depois de uma escrita. */
export function useInvalidar() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
