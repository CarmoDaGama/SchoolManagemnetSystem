'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

export type FieldSpec = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'month' | 'time' | 'select' | 'textarea' | 'password';
  required?: boolean;
  options?: { value: string | number; label: string }[];
  hint?: string;
  step?: string;
  min?: number;
  max?: number;
  full?: boolean;
  disabled?: boolean;
};

type Values = Record<string, any>;

/** Diálogo de formulário genérico: usado em todos os ecrãs de configuração. */
export function FormDialog({ open, onClose, title, fields, initial, onSubmit, submitLabel = 'Guardar' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: FieldSpec[];
  initial?: Values;
  onSubmit: (values: Values) => Promise<unknown>;
  submitLabel?: string;
}) {
  const { register, handleSubmit, reset, formState } = useForm<Values>();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      reset(initial ?? {});
      setErro(null);
    }
  }, [open, initial, reset]);

  const submit = handleSubmit(async (raw) => {
    setErro(null);
    const values: Values = {};
    for (const f of fields) {
      let v = raw[f.name];
      if (f.type === 'number') v = v === '' || v === undefined || v === null ? null : Number(v);
      else if (f.type === 'select' && f.options?.length && typeof f.options[0].value === 'number') v = v === '' ? null : Number(v);
      else if (typeof v === 'string') v = v.trim() === '' && !f.required ? null : v.trim();
      values[f.name] = v;
    }
    try {
      await onSubmit(values);
      onClose();
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide={fields.length > 6}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-dialog" loading={formState.isSubmitting}>{submitLabel}</Button>
        </>
      }
    >
      <form id="form-dialog" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const err = formState.errors[f.name]?.message as string | undefined;
          const reg = register(f.name, { required: f.required ? `${f.label} é obrigatório.` : false });
          return (
            <Field key={f.name} label={f.label} error={err} hint={f.hint} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              {f.type === 'select' ? (
                <Select {...reg} disabled={f.disabled}>
                  <option value="">Seleccione…</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea {...reg} disabled={f.disabled} />
              ) : (
                <Input {...reg} type={f.type ?? 'text'} step={f.step} min={f.min} max={f.max} disabled={f.disabled} />
              )}
            </Field>
          );
        })}
        {erro && <p className="sm:col-span-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</p>}
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, title, message, onConfirm, confirmLabel = 'Confirmar', danger }: {
  open: boolean; onClose: () => void; title: string; message: React.ReactNode;
  onConfirm: () => Promise<unknown>; confirmLabel?: string; danger?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (open) setErro(null); }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setErro((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm">{message}</div>
      {erro && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</p>}
    </Modal>
  );
}
