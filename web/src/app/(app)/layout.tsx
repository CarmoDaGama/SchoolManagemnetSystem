'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Bus, CalendarCheck, CalendarRange, CheckCircle2, Coins, DatabaseBackup, Grid3x3, KeyRound, LayoutDashboard,
  LogOut, Receipt, Route, Building2, UserCog, Users,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ROLES } from '@/lib/format';
import { useEmpresa, useSessao } from '@/components/providers';
import { FormDialog } from '@/components/FormDialog';
import { cn, Spinner } from '@/components/ui';

type Item = { href: string; label: string; icon: typeof Users; admin?: boolean };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Operação',
    itens: [
      { href: '/painel/', label: 'Painel', icon: LayoutDashboard },
      { href: '/pagamentos/receber/', label: 'Receber pagamento', icon: Coins },
      { href: '/alunos/', label: 'Alunos', icon: Users },
      { href: '/confirmacoes/', label: 'Confirmações', icon: CalendarCheck },
      { href: '/mapa/', label: 'Mapa mensal', icon: Grid3x3 },
      { href: '/rotas/', label: 'Rotas', icon: Route },
    ],
  },
  {
    titulo: 'Listagens',
    itens: [
      { href: '/devedores/', label: 'Devedores', icon: AlertTriangle },
      { href: '/pagos/', label: 'Pagos por mês', icon: CheckCircle2 },
      { href: '/pagamentos/historico/', label: 'Pagamentos por data', icon: Receipt },
    ],
  },
  {
    titulo: 'Configuração',
    itens: [
      { href: '/config/empresa/', label: 'Empresa', icon: Building2, admin: true },
      { href: '/config/anos/', label: 'Anos lectivos', icon: CalendarRange, admin: true },
      { href: '/config/utilizadores/', label: 'Utilizadores', icon: UserCog, admin: true },
      { href: '/config/copias/', label: 'Cópias de segurança', icon: DatabaseBackup, admin: true },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useSessao();
  const { data: empresa } = useEmpresa();
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [senhaOpen, setSenhaOpen] = useState(false);

  useEffect(() => setPath(window.location.pathname), []);

  if (isLoading) return <Spinner />;
  if (error || !user) return <Spinner label="A redireccionar para o login…" />;

  const semPermissao = path.startsWith('/config/') && user.role !== 'ADMIN';

  const sair = async () => {
    await api.post('/auth/logout').catch(() => null);
    qc.clear();
    window.location.href = '/login/';
  };

  return (
    <div className="flex min-h-screen">
      <nav className="no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-white">
        <div className="flex items-center gap-2 border-b border-line px-4 py-4">
          {empresa?.logotipo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logotipo} alt="" className="h-9 w-9 object-contain" />
          ) : (
            <Bus className="size-7 text-primary" />
          )}
          <span className="line-clamp-2 text-sm font-bold leading-tight">{empresa?.nome ?? 'Transporte Escolar'}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((i) => !i.admin || user.role === 'ADMIN');
            if (!itens.length) return null;
            return (
              <div key={g.titulo} className="mb-4">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.titulo}</p>
                {itens.map((i) => (
                  <a
                    key={i.href}
                    href={i.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      path.startsWith(i.href) ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-bg',
                    )}
                  >
                    <i.icon className="size-4" /> {i.label}
                  </a>
                ))}
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-3 text-sm">
          <p className="font-semibold">{user.nome}</p>
          <p className="text-xs text-muted">{ROLES[user.role]}</p>
          <div className="mt-2 flex gap-1">
            <button onClick={() => setSenhaOpen(true)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-bg">
              <KeyRound className="size-3" /> Senha
            </button>
            <button onClick={sair} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-bg">
              <LogOut className="size-3" /> Sair
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted" title="Data do computador: vencimentos e multas dependem dela">
            Hoje: {new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
        </div>
      </nav>
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-10">
        {semPermissao ? <p className="text-danger">Sem permissão para aceder a esta página.</p> : children}
      </main>
      <FormDialog
        open={senhaOpen}
        onClose={() => setSenhaOpen(false)}
        title="Trocar a minha senha"
        fields={[
          { name: 'senhaActual', label: 'Senha actual', type: 'password', required: true, full: true },
          { name: 'novaSenha', label: 'Nova senha', type: 'password', required: true, full: true, hint: 'Mínimo 6 caracteres' },
        ]}
        onSubmit={async (v) => {
          await api.patch('/auth/senha', v);
          toast.success('Senha alterada.');
        }}
      />
    </div>
  );
}
