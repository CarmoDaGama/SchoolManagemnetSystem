'use client';

import { useRef, useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { useInvalidar, useRotas } from '@/lib/hooks';
import { Alert, Badge, Button, Card, PageHeader, Table } from '@/components/ui';

const COLUNAS = ['Nome', 'Colégio', 'Classe', 'Turma', 'Encarregado', 'Telefone', 'Rota (código)', 'Ponto de recolha', 'Hora', 'Mês de entrada (AAAA-MM)'];

type LinhaLida = {
  linha: number; nome: string; colegio: string; classe: string; turma: string; encarregado: string; telefone: string;
  rota: string; pontoRecolha: string; horaRecolha: string; mesEntrada: string; erros: string[];
};

const texto = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? '')).trim();

/** Excel guarda horas como fracção do dia e meses como datas: normalizar para HH:mm e AAAA-MM. */
function hora(v: unknown) {
  if (typeof v === 'number') {
    const min = Math.round(v * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  if (v instanceof Date) return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
  const s = texto(v).replace('h', ':');
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}
function mes(v: unknown) {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`;
  const s = texto(v);
  const anoMes = s.match(/^(\d{4})[-/](\d{1,2})/); // 2026-10 ou 2026/10
  if (anoMes) return `${anoMes[1]}-${anoMes[2].padStart(2, '0')}`;
  const mesAno = s.match(/^(\d{1,2})[-/](\d{4})$/); // 10/2026
  if (mesAno) return `${mesAno[2]}-${mesAno[1].padStart(2, '0')}`;
  return s;
}

async function lerAlunos(file: File, rotasValidas: Set<string>): Promise<LinhaLida[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return linhas
    .map((l, idx) => {
      const r: LinhaLida = {
        linha: idx + 2, nome: texto(l['Nome']), colegio: texto(l['Colégio']), classe: texto(l['Classe']), turma: texto(l['Turma']),
        encarregado: texto(l['Encarregado']), telefone: texto(l['Telefone']).replace(/\s/g, ''),
        rota: texto(l['Rota (código)']).toUpperCase(), pontoRecolha: texto(l['Ponto de recolha']),
        horaRecolha: l['Hora'] === '' ? '' : hora(l['Hora']), mesEntrada: l['Mês de entrada (AAAA-MM)'] === '' ? '' : mes(l['Mês de entrada (AAAA-MM)']),
        erros: [],
      };
      if (!r.nome) r.erros.push('Nome em falta');
      if (!r.rota) r.erros.push('Rota em falta');
      else if (!rotasValidas.has(r.rota)) r.erros.push(`Rota ${r.rota} não existe`);
      if (r.horaRecolha && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.horaRecolha)) r.erros.push('Hora inválida (HH:mm)');
      if (r.mesEntrada && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.mesEntrada)) r.erros.push('Mês inválido (AAAA-MM)');
      return r;
    })
    .filter((r) => Object.values(r).some((v) => typeof v === 'string' && v !== ''));
}

export default function ImportarPage() {
  const { data: rotas } = useRotas();
  const invalidar = useInvalidar();
  const ref = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaLida[]>([]);
  const [ficheiro, setFicheiro] = useState('');
  const [aImportar, setAImportar] = useState(false);
  const [resultado, setResultado] = useState<{ criados: number; erros: { linha: number; mensagem: string }[] } | null>(null);
  const validas = linhas.filter((l) => !l.erros.length);

  const modelo = () => {
    const exemplo = [COLUNAS, ['Ana Paula Domingos', 'Colégio Exemplo', '5.ª', 'A', 'Paulo Domingos', '923000000', rotas?.data[0]?.codigo ?? 'R01', 'Portão principal', '06:40', '2026-09']];
    const ws = XLSX.utils.aoa_to_sheet(exemplo);
    ws['!cols'] = COLUNAS.map((c) => ({ wch: Math.max(14, c.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alunos');
    XLSX.writeFile(wb, 'modelo-alunos.xlsx');
  };

  return (
    <>
      <PageHeader title="Importar alunos do Excel" subtitle="Cada linha cria o aluno, o encarregado (reutilizado pelo telefone) e a inscrição na rota do ano activo." />
      <Card className="mb-4 max-w-4xl">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
          <li>Descarregue o modelo e preencha uma linha por aluno. Não mude os nomes das colunas.</li>
          <li>A rota é o código (ex.: R01). Rotas existentes: {rotas?.data.map((r) => r.codigo).join(', ') || '—'}.</li>
          <li>Mês de entrada vazio = mês actual. As linhas com erro não são importadas.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={modelo}><Download className="size-4" /> Descarregar modelo</Button>
          <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setResultado(null);
              setFicheiro(f.name);
              setLinhas(await lerAlunos(f, new Set(rotas?.data.map((r) => r.codigo.toUpperCase()))));
            } catch (err) {
              toast.error(`Não foi possível ler o ficheiro: ${(err as Error).message}`);
            }
          }} />
          <Button variant="secondary" onClick={() => ref.current?.click()}><FileUp className="size-4" /> Carregar ficheiro .xlsx</Button>
          <Button disabled={!validas.length} loading={aImportar} onClick={async () => {
            setAImportar(true);
            try {
              const r = await api.post<{ criados: number; erros: { linha: number; mensagem: string }[] }>('/alunos/importar', {
                linhas: validas.map(({ erros: _e, ...l }) => l),
              });
              setResultado(r);
              toast.success(`${r.criados} alunos importados.`);
              await invalidar('alunos', 'rotas', 'painel', 'mapa', 'sugestoes');
            } catch (e) { toast.error((e as Error).message); } finally { setAImportar(false); }
          }}><Upload className="size-4" /> Importar {validas.length} linhas válidas</Button>
        </div>
      </Card>

      {resultado && (
        <div className="mb-4 max-w-4xl">
          <Alert tone={resultado.erros.length ? 'amber' : 'green'}>
            <p className="font-semibold">{resultado.criados} alunos importados.</p>
            {resultado.erros.map((e) => <p key={e.linha}>Linha {e.linha}: {e.mensagem}</p>)}
          </Alert>
        </div>
      )}

      {linhas.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted">{ficheiro}: {linhas.length} linhas, {validas.length} válidas, {linhas.length - validas.length} com erro.</p>
          <Table>
            <thead><tr><th>Linha</th><th>Nome</th><th>Colégio / classe</th><th>Encarregado</th><th>Rota</th><th>Recolha</th><th>Entrada</th><th>Estado</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.linha} className={l.erros.length ? 'bg-danger-soft/40' : ''}>
                  <td>{l.linha}</td>
                  <td>{l.nome}</td>
                  <td>{[l.colegio, l.classe, l.turma].filter(Boolean).join(' · ')}</td>
                  <td>{[l.encarregado, l.telefone].filter(Boolean).join(' · ')}</td>
                  <td>{l.rota}</td>
                  <td>{[l.pontoRecolha, l.horaRecolha].filter(Boolean).join(' · ')}</td>
                  <td>{l.mesEntrada}</td>
                  <td>{l.erros.length ? <Badge tone="red">{l.erros.join('; ')}</Badge> : <Badge tone="green">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}
