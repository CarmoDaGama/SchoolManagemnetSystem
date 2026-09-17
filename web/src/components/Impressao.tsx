'use client';

import { ReactNode, useEffect } from 'react';
import { Printer } from 'lucide-react';
import type { Empresa } from '@/lib/types';
import { Button, Spinner } from './ui';

export function CabecalhoEmpresa({ empresa, titulo, subtitulo, compacto }: {
  empresa: Pick<Empresa, 'nome' | 'logotipo' | 'nif' | 'endereco' | 'telefone' | 'email'>;
  titulo?: string; subtitulo?: ReactNode; compacto?: boolean;
}) {
  return (
    <header className={`flex items-center gap-4 border-b-2 border-black ${compacto ? 'pb-2 mb-2' : 'pb-3 mb-4'}`}>
      {empresa.logotipo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={empresa.logotipo} alt="" className={compacto ? 'h-12 w-auto' : 'h-16 w-auto'} />
      )}
      <div className="flex-1">
        <p className={`font-bold ${compacto ? 'text-base' : 'text-lg'}`}>{empresa.nome}</p>
        <p className="text-xs">
          {[empresa.nif && `NIF ${empresa.nif}`, empresa.endereco, empresa.telefone && `Tel. ${empresa.telefone}`, empresa.email].filter(Boolean).join(' · ')}
        </p>
      </div>
      {titulo && (
        <div className="text-right">
          <p className={`font-bold uppercase ${compacto ? 'text-sm' : 'text-base'}`}>{titulo}</p>
          {subtitulo && <div className="text-xs">{subtitulo}</div>}
        </div>
      )}
    </header>
  );
}

/** Moldura das páginas de impressão: barra com botão (não impressa) e folha branca. */
export function FolhaImpressao({ children, loading, className = '', autoPrint, largura = 'max-w-[210mm]' }: {
  children: ReactNode; loading?: boolean; className?: string; autoPrint?: boolean; largura?: string;
}) {
  useEffect(() => {
    if (autoPrint && !loading) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint, loading]);

  return (
    <div className="min-h-screen bg-bg py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[297mm] justify-end gap-2 px-4">
        <Button variant="secondary" onClick={() => window.close()}>Fechar</Button>
        <Button onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>
      </div>
      {loading ? <Spinner /> : (
        <div className={`print-page mx-auto bg-white p-8 text-black shadow ${largura} ${className}`}>{children}</div>
      )}
    </div>
  );
}
