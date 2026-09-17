'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { ESTADO_MES, mesActual, SENTIDOS, TURNOS } from '@/lib/format';
import type { Aluno, EstadoVisivel, Inscricao, Mes, Rota } from '@/lib/types';
import { CabecalhoEmpresa, FolhaImpressao } from '@/components/Impressao';
import { useEmpresa } from '@/components/providers';
import { Spinner } from '@/components/ui';

type ListaRota = {
  rota: Rota;
  anoLectivo: { nome: string } | null;
  mes: Mes;
  data: (Inscricao & { aluno: Aluno; situacaoMes: EstadoVisivel | null })[];
};

export default function Page() {
  return <Suspense fallback={<Spinner />}><ListaRotaPage /></Suspense>;
}

/** Lista para o motorista: só o necessário (dados pessoais de menores). */
function ListaRotaPage() {
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const mes = params.get('mes') ?? mesActual();
  const { data: empresa } = useEmpresa();
  const { data: l } = useQuery({ queryKey: ['rota-alunos', id, mes], queryFn: () => api.get<ListaRota>(`/rotas/${id}/alunos?mes=${mes}`), enabled: !!id });
  const pronto = !!(l && empresa);

  return (
    <FolhaImpressao loading={!pronto}>
      {pronto && (
        <div className="text-[10pt]">
          <CabecalhoEmpresa empresa={empresa} titulo={`Rota ${l.rota.codigo}`} subtitulo={<>{l.rota.nome} · {TURNOS[l.rota.turno]} · {l.anoLectivo?.nome}</>} />
          <p className="mb-2">
            <b>Motorista:</b> {l.rota.motorista ?? '—'}{l.rota.telefoneMotorista && ` (${l.rota.telefoneMotorista})`} · <b>Viatura:</b> {l.rota.viatura ?? '—'} · <b>Alunos:</b> {l.data.length}/{l.rota.capacidade}
          </p>
          <table className="w-full border-collapse [&_td]:border [&_td]:border-black [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-black [&_th]:bg-gray-100 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left">
            <thead><tr><th className="w-8">Nº</th><th className="w-14">Hora</th><th>Aluno</th><th>Colégio / classe</th><th>Ponto de recolha</th><th>Sentido</th><th>Encarregado · telefone</th><th className="w-16">{l.mes.nome.split(' ')[0].slice(0, 3)}.</th></tr></thead>
            <tbody>
              {l.data.map((i, n) => (
                <tr key={i.id}>
                  <td>{n + 1}</td>
                  <td>{i.horaRecolha ?? ''}</td>
                  <td>{i.aluno.nome}</td>
                  <td>{[i.aluno.colegio, i.aluno.classe].filter(Boolean).join(' · ')}</td>
                  <td>{i.pontoRecolha ?? i.aluno.pontoReferencia ?? ''}</td>
                  <td>{SENTIDOS[i.sentido]}</td>
                  <td>{i.aluno.encarregado ? `${i.aluno.encarregado.nome} · ${i.aluno.encarregado.telefone}` : ''}</td>
                  <td className="text-center">{i.situacaoMes ? `${ESTADO_MES[i.situacaoMes].simbolo} ${ESTADO_MES[i.situacaoMes].texto}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[8pt]">✓ pago · ! em atraso · · por pagar · I isento · — sem serviço. Emitido em {new Date().toLocaleString('pt-PT')}. Documento com dados pessoais de menores: não deixar no veículo.</p>
        </div>
      )}
    </FolhaImpressao>
  );
}
