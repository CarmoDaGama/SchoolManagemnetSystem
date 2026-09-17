'use client';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2, X } from 'lucide-react';
import {
  ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect,
} from 'react';

export const cn = (...c: Parameters<typeof clsx>) => twMerge(clsx(...c));

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-white text-ink border border-line hover:border-primary',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-muted hover:bg-primary-soft hover:text-ink',
};

export function Button({
  variant = 'primary', loading, className, children, size = 'md', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

const fieldCls =
  'w-full rounded-md border border-line bg-white px-3 h-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-bg';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...p }, ref,
) {
  return <input ref={ref} {...p} className={cn(fieldCls, className)} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...p }, ref,
) {
  return <select ref={ref} {...p} className={cn(fieldCls, 'pr-8', className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...p }, ref,
) {
  return <textarea ref={ref} {...p} className={cn(fieldCls, 'h-auto min-h-20 py-2', className)} />;
});

export function Field({ label, error, children, hint, className }: {
  label: string; error?: string; children: ReactNode; hint?: string; className?: string;
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-line bg-white p-5', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-bg text-muted border-line',
  blue: 'bg-primary-soft text-primary border-transparent',
  green: 'bg-success-soft text-success border-transparent',
  red: 'bg-danger-soft text-danger border-transparent',
  amber: 'bg-warn-soft text-warn border-transparent',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', badgeTones[tone])}>
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('w-full rounded-lg bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-bg" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-line bg-white', className)}>
      <table className="w-full text-sm [&_th]:bg-bg [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-line [&_tbody_tr:hover]:bg-bg/60">
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">{children}</div>;
}

export function Spinner({ label = 'A carregar…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function Alert({ tone = 'blue', children }: { tone?: 'blue' | 'red' | 'amber' | 'green'; children: ReactNode }) {
  const t = {
    blue: 'border-primary bg-primary-soft',
    red: 'border-danger bg-danger-soft',
    amber: 'border-warn bg-warn-soft',
    green: 'border-success bg-success-soft',
  }[tone];
  return <div className={cn('rounded-r-md border-l-4 px-4 py-3 text-sm', t)}>{children}</div>;
}
