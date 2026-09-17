'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, Lista, qs } from '@/lib/api';
import { isoDia } from '@/lib/format';
import { useSugestoes } from '@/lib/hooks';
import type { Aluno, Encarregado } from '@/lib/types';
import { corpoInscricao, InscricaoCampos, inscricaoVazia, InscricaoValores } from './InscricaoCampos';
import { Button, Card, Field, Input, Select, Textarea, cn } from './ui';

type Form = {
  nome: string; dataNascimento: string; genero: 'M' | 'F' | ''; colegio: string; classe: string; turma: string;
  morada: string; pontoReferencia: string; observacoes: string;
  enc_nome: string; enc_telefone: string; enc_telefoneAlt: string; enc_email: string; enc_parentesco: string; enc_morada: string;
};

const vazio = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Ficha do aluno com encarregado (existente ou novo) e, para aluno novo, a inscrição na rota. */
export function AlunoForm({ aluno, onSaved, comInscricao }: {
  aluno?: Aluno; onSaved: (a: Aluno) => void; comInscricao?: boolean;
}) {
  const { register, handleSubmit, reset, formState } = useForm<Form>();
  const { data: sugestoes } = useSugestoes();
  const [modo, setModo] = useState<'existente' | 'novo' | 'nenhum'>(aluno?.encarregado ? 'existente' : 'novo');
  const [enc, setEnc] = useState<Encarregado | null>(aluno?.encarregado ?? null);
  const [pesquisa, setPesquisa] = useState('');
  const [inscrever, setInscrever] = useState(!!comInscricao);
  const [insc, setInsc] = useState<InscricaoValores>(inscricaoVazia());
  const [erro, setErro] = useState<string | null>(null);
  const { data: resultados } = useQuery({
    queryKey: ['encarregados', pesquisa],
    queryFn: () => api.get<Lista<Encarregado & { alunos: { nome: string }[] }>>(`/encarregados${qs({ q: pesquisa, pageSize: 8 })}`),
    enabled: modo === 'existente' && pesquisa.length >= 2,
  });

  useEffect(() => {
    if (aluno) {
      reset({
        nome: aluno.nome, dataNascimento: isoDia(aluno.dataNascimento), genero: aluno.genero ?? '', colegio: aluno.colegio ?? '',
        classe: aluno.classe ?? '', turma: aluno.turma ?? '', morada: aluno.morada ?? '', pontoReferencia: aluno.pontoReferencia ?? '',
        observacoes: aluno.observacoes ?? '',
      });
    }
  }, [aluno, reset]);

  const submit = handleSubmit(async (v) => {
    setErro(null);
    if (modo === 'existente' && !enc) return setErro('Seleccione o encarregado ou escolha "Novo encarregado".');
    if (inscrever && !insc.rotaId) return setErro('Escolha a rota ou desmarque "Inscrever já numa rota".');
    const body: Record<string, unknown> = {
      nome: v.nome.trim(), dataNascimento: v.dataNascimento || null, genero: v.genero || null,
      colegio: vazio(v.colegio), classe: vazio(v.classe), turma: vazio(v.turma), morada: vazio(v.morada),
      pontoReferencia: vazio(v.pontoReferencia), observacoes: vazio(v.observacoes),
      encarregadoId: modo === 'existente' ? enc!.id : null,
    };
    if (modo === 'novo') {
      body.encarregado = {
        nome: v.enc_nome?.trim(), telefone: v.enc_telefone?.trim(), telefoneAlt: vazio(v.enc_telefoneAlt), email: vazio(v.enc_email),
        parentesco: vazio(v.enc_parentesco), morada: vazio(v.enc_morada),
      };
    }
    if (!aluno && inscrever) body.inscricao = corpoInscricao(insc);
    try {
      const r = aluno ? await api.patch<Aluno>(`/alunos/${aluno.id}`, body) : await api.post<Aluno>('/alunos', body);
      onSaved(r);
    } catch (e) {
      setErro((e as Error).message);
    }
  });

  const req = (label: string) => ({ required: `${label} é obrigatório.` });
  const err = (k: keyof Form) => formState.errors[k]?.message as string | undefined;

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-4">
      <Card>
        <h2 className="mb-4 font-semibold">Dados do aluno</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome completo" className="sm:col-span-2" error={err('nome')}><Input autoFocus {...register('nome', req('Nome'))} /></Field>
          <Field label="Data de nascimento"><Input type="date" {...register('dataNascimento')} /></Field>
          <Field label="Colégio">
            <Input list="lista-colegios" {...register('colegio')} />
            <datalist id="lista-colegios">{sugestoes?.colegios.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Classe">
            <Input list="lista-classes" {...register('classe')} />
            <datalist id="lista-classes">{sugestoes?.classes.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Turma"><Input {...register('turma')} /></Field>
          <Field label="Género">
            <Select {...register('genero')}><option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option></Select>
          </Field>
          <Field label="Morada" className="sm:col-span-2"><Input {...register('morada')} /></Field>
          <Field label="Ponto de referência" className="sm:col-span-3"><Input {...register('pontoReferencia')} /></Field>
          <Field label="Observações" className="sm:col-span-3" hint="Ex.: alergias comunicadas pelos pais, quem pode receber o aluno">
            <Textarea rows={2} {...register('observacoes')} />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Encarregado de educação</h2>
          <div className="flex gap-1 rounded-md bg-bg p-1 text-sm">
            {([['existente', 'Existente'], ['novo', 'Novo encarregado'], ['nenhum', 'Sem encarregado']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setModo(k)}
                className={cn('rounded px-3 py-1', modo === k ? 'bg-white font-semibold shadow-sm' : 'text-muted')}>{l}</button>
            ))}
          </div>
        </div>
        {modo === 'existente' && (
          <div className="space-y-2">
            {enc ? (
              <div className="flex items-center justify-between rounded-md border border-primary bg-primary-soft px-3 py-2 text-sm">
                <span><b>{enc.nome}</b> · {enc.telefone}{enc.parentesco ? ` · ${enc.parentesco}` : ''}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEnc(null)}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input placeholder="Pesquisar por nome ou telefone (mín. 2 caracteres)" value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} />
                <ul className="divide-y divide-line rounded-md border border-line">
                  {resultados?.data.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setEnc(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-bg">
                        <b>{r.nome}</b> · {r.telefone}
                        {r.alunos.length > 0 && <span className="text-muted"> · educandos: {r.alunos.map((a) => a.nome).join(', ')}</span>}
                      </button>
                    </li>
                  ))}
                  {pesquisa.length >= 2 && !resultados?.data.length && <li className="px-3 py-2 text-sm text-muted">Nenhum encarregado encontrado.</li>}
                </ul>
              </>
            )}
          </div>
        )}
        {modo === 'novo' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome" className="sm:col-span-2" error={err('enc_nome')}><Input {...register('enc_nome', { required: modo === 'novo' ? 'Nome do encarregado é obrigatório.' : false })} /></Field>
            <Field label="Parentesco"><Input placeholder="Pai, mãe, tio…" {...register('enc_parentesco')} /></Field>
            <Field label="Telefone" error={err('enc_telefone')}><Input {...register('enc_telefone', { required: modo === 'novo' ? 'Telefone do encarregado é obrigatório.' : false })} /></Field>
            <Field label="Telefone alternativo"><Input {...register('enc_telefoneAlt')} /></Field>
            <Field label="E-mail"><Input type="email" {...register('enc_email')} /></Field>
            <Field label="Morada" className="sm:col-span-3"><Input {...register('enc_morada')} /></Field>
          </div>
        )}
        {modo === 'nenhum' && <p className="text-sm text-muted">O aluno fica sem encarregado associado.</p>}
      </Card>

      {!aluno && (
        <Card>
          <label className="mb-4 flex items-center gap-2 font-semibold">
            <input type="checkbox" className="size-4 accent-primary" checked={inscrever} onChange={(e) => setInscrever(e.target.checked)} />
            Inscrever já numa rota
          </label>
          {inscrever && <InscricaoCampos valores={insc} onChange={setInsc} />}
        </Card>
      )}

      {erro && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</p>}
      <Button type="submit" loading={formState.isSubmitting}>
        {aluno ? 'Guardar' : inscrever ? 'Guardar e ir para pagamento' : 'Guardar'}
      </Button>
    </form>
  );
}
