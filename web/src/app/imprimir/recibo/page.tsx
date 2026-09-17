'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { data, dataHora, kz, METODOS } from '@/lib/format';
import type { Aluno, Empresa, Rota } from '@/lib/types';
import { CabecalhoEmpresa, FolhaImpressao } from '@/components/Impressao';
import { useEmpresa } from '@/components/providers';
import { Spinner } from '@/components/ui';

type Recibo = {
  id: number; numeroRecibo: string; data: string; metodo: string; referenciaBanc: string | null;
  subtotal: string; multa: string; desconto: string; total: string; estado: 'VALIDO' | 'ANULADO';
  motivoAnulacao: string | null; anuladoEm: string | null;
  itens: { id: number; valor: string; multa: string; cobranca: { descricao: string; vencimento: string } }[];
  inscricao: { aluno: Aluno; rota: Rota; anoLectivo: { nome: string } };
  utilizador: { nome: string };
};

export default function Page() {
  return <Suspense fallback={<Spinner />}><ReciboPage /></Suspense>;
}

function ReciboPage() {
  const id = Number(useSearchParams().get('id'));
  const { data: empresa } = useEmpresa();
  const { data: r } = useQuery({ queryKey: ['recibo', id], queryFn: () => api.get<Recibo>(`/financeiro/pagamentos/${id}`), enabled: !!id });
  const pronto = !!(r && empresa);

  return (
    <FolhaImpressao loading={!pronto} autoPrint className="recibo-page" largura="max-w-[200mm]">
      {pronto && (
        <>
          <Via recibo={r} empresa={empresa} via="Original" />
          <div className="my-4 border-t border-dashed border-black print:my-3" />
          <Via recibo={r} empresa={empresa} via="Duplicado" />
        </>
      )}
    </FolhaImpressao>
  );
}

function Via({ recibo: r, empresa, via }: { recibo: Recibo; empresa: Empresa; via: string }) {
  const i = r.inscricao;
  return (
    <section className="relative text-[9.5pt] leading-snug">
      {r.estado === 'ANULADO' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-18deg] border-4 border-red-600 px-4 text-4xl font-black tracking-widest text-red-600 opacity-60">ANULADO</span>
        </div>
      )}
      <CabecalhoEmpresa empresa={empresa} compacto titulo={`Recibo ${r.numeroRecibo}`} subtitulo={<>{dataHora(r.data)} · {via}</>} />
      <div className="mb-2 grid grid-cols-2 gap-x-4">
        <p><b>Aluno:</b> {i.aluno.nome} ({i.aluno.numero})</p>
        <p><b>Encarregado:</b> {i.aluno.encarregado?.nome ?? '—'}</p>
        <p><b>Rota:</b> {i.rota.codigo} — {i.rota.nome}</p>
        <p><b>Ano lectivo:</b> {i.anoLectivo.nome}</p>
      </div>
      <table className="w-full border-collapse [&_td]:border [&_td]:border-black [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:border-black [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left">
        <thead><tr><th>Descrição</th><th>Vencimento</th><th className="text-right">Valor</th><th className="text-right">Multa</th></tr></thead>
        <tbody>
          {r.itens.map((it) => (
            <tr key={it.id}>
              <td>{it.cobranca.descricao}</td>
              <td>{data(it.cobranca.vencimento)}</td>
              <td className="text-right">{kz(it.valor, empresa.moeda)}</td>
              <td className="text-right">{Number(it.multa) ? kz(it.multa, empresa.moeda) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-between gap-4">
        <div>
          <p><b>Método:</b> {METODOS[r.metodo]}{r.referenciaBanc && ` · Ref. ${r.referenciaBanc}`}</p>
          <p><b>Recebido por:</b> {r.utilizador.nome}</p>
          {r.estado === 'ANULADO' && <p className="text-red-700"><b>Anulado</b> em {dataHora(r.anuladoEm)}: {r.motivoAnulacao}</p>}
        </div>
        <table className="text-right [&_td]:pl-4">
          <tbody>
            <tr><td>Subtotal</td><td>{kz(r.subtotal, empresa.moeda)}</td></tr>
            {Number(r.multa) > 0 && <tr><td>Multa</td><td>{kz(r.multa, empresa.moeda)}</td></tr>}
            {Number(r.desconto) > 0 && <tr><td>Desconto</td><td>− {kz(r.desconto, empresa.moeda)}</td></tr>}
            <tr className="text-[11pt] font-bold"><td>Total</td><td>{kz(r.total, empresa.moeda)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex justify-between text-[8pt]">
        <p>Comprovativo interno de pagamento. Não serve de factura.</p>
        <p className="w-48 border-t border-black pt-0.5 text-center">Assinatura</p>
      </div>
    </section>
  );
}
