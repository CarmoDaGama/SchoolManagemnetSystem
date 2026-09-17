'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CalendarPlus, Pause, Pencil, Play, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { data, ESTADOS_INSCRICAO, kz, mesActual, nomeMes, SENTIDOS } from '@/lib/format';
import { useAnoActivo, useInvalidar, useRotas } from '@/lib/hooks';
import type { Aluno, Inscricao } from '@/lib/types';
import { AlunoForm } from '@/components/AlunoForm';
import { Extracto } from '@/components/Extracto';
import { corpoInscricao, InscricaoCampos, inscricaoVazia, InscricaoValores } from '@/components/InscricaoCampos';
import { FormDialog } from '@/components/FormDialog';
import { useAdmin } from '@/components/providers';
import { Alert, Badge, Button, Card, PageHeader, Spinner, Table, cn } from '@/components/ui';

type Ficha = Aluno & { inscricoes: (Inscricao & { anoLectivo: NonNullable<Inscricao['anoLectivo']> })[]; inscricaoActual: Inscricao | null };

export default function Page() {
  return <Suspense fallback={<Spinner />}><FichaAluno /></Suspense>;
}

function FichaAluno() {
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const [tab, setTab] = useState(params.get('tab') ?? 'inscricao');
  const invalidar = useInvalidar();
  const { data: aluno, isLoading, refetch } = useQuery({
    queryKey: ['aluno', id],
    queryFn: () => api.get<Ficha>(`/alunos/${id}`),
    enabled: !!id,
  });

  if (!id) return <p>Aluno não indicado.</p>;
  if (isLoading || !aluno) return <Spinner />;
  const i = aluno.inscricaoActual;
  const actualizar = async () => {
    await refetch();
    await invalidar('alunos', 'rotas', 'painel', 'mapa', 'extracto', 'devedores', 'aluno');
  };

  const tabs: [string, string][] = [['inscricao', 'Inscrição'], ['pagamentos', 'Meses e pagamentos'], ['dados', 'Dados do aluno'], ['historico', 'Histórico']];

  return (
    <>
      <PageHeader
        title={aluno.nome}
        subtitle={<>
          <b className="font-mono">{aluno.numero}</b>
          {[aluno.colegio, aluno.classe, aluno.turma].filter(Boolean).length > 0 && <> · {[aluno.colegio, aluno.classe, aluno.turma].filter(Boolean).join(' · ')}</>}
          {i && <> · Rota {i.rota.codigo} {i.horaRecolha && `às ${i.horaRecolha}`}</>}
          {aluno.encarregado && <> · {aluno.encarregado.nome} ({aluno.encarregado.telefone})</>}
        </>}
      />
      {aluno.observacoes && <div className="mb-4"><Alert tone="amber">{aluno.observacoes}</Alert></div>}
      <div className="mb-4 flex gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm', tab === k ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted')}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'dados' && (
        <AlunoForm aluno={aluno} onSaved={async () => { toast.success('Dados guardados.'); await actualizar(); }} />
      )}
      {tab === 'inscricao' && (i ? <InscricaoActual inscricao={i} onChange={actualizar} /> : <NovaInscricao aluno={aluno} onDone={async () => { await actualizar(); setTab('pagamentos'); }} />)}
      {tab === 'pagamentos' && (i ? <Extracto inscricaoId={i.id} /> : <Alert tone="amber">O aluno não tem inscrição no ano activo.</Alert>)}
      {tab === 'historico' && (
        <Table>
          <thead><tr><th>Ano lectivo</th><th>Tipo</th><th>Rota</th><th>Mês de entrada</th><th className="text-right">Mensalidade</th><th>Estado</th></tr></thead>
          <tbody>
            {aluno.inscricoes.map((x) => (
              <tr key={x.id}>
                <td>{x.anoLectivo.nome}</td>
                <td>{x.tipo === 'NOVA' ? 'Inscrição' : 'Confirmação'}</td>
                <td>{x.rota.codigo} — {x.rota.nome}</td>
                <td>{nomeMes(x.mesEntrada.slice(0, 7))}</td>
                <td className="text-right">{kz(x.valorMensal)}{x.valorEspecial && ' *'}</td>
                <td>{ESTADOS_INSCRICAO[x.estado]}</td>
              </tr>
            ))}
            {!aluno.inscricoes.length && <tr><td colSpan={6} className="text-muted">Sem inscrições.</td></tr>}
          </tbody>
        </Table>
      )}
    </>
  );
}

function NovaInscricao({ aluno, onDone }: { aluno: Ficha; onDone: () => Promise<void> }) {
  const { data: ano } = useAnoActivo();
  const anterior = aluno.inscricoes.find((x) => ano && x.anoLectivo.anoInicio < ano.anoInicio);
  const tipo = anterior ? 'CONFIRMACAO' : 'NOVA';
  const [valores, setValores] = useState<InscricaoValores>(inscricaoVazia());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (anterior) {
      setValores((v) => ({ ...v, rotaId: String(anterior.rotaId), sentido: anterior.sentido, pontoRecolha: anterior.pontoRecolha ?? '', horaRecolha: anterior.horaRecolha ?? '' }));
    }
  }, [anterior]);

  return (
    <Card>
      <h3 className="mb-1 font-semibold">{tipo === 'CONFIRMACAO' ? `Confirmar para ${ano?.nome ?? ''}` : `Inscrever em ${ano?.nome ?? ''}`}</h3>
      {anterior && <p className="mb-3 text-sm text-muted">No ano {anterior.anoLectivo.nome} usou a rota {anterior.rota.codigo}. Os dados de recolha foram copiados.</p>}
      <InscricaoCampos valores={valores} onChange={setValores} confirmacao={tipo === 'CONFIRMACAO'} />
      <Button className="mt-4" disabled={!valores.rotaId} loading={loading} onClick={async () => {
        setLoading(true);
        try {
          await api.post('/inscricoes', { alunoId: aluno.id, tipo, ...corpoInscricao(valores), mesEntrada: valores.mesEntrada || (tipo === 'CONFIRMACAO' ? ano?.meses[0]?.chave : null) });
          toast.success(tipo === 'CONFIRMACAO' ? 'Aluno confirmado.' : 'Aluno inscrito.');
          await onDone();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setLoading(false);
        }
      }}>{tipo === 'CONFIRMACAO' ? 'Confirmar' : 'Inscrever'}</Button>
    </Card>
  );
}

function InscricaoActual({ inscricao: i, onChange }: { inscricao: Inscricao; onChange: () => Promise<void> }) {
  const admin = useAdmin();
  const { data: rotas } = useRotas();
  const { data: ano } = useAnoActivo();
  const [dialogo, setDialogo] = useState<'editar' | 'valor' | 'suspender' | 'cancelar' | 'reactivar' | 'mes' | null>(null);
  const fechar = () => setDialogo(null);
  const mesesOpcoes = ano?.meses.map((m) => ({ value: m.chave, label: m.nome })) ?? [];
  const mesDefeito = ano?.meses.find((m) => m.chave >= mesActual())?.chave ?? ano?.meses[0]?.chave;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p className="text-lg font-semibold">
              {i.rota.codigo} — {i.rota.nome}{' '}
              <Badge tone={i.estado === 'ACTIVA' ? 'green' : 'amber'}>{ESTADOS_INSCRICAO[i.estado]}</Badge>
            </p>
            <p>{i.tipo === 'NOVA' ? 'Inscrição' : 'Confirmação'} em {data(i.data)} · entrada em {nomeMes(i.mesEntrada.slice(0, 7))}</p>
            <p>Recolha: <b>{i.pontoRecolha ?? '—'}</b> às <b>{i.horaRecolha ?? '—'}</b> · {SENTIDOS[i.sentido]}</p>
            <p>
              Mensalidade: <b>{kz(i.valorMensal)}</b>
              {i.valorEspecial && <> <Badge tone="amber">Valor especial</Badge> <span className="text-muted">({i.motivoValor})</span></>}
            </p>
            {i.rota.motorista && <p className="text-muted">Motorista: {i.rota.motorista}{i.rota.telefoneMotorista && ` · ${i.rota.telefoneMotorista}`}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDialogo('editar')}><Pencil className="size-4" /> Rota e recolha</Button>
            {admin && <Button size="sm" variant="secondary" onClick={() => setDialogo('valor')}>Valor especial</Button>}
            {admin && <Button size="sm" variant="secondary" onClick={() => setDialogo('mes')}><CalendarPlus className="size-4" /> Acrescentar mês</Button>}
            {admin && i.estado === 'ACTIVA' && <Button size="sm" variant="secondary" onClick={() => setDialogo('suspender')}><Pause className="size-4" /> Suspender</Button>}
            {admin && i.estado === 'ACTIVA' && <Button size="sm" variant="danger" onClick={() => setDialogo('cancelar')}><XCircle className="size-4" /> Cancelar</Button>}
            {admin && i.estado !== 'ACTIVA' && <Button size="sm" onClick={() => setDialogo('reactivar')}><Play className="size-4" /> Reactivar</Button>}
          </div>
        </div>
      </Card>

      <FormDialog
        open={dialogo === 'editar'}
        onClose={fechar}
        title="Mudar rota ou dados de recolha"
        fields={[
          { name: 'rotaId', label: 'Rota', type: 'select', required: true, full: true, options: rotas?.data.filter((r) => r.activa).map((r) => ({ value: r.id, label: `${r.codigo} — ${r.nome} (${r.ocupacao}/${r.capacidade}) · ${kz(r.valorMensal)}` })) ?? [] },
          { name: 'sentido', label: 'Sentido', type: 'select', required: true, options: Object.entries(SENTIDOS).map(([value, label]) => ({ value, label })) },
          { name: 'horaRecolha', label: 'Hora de recolha', type: 'time' },
          { name: 'pontoRecolha', label: 'Ponto de recolha', full: true },
          { name: 'aplicarAPartirDe', label: 'Se a nova rota tiver outro valor, aplicar às mensalidades pendentes a partir de', type: 'select', full: true, options: mesesOpcoes, hint: i.valorEspecial ? 'O aluno tem valor especial: o valor não muda.' : 'Deixe em branco para manter o valor actual.' },
          ...(admin ? [{ name: 'forcarLotacao', label: 'Se a rota estiver cheia', type: 'select' as const, options: [{ value: '', label: 'Não inscrever acima da lotação' }, { value: 'sim', label: 'Inscrever acima da lotação' }], full: true }] : []),
        ]}
        initial={{ rotaId: i.rotaId, sentido: i.sentido, horaRecolha: i.horaRecolha ?? '', pontoRecolha: i.pontoRecolha ?? '', aplicarAPartirDe: '', forcarLotacao: '' }}
        onSubmit={async (v) => {
          await api.patch(`/inscricoes/${i.id}`, { ...v, aplicarAPartirDe: v.aplicarAPartirDe || null, forcarLotacao: v.forcarLotacao === 'sim' });
          toast.success('Inscrição actualizada.');
          await onChange();
        }}
      />
      <FormDialog
        open={dialogo === 'valor'}
        onClose={fechar}
        title="Valor especial da mensalidade"
        fields={[
          { name: 'valorMensal', label: 'Valor especial (Kz)', type: 'number', step: '0.01', min: 0, hint: 'Deixe vazio para voltar ao valor da rota.' },
          { name: 'motivoValor', label: 'Motivo', hint: 'Obrigatório para valor especial' },
          { name: 'aplicarAPartirDe', label: 'Aplicar às mensalidades pendentes a partir de', type: 'select', required: true, full: true, options: mesesOpcoes },
        ]}
        initial={{ valorMensal: i.valorEspecial ? Number(i.valorMensal) : '', motivoValor: i.motivoValor ?? '', aplicarAPartirDe: mesDefeito }}
        onSubmit={async (v) => {
          const body = v.valorMensal === null
            ? { removerValorEspecial: true, aplicarAPartirDe: v.aplicarAPartirDe }
            : { valorMensal: v.valorMensal, motivoValor: v.motivoValor, aplicarAPartirDe: v.aplicarAPartirDe };
          const r = await api.patch<{ mensalidadesActualizadas: number }>(`/inscricoes/${i.id}`, body);
          toast.success(`Valor actualizado em ${r.mensalidadesActualizadas} mensalidades.`);
          await onChange();
        }}
      />
      {(['suspender', 'cancelar'] as const).map((acao) => (
        <FormDialog
          key={acao}
          open={dialogo === acao}
          onClose={fechar}
          title={acao === 'suspender' ? 'Suspender inscrição' : 'Cancelar inscrição'}
          submitLabel={acao === 'suspender' ? 'Suspender' : 'Cancelar inscrição'}
          fields={[
            { name: 'mes', label: 'A partir do mês', type: 'select', required: true, full: true, options: mesesOpcoes, hint: 'As mensalidades por pagar desde este mês deixam de ser cobradas. Meses pagos não mudam.' },
            { name: 'motivo', label: 'Motivo', required: true, full: true },
          ]}
          initial={{ mes: mesDefeito }}
          onSubmit={async (v) => {
            const r = await api.post<{ mesesAnulados: number }>(`/inscricoes/${i.id}/${acao}`, v);
            toast.success(`${r.mesesAnulados} meses deixaram de ser cobrados.`);
            await onChange();
          }}
        />
      ))}
      <FormDialog
        open={dialogo === 'reactivar'}
        onClose={fechar}
        title="Reactivar inscrição"
        submitLabel="Reactivar"
        fields={[
          { name: 'mes', label: 'Regressa no mês', type: 'select', required: true, full: true, options: mesesOpcoes, hint: 'Volta a cobrar este mês e os seguintes.' },
          ...(admin ? [{ name: 'forcarLotacao', label: 'Se a rota estiver cheia', type: 'select' as const, full: true, options: [{ value: '', label: 'Não reactivar acima da lotação' }, { value: 'sim', label: 'Reactivar acima da lotação' }] }] : []),
        ]}
        initial={{ mes: mesDefeito, forcarLotacao: '' }}
        onSubmit={async (v) => {
          const r = await api.post<{ meses: number }>(`/inscricoes/${i.id}/reactivar`, { mes: v.mes, forcarLotacao: v.forcarLotacao === 'sim' });
          toast.success(`Inscrição reactivada: ${r.meses} meses voltam a ser cobrados.`);
          await onChange();
        }}
      />
      <FormDialog
        open={dialogo === 'mes'}
        onClose={fechar}
        title="Acrescentar mês em falta"
        submitLabel="Acrescentar"
        fields={[{ name: 'mes', label: 'Mês', type: 'select', required: true, full: true, options: mesesOpcoes, hint: 'Cria o mês se não existir ou volta a cobrar um mês sem serviço.' }]}
        initial={{ mes: mesDefeito }}
        onSubmit={async (v) => {
          await api.post(`/inscricoes/${i.id}/meses`, v);
          toast.success('Mês acrescentado.');
          await onChange();
        }}
      />
    </div>
  );
}
