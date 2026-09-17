'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Coins, Printer } from 'lucide-react';
import Decimal from 'decimal.js';
import { api, qs } from '@/lib/api';
import { ESTADO_MES, ESTADOS_INSCRICAO, kz, mesCurto } from '@/lib/format';
import { useAnos, useInvalidar, useRotas } from '@/lib/hooks';
import type { AnoLectivo, EstadoVisivel, Mes } from '@/lib/types';
import { useAdmin, useEmpresa } from '@/components/providers';
import { AccoesMes } from '@/components/Extracto';
import { CabecalhoEmpresa } from '@/components/Impressao';
import { Badge, Button, Empty, Field, Modal, PageHeader, Select, Spinner, cn } from '@/components/ui';

type Celula = { cobrancaId: number; valor: string; estado: EstadoVisivel; motivo: string | null };
type Linha = {
  inscricaoId: number; aluno: { id: number; numero: string; nome: string }; rota: { id: number; codigo: string };
  estadoInscricao: string; mesEntrada: string; valorMensal: string; meses: Record<string, Celula>;
};
type Mapa = { anoLectivo: AnoLectivo | null; meses: Mes[]; linhas: Linha[] };

const ESTADO_CELULA: Record<EstadoVisivel, string> = { PAGA: 'PENDENTE', ATRASO: 'PENDENTE', POR_PAGAR: 'PENDENTE', ISENTA: 'ISENTA', ANULADA: 'ANULADA' };

export default function MapaPage() {
  const admin = useAdmin();
  const invalidar = useInvalidar();
  const { data: empresa } = useEmpresa();
  const { data: anos } = useAnos();
  const { data: rotas } = useRotas();
  const [anoId, setAnoId] = useState('');
  const [rotaId, setRotaId] = useState('');
  const [filtro, setFiltro] = useState<'' | 'ATRASO'>('');
  const [celula, setCelula] = useState<{ linha: Linha; mes: Mes; c: Celula | undefined } | null>(null);
  const [accao, setAccao] = useState<{ id: number; descricao: string; estado: 'PENDENTE' | 'ISENTA' | 'ANULADA' | 'PAGA' } | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mapa', anoId, rotaId],
    queryFn: () => api.get<Mapa>(`/cobrancas/mapa${qs({ anoLectivoId: anoId, rotaId })}`),
  });

  const linhas = useMemo(
    () => (data?.linhas ?? []).filter((l) => !filtro || Object.values(l.meses).some((c) => c.estado === filtro)),
    [data, filtro],
  );
  const totais = useMemo(() => {
    const t: Record<string, { pagos: number; atraso: number; recebido: Decimal }> = {};
    for (const m of data?.meses ?? []) t[m.chave] = { pagos: 0, atraso: 0, recebido: new Decimal(0) };
    for (const l of linhas) {
      for (const [k, c] of Object.entries(l.meses)) {
        if (!t[k]) continue;
        if (c.estado === 'PAGA') { t[k].pagos++; t[k].recebido = t[k].recebido.add(c.valor); }
        if (c.estado === 'ATRASO') t[k].atraso++;
      }
    }
    return t;
  }, [data, linhas]);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Mapa mensal"
          subtitle="Registo do mês de cada aluno. Clique numa célula para receber ou gerir o mês."
          actions={<Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>}
        />
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Ano lectivo">
            <Select className="w-40" value={anoId} onChange={(e) => setAnoId(e.target.value)}>
              <option value="">Activo</option>
              {anos?.data.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </Select>
          </Field>
          <Field label="Rota">
            <Select className="w-52" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">Todas as rotas</option>
              {rotas?.data.map((r) => <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>)}
            </Select>
          </Field>
          <Field label="Mostrar">
            <Select className="w-52" value={filtro} onChange={(e) => setFiltro(e.target.value as '' | 'ATRASO')}>
              <option value="">Todos os alunos</option>
              <option value="ATRASO">Só com meses em atraso</option>
            </Select>
          </Field>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {(Object.keys(ESTADO_MES) as EstadoVisivel[]).map((k) => (
            <span key={k} className={cn('rounded px-2 py-0.5', ESTADO_MES[k].cls)}>{ESTADO_MES[k].simbolo} {ESTADO_MES[k].texto}</span>
          ))}
          <span className="rounded border border-dashed border-line px-2 py-0.5 text-muted">vazio = antes da entrada</span>
        </div>
      </div>
      <div className="hidden print:block">
        {empresa && data?.anoLectivo && <CabecalhoEmpresa empresa={empresa} compacto titulo="Mapa mensal" subtitulo={<>{data.anoLectivo.nome} · {rotaId ? `Rota ${rotas?.data.find((r) => r.id === Number(rotaId))?.codigo}` : 'Todas as rotas'} · {new Date().toLocaleDateString('pt-PT')}</>} />}
      </div>

      {isLoading || !data ? <Spinner /> : !data.anoLectivo ? <Empty>Não há ano lectivo activo.</Empty> : !linhas.length ? <Empty>Sem alunos para mostrar.</Empty> : (
        <div className="mapa-page overflow-x-auto rounded-lg border border-line bg-white print:overflow-visible print:border-0">
          <table className="w-full border-collapse text-xs print:text-[7.5pt]">
            <thead>
              <tr className="bg-bg">
                <th className="sticky left-0 z-10 min-w-48 border-b border-r border-line bg-bg px-2 py-2 text-left">Aluno</th>
                <th className="border-b border-line px-2 text-left">Rota</th>
                {data.meses.map((m) => <th key={m.chave} className="border-b border-line px-1 py-2 text-center whitespace-nowrap">{mesCurto(m.chave)}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.inscricaoId} className="hover:bg-bg/60">
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-white px-2 py-1">
                    <a href={`/alunos/ver/?id=${l.aluno.id}&tab=pagamentos`} className="font-medium text-primary hover:underline">{l.aluno.nome}</a>
                    {l.estadoInscricao !== 'ACTIVA' && <> <Badge tone="amber">{ESTADOS_INSCRICAO[l.estadoInscricao]}</Badge></>}
                  </td>
                  <td className="border-b border-line px-2">{l.rota.codigo}</td>
                  {data.meses.map((m) => {
                    const c = l.meses[m.chave];
                    const e = c ? ESTADO_MES[c.estado] : null;
                    return (
                      <td key={m.chave} className="border-b border-line p-0.5 text-center">
                        <button
                          onClick={() => setCelula({ linha: l, mes: m, c })}
                          title={c ? `${m.nome}: ${e!.texto} · ${kz(c.valor)}${c.motivo ? ` · ${c.motivo}` : ''}` : `${m.nome}: sem registo`}
                          className={cn('h-7 w-full min-w-9 rounded text-sm print:h-5', e ? e.cls : 'border border-dashed border-line text-muted')}
                        >
                          {e?.simbolo ?? ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-bg font-semibold">
                <td className="sticky left-0 z-10 border-r border-line bg-bg px-2 py-2" colSpan={2}>Pagos · em atraso · recebido</td>
                {data.meses.map((m) => (
                  <td key={m.chave} className="px-1 py-1 text-center text-[10px] leading-tight whitespace-nowrap">
                    <span className="text-success">✓{totais[m.chave].pagos}</span> <span className="text-danger">!{totais[m.chave].atraso}</span>
                    <span className="block text-muted">{Math.round(totais[m.chave].recebido.toNumber() / 1000)}k</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">{linhas.length} alunos</p>

      <Modal open={!!celula} onClose={() => setCelula(null)} title={celula ? `${celula.linha.aluno.nome} — ${celula.mes.nome}` : ''}>
        {celula && (
          <div className="space-y-3 text-sm">
            {celula.c ? (
              <p>
                <Badge tone={ESTADO_MES[celula.c.estado].tone}>{ESTADO_MES[celula.c.estado].simbolo} {ESTADO_MES[celula.c.estado].texto}</Badge> · {kz(celula.c.valor)}
                {celula.c.motivo && <span className="block text-muted">Motivo: {celula.c.motivo}</span>}
              </p>
            ) : (
              <p className="text-muted">Sem mensalidade neste mês (antes da entrada em {celula.linha.mesEntrada}). {admin && 'Pode acrescentá-lo na ficha do aluno › Inscrição.'}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {celula.c && (celula.c.estado === 'ATRASO' || celula.c.estado === 'POR_PAGAR') && (
                <a href={`/pagamentos/receber/?alunoId=${celula.linha.aluno.id}`}><Button><Coins className="size-4" /> Receber</Button></a>
              )}
              {admin && celula.c && celula.c.estado !== 'PAGA' && (
                <Button variant="secondary" onClick={() => {
                  setAccao({ id: celula.c!.cobrancaId, descricao: `${celula.linha.aluno.nome} — ${celula.mes.nome}`, estado: ESTADO_CELULA[celula.c!.estado] as 'PENDENTE' });
                  setCelula(null);
                }}>
                  {celula.c.estado === 'ISENTA' || celula.c.estado === 'ANULADA' ? 'Reabrir mês' : 'Isentar ou retirar'}
                </Button>
              )}
              <a href={`/alunos/ver/?id=${celula.linha.aluno.id}&tab=pagamentos`}><Button variant="ghost">Abrir ficha</Button></a>
            </div>
          </div>
        )}
      </Modal>
      <AccoesMes cobranca={accao} onClose={() => setAccao(null)} onDone={async () => { await refetch(); await invalidar('devedores', 'painel', 'extracto'); }} />
    </>
  );
}
