'use client';

import { kz, mesActual, SENTIDOS } from '@/lib/format';
import { useAnoActivo, useRotas } from '@/lib/hooks';
import { useAdmin } from './providers';
import { Alert, Field, Input, Select } from './ui';

export type InscricaoValores = {
  rotaId: string;
  sentido: string;
  pontoRecolha: string;
  horaRecolha: string;
  mesEntrada: string;
  valorEspecial: string; // vazio = valor da rota
  motivoValor: string;
  forcarLotacao: boolean;
};

export const inscricaoVazia = (): InscricaoValores => ({
  rotaId: '', sentido: 'IDA_E_VOLTA', pontoRecolha: '', horaRecolha: '', mesEntrada: '', valorEspecial: '', motivoValor: '', forcarLotacao: false,
});

export function corpoInscricao(v: InscricaoValores) {
  return {
    rotaId: Number(v.rotaId),
    sentido: v.sentido,
    pontoRecolha: v.pontoRecolha.trim() || null,
    horaRecolha: v.horaRecolha || null,
    mesEntrada: v.mesEntrada || null,
    valorMensal: v.valorEspecial === '' ? null : Number(v.valorEspecial),
    motivoValor: v.motivoValor.trim() || null,
    forcarLotacao: v.forcarLotacao,
  };
}

/** Campos de inscrição/confirmação: rota, sentido, recolha, mês de entrada e valor especial (admin). */
export function InscricaoCampos({ valores, onChange, confirmacao }: {
  valores: InscricaoValores; onChange: (v: InscricaoValores) => void; confirmacao?: boolean;
}) {
  const admin = useAdmin();
  const { data: ano } = useAnoActivo();
  const { data: rotas } = useRotas();
  const set = (k: keyof InscricaoValores, val: string | boolean) => onChange({ ...valores, [k]: val });

  if (!ano) return <Alert tone="amber">Não há ano lectivo activo. O administrador tem de o criar em Configuração › Anos lectivos.</Alert>;

  const rota = rotas?.data.find((r) => r.id === Number(valores.rotaId));
  const cheia = !!rota && (rota.ocupacao ?? 0) >= rota.capacidade;
  const mesPadrao = ano.meses.find((m) => m.chave >= mesActual())?.chave ?? ano.meses[0]?.chave;
  const mesSel = valores.mesEntrada || (confirmacao ? ano.meses[0]?.chave : mesPadrao) || '';
  const nMeses = ano.meses.filter((m) => m.chave >= mesSel).length;

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rota">
          <Select value={valores.rotaId} onChange={(e) => set('rotaId', e.target.value)}>
            <option value="">Seleccione…</option>
            {rotas?.data.filter((r) => r.activa).map((r) => (
              <option key={r.id} value={r.id}>{r.codigo} — {r.nome} ({r.ocupacao}/{r.capacidade}) · {kz(r.valorMensal)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sentido">
          <Select value={valores.sentido} onChange={(e) => set('sentido', e.target.value)}>
            {Object.entries(SENTIDOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label={`Mês de entrada (${ano.nome})`}>
          <Select value={mesSel} onChange={(e) => set('mesEntrada', e.target.value)}>
            {ano.meses.map((m) => <option key={m.chave} value={m.chave}>{m.nome}</option>)}
          </Select>
        </Field>
        <Field label="Ponto de recolha"><Input value={valores.pontoRecolha} onChange={(e) => set('pontoRecolha', e.target.value)} /></Field>
        <Field label="Hora de recolha"><Input type="time" value={valores.horaRecolha} onChange={(e) => set('horaRecolha', e.target.value)} /></Field>
        {admin && (
          <Field label="Valor especial (Kz)" hint="Vazio = valor da rota. Só administrador.">
            <Input type="number" min={0} step="0.01" value={valores.valorEspecial} onChange={(e) => set('valorEspecial', e.target.value)} />
          </Field>
        )}
        {admin && valores.valorEspecial !== '' && (
          <Field label="Motivo do valor especial" className="sm:col-span-3">
            <Input placeholder="Ex.: irmãos, acordo com a direcção" value={valores.motivoValor} onChange={(e) => set('motivoValor', e.target.value)} />
          </Field>
        )}
      </div>
      {rota && (
        <p className="text-sm text-muted">
          Serão geradas {nMeses} mensalidades de {kz(valores.valorEspecial !== '' ? valores.valorEspecial : rota.valorMensal)}, de {ano.meses.find((m) => m.chave === mesSel)?.nome} a {ano.meses[ano.meses.length - 1]?.nome}, mais a taxa de {confirmacao ? 'confirmação' : 'inscrição'} se estiver configurada.
        </p>
      )}
      {cheia && (
        <Alert tone="amber">
          A rota {rota.codigo} está cheia ({rota.ocupacao}/{rota.capacidade}).{' '}
          {admin ? (
            <label className="inline-flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={valores.forcarLotacao} onChange={(e) => set('forcarLotacao', e.target.checked)} /> Inscrever acima da lotação
            </label>
          ) : 'Só o administrador pode inscrever acima da lotação.'}
        </Alert>
      )}
    </div>
  );
}
