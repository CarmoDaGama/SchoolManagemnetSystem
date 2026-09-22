/*
  Teste do sistema contra MySQL 5.6, a versão instalada no PC do cliente.
  Precisa da API a correr em 127.0.0.1:3100 contra uma base criada pela seed --demo.
  Com SEM_COPIAS=1 salta a cópia de segurança e o restauro (quando não há mysqldump compatível).
*/
const BASE = 'http://127.0.0.1:3100/api';
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

async function sessao(username, senha) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, senha }) });
  const cookie = r.headers.get('set-cookie')?.split(';')[0];
  return {
    status: r.status,
    call: async (method, path, body) => {
      const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const t = await res.text();
      return { status: res.status, data: t ? JSON.parse(t) : null };
    },
  };
}

const admin = await sessao('admin', 'admin123');
ok(admin.status === 200, 'login');

const ano = (await admin.call('GET', '/anos-lectivos/activo')).data;
const rotas = (await admin.call('GET', '/rotas')).data.data;
ok(ano?.meses?.length === 10 && rotas.length === 2, `seed: ano ${ano?.nome}, ${rotas.length} rotas`);

// aluno + inscrição (transacção, sequência, cobranças)
const novo = await admin.call('POST', '/alunos', {
  nome: 'Aluno Cinco Seis', colegio: 'Colégio Acentuação', classe: '6.ª',
  encarregado: { nome: 'Encarregado Ção', telefone: '923555555' },
  inscricao: { rotaId: rotas[0].id, mesEntrada: ano.meses[0].chave, pontoRecolha: 'Praça', horaRecolha: '06:50' },
});
ok(novo.status === 201, `aluno criado ${novo.data?.numero}`);
const aluno = (await admin.call('GET', `/alunos/${novo.data.id}`)).data;
ok(aluno.nome === 'Aluno Cinco Seis' && aluno.colegio === 'Colégio Acentuação', `acentos guardados: ${aluno.colegio}`);
const insc = aluno.inscricaoActual;

let ext = (await admin.call('GET', `/financeiro/extracto/${insc.id}`)).data;
const mens = ext.cobrancas.filter((c) => c.tipo === 'MENSALIDADE');
ok(mens.length === 10, `${mens.length} mensalidades`);

// pagamento com multa e recibo (AuditLog escrito no desconto)
let r = await admin.call('POST', '/financeiro/pagamentos', { inscricaoId: insc.id, cobrancaIds: [mens[0].id], metodo: 'NUMERARIO', desconto: 500 });
ok(r.status === 201, `pagamento ${r.data?.numeroRecibo ?? r.data?.message}`);
const pagId = r.data.id;
ok((await admin.call('GET', `/financeiro/pagamentos/${pagId}`)).data.itens.length === 1, 'recibo');

// acções que escrevem no registo de auditoria (coluna dados, antes JSON)
r = await admin.call('POST', `/cobrancas/${mens[1].id}/isentar`, { motivo: 'teste 5.6' });
ok(r.status === 200, `isentar: ${r.data?.message ?? 'ok'}`);
r = await admin.call('POST', `/inscricoes/${insc.id}/suspender`, { mes: ano.meses[5].chave, motivo: 'teste 5.6' });
ok(r.status === 200 && r.data.mesesAnulados === 5, `suspender: ${r.data?.mesesAnulados ?? r.data?.message}`);
r = await admin.call('POST', `/inscricoes/${insc.id}/reactivar`, { mes: ano.meses[7].chave });
ok(r.status === 200 && r.data.meses === 3, `reactivar: ${r.data?.meses ?? r.data?.message}`);
r = await admin.call('POST', `/financeiro/pagamentos/${pagId}/anular`, { motivo: 'teste de anulação' });
ok(r.status === 200, `anular: ${r.data?.message ?? 'ok'}`);

// listagens
const mapa = (await admin.call('GET', '/cobrancas/mapa')).data;
ok(mapa.linhas.length >= 7, `mapa: ${mapa.linhas.length} linhas`);
ok((await admin.call('GET', '/financeiro/devedores')).status === 200, 'devedores');
ok((await admin.call('GET', `/financeiro/pagos?mes=${ano.meses[0].chave}`)).status === 200, 'pagos');
ok((await admin.call('GET', '/painel')).data.alunosActivos > 0, 'painel');

// cópia de segurança e restauro com o mysqldump 5.6
if (process.env.SEM_COPIAS) {
  console.log('… cópia e restauro saltados (SEM_COPIAS=1)');
  console.log(falhas ? `\n${falhas} FALHAS` : '\nTudo OK com MySQL 5.6');
  process.exit(falhas ? 1 : 0);
}
r = await admin.call('POST', '/backup/agora');
ok(r.status === 200 && r.data.sucesso && r.data.tamanhoBytes > 1000, `cópia: ${r.data?.ficheiro ?? r.data?.message} (${r.data?.tamanhoBytes} bytes)`);
const copia = r.data.ficheiro;
const antes = (await admin.call('GET', '/alunos?q=Cinco')).data.total;
r = await admin.call('POST', '/alunos', { nome: 'Apagar No Restauro' });
ok(r.status === 201, 'aluno criado depois da cópia');
r = await admin.call('POST', '/backup/restaurar', { local: 'LOCAL', ficheiro: copia, confirmacao: 'RESTAURAR' });
ok(r.status === 200, `restauro: ${r.data?.mensagem ?? r.data?.message}`);
const admin2 = await sessao('admin', 'admin123');
const depois = (await admin2.call('GET', '/alunos?q=Apagar')).data;
ok(depois.total === 0, `aluno posterior desapareceu (${depois.total} encontrados)`);
const acentos = (await admin2.call('GET', '/alunos?q=Cinco')).data;
ok(acentos.total === antes && acentos.data[0].colegio === 'Colégio Acentuação', `acentos intactos após restauro: ${acentos.data[0]?.colegio}`);

console.log(falhas ? `\n${falhas} FALHAS` : '\nTudo OK com MySQL 5.6');
process.exit(falhas ? 1 : 0);
