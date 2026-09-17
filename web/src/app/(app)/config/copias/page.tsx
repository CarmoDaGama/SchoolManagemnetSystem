'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { DatabaseBackup, FolderCheck, History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { bytes, dataHora } from '@/lib/format';
import { useInvalidar } from '@/lib/hooks';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';

type Config = { activo: boolean; hora: string; pastaLocal: string; pastaExterna: string | null; retencaoDias: number };
type Registo = {
  id: number; origem: 'AGENDADO' | 'MANUAL' | 'ANTES_RESTAURO'; inicio: string; fim: string | null; sucesso: boolean;
  ficheiro: string | null; tamanhoBytes: number | null; copiadoExterno: boolean; aviso: string | null;
};
type Ficheiro = { local: 'LOCAL' | 'EXTERNA'; nome: string; tamanhoBytes: number; data: string };
type Pasta = { disponivel: boolean; ficheiros: Ficheiro[] };
type Estado = { ultimaCopia: Registo | null; alertas: string[]; activo: boolean; hora: string };

const ORIGENS = { AGENDADO: 'Agendada', MANUAL: 'Manual', ANTES_RESTAURO: 'Antes de restauro' };

export default function CopiasPage() {
  const invalidar = useInvalidar();
  const { data: cfg } = useQuery({ queryKey: ['backup-config'], queryFn: () => api.get<Config>('/backup/config') });
  const { data: estado, refetch: refetchEstado } = useQuery({ queryKey: ['backup-estado'], queryFn: () => api.get<Estado>('/backup/estado') });
  const { data: historico, refetch: refetchHist } = useQuery({ queryKey: ['backup-historico'], queryFn: () => api.get<Registo[]>('/backup/historico') });
  const { data: ficheiros, refetch: refetchFich } = useQuery({ queryKey: ['backup-ficheiros'], queryFn: () => api.get<{ local: Pasta; externa: Pasta }>('/backup/ficheiros') });
  const { register, handleSubmit, reset, getValues, formState } = useForm<Config & { activoStr: string }>();
  const [aCorrer, setACorrer] = useState(false);
  const [verificacao, setVerificacao] = useState<Record<string, string>>({});
  const [restaurar, setRestaurar] = useState<Ficheiro | null>(null);

  useEffect(() => {
    if (cfg) reset({ ...cfg, pastaExterna: cfg.pastaExterna ?? '', activoStr: String(cfg.activo) });
  }, [cfg, reset]);

  const actualizar = () => Promise.all([refetchEstado(), refetchHist(), refetchFich(), invalidar('backup-estado')]);

  const verificar = async (campo: 'pastaLocal' | 'pastaExterna') => {
    const caminho = getValues(campo);
    if (!caminho) return;
    const r = await api.post<{ ok: boolean; livreBytes?: number; mensagem?: string }>('/backup/verificar-pasta', { caminho });
    setVerificacao((v) => ({ ...v, [campo]: r.ok ? `✓ Pasta disponível · ${bytes(r.livreBytes)} livres` : `✗ ${r.mensagem}` }));
  };

  if (!cfg) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Cópias de segurança"
        subtitle="Uma cópia por dia, à hora definida, no computador e na pen. Se o computador estiver desligado a essa hora, a cópia é feita quando voltar a ligar."
        actions={
          <Button loading={aCorrer} onClick={async () => {
            setACorrer(true);
            try {
              const r = await api.post<Registo>('/backup/agora');
              toast.success(`Cópia feita: ${r.ficheiro}${r.aviso ? ` (${r.aviso})` : ''}`);
            } catch (e) { toast.error((e as Error).message); } finally { setACorrer(false); await actualizar(); }
          }}><DatabaseBackup className="size-4" /> Fazer cópia agora</Button>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Última cópia</p>
          <p className="text-lg font-bold">{estado?.ultimaCopia ? dataHora(estado.ultimaCopia.inicio) : 'Nenhuma'}</p>
          {estado?.ultimaCopia && <p className="text-xs text-muted">{estado.ultimaCopia.ficheiro} · {bytes(estado.ultimaCopia.tamanhoBytes)}</p>}
        </Card>
        <Card>
          <p className="text-sm text-muted">Próxima cópia automática</p>
          <p className="text-lg font-bold">{cfg.activo ? `Todos os dias às ${cfg.hora}` : 'Desligada'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Pen de cópias</p>
          <p className="text-lg font-bold">
            {!cfg.pastaExterna ? 'Não configurada' : ficheiros?.externa.disponivel ? <span className="text-success">Ligada</span> : <span className="text-danger">Não detectada</span>}
          </p>
          {cfg.pastaExterna && <p className="text-xs text-muted">{cfg.pastaExterna}</p>}
        </Card>
      </div>
      {!!estado?.alertas.length && <div className="mb-6"><Alert tone="red">{estado.alertas.map((a) => <p key={a}>{a}</p>)}</Alert></div>}

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">Definições</h2>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(async (v) => {
            try {
              await api.put('/backup/config', {
                activo: v.activoStr === 'true', hora: v.hora, pastaLocal: v.pastaLocal, pastaExterna: v.pastaExterna || null, retencaoDias: Number(v.retencaoDias),
              });
              await invalidar('backup-config');
              await actualizar();
              toast.success('Definições das cópias guardadas.');
            } catch (e) { toast.error((e as Error).message); }
          })}
        >
          <Field label="Cópia diária">
            <Select {...register('activoStr')}><option value="true">Ligada</option><option value="false">Desligada</option></Select>
          </Field>
          <Field label="Hora"><Input type="time" {...register('hora', { required: true })} /></Field>
          <Field label="Pasta no computador" hint={verificacao.pastaLocal}>
            <div className="flex gap-2">
              <Input {...register('pastaLocal', { required: true })} />
              <Button type="button" variant="secondary" onClick={() => verificar('pastaLocal')} title="Verificar pasta"><FolderCheck className="size-4" /></Button>
            </div>
          </Field>
          <Field label="Pasta na pen" hint={verificacao.pastaExterna ?? 'Ex.: E:\\CopiasTransporte. Deixe vazio se não usar pen.'}>
            <div className="flex gap-2">
              <Input {...register('pastaExterna')} placeholder="E:\CopiasTransporte" />
              <Button type="button" variant="secondary" onClick={() => verificar('pastaExterna')} title="Verificar pasta"><FolderCheck className="size-4" /></Button>
            </div>
          </Field>
          <Field label="Dias a guardar" hint="Cópias mais antigas são apagadas nas duas pastas.">
            <Input type="number" min={1} {...register('retencaoDias', { required: true })} />
          </Field>
          <div className="flex items-end"><Button type="submit" loading={formState.isSubmitting}>Guardar definições</Button></div>
        </form>
      </Card>

      <h2 className="mb-2 flex items-center gap-2 font-semibold"><RotateCcw className="size-4" /> Cópias disponíveis para restaurar</h2>
      <Table className="mb-6">
        <thead><tr><th>Ficheiro</th><th>Onde</th><th>Data</th><th className="text-right">Tamanho</th><th /></tr></thead>
        <tbody>
          {[...(ficheiros?.local.ficheiros ?? []), ...(ficheiros?.externa.ficheiros ?? [])].map((f) => (
            <tr key={`${f.local}-${f.nome}`}>
              <td className="font-mono text-xs">{f.nome}</td>
              <td>{f.local === 'LOCAL' ? 'Computador' : 'Pen'}</td>
              <td>{dataHora(f.data)}</td>
              <td className="text-right">{bytes(f.tamanhoBytes)}</td>
              <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setRestaurar(f)}>Restaurar</Button></td>
            </tr>
          ))}
          {!ficheiros?.local.ficheiros.length && !ficheiros?.externa.ficheiros.length && <tr><td colSpan={5} className="text-muted">Ainda não há cópias.</td></tr>}
        </tbody>
      </Table>

      <h2 className="mb-2 flex items-center gap-2 font-semibold"><History className="size-4" /> Histórico</h2>
      <Table>
        <thead><tr><th>Início</th><th>Origem</th><th>Resultado</th><th>Ficheiro</th><th>Pen</th><th>Aviso</th></tr></thead>
        <tbody>
          {historico?.map((h) => (
            <tr key={h.id}>
              <td>{dataHora(h.inicio)}</td>
              <td>{ORIGENS[h.origem]}</td>
              <td>{!h.fim ? <Badge tone="blue">A decorrer</Badge> : h.sucesso ? <Badge tone="green">OK</Badge> : <Badge tone="red">Falhou</Badge>}</td>
              <td className="font-mono text-xs">{h.ficheiro ?? '—'} {h.tamanhoBytes ? `(${bytes(h.tamanhoBytes)})` : ''}</td>
              <td>{h.copiadoExterno ? '✓' : '—'}</td>
              <td className="max-w-80 text-xs text-muted">{h.aviso ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <RestaurarDialog ficheiro={restaurar} onClose={() => setRestaurar(null)} />
    </>
  );
}

function RestaurarDialog({ ficheiro, onClose }: { ficheiro: Ficheiro | null; onClose: () => void }) {
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => setTexto(''), [ficheiro]);
  return (
    <Modal
      open={!!ficheiro}
      onClose={onClose}
      title="Restaurar cópia de segurança"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={texto !== 'RESTAURAR'} loading={loading} onClick={async () => {
            setLoading(true);
            try {
              const r = await api.post<{ mensagem: string }>('/backup/restaurar', { local: ficheiro!.local, ficheiro: ficheiro!.nome, confirmacao: texto });
              toast.success(r.mensagem);
              setTimeout(() => (window.location.href = '/login/'), 1500);
            } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
          }}>Restaurar</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Alert tone="red">
          Todos os dados actuais serão substituídos pelos da cópia <b>{ficheiro?.nome}</b>. Pagamentos e alterações feitos depois dessa cópia deixam de aparecer.
          Antes de restaurar, o sistema faz automaticamente uma cópia do estado actual.
        </Alert>
        <Field label="Escreva RESTAURAR para confirmar">
          <Input value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
