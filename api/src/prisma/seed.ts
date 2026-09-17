import '../env';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { hojeUTC, inicioMes, planoCobrancas } from '../cobrancas/calculo';

/**
 * Idempotente. Em produção cria só o admin, a Empresa (configurada = false) e a ConfigBackup:
 * os dados reais entram pelos ecrãs de configuração. Com --demo acrescenta dados de exemplo.
 */
const prisma = new PrismaClient();

async function main() {
  const senha = process.env.ADMIN_SENHA ?? 'admin123';
  await prisma.utilizador.upsert({
    where: { username: 'admin' },
    update: {},
    create: { nome: 'Administrador', username: 'admin', role: 'ADMIN', senhaHash: await bcrypt.hash(senha, 10) },
  });
  await prisma.empresa.upsert({ where: { id: 1 }, update: {}, create: { id: 1, nome: 'Transporte Escolar' } });
  await prisma.configBackup.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, pastaLocal: process.env.BACKUP_DIR_INICIAL ?? 'C:\\TransporteApp\\backups' },
  });
  console.log('Seed: admin, empresa e configuração de cópias garantidos.');

  if (process.argv.includes('--demo')) await demo();
}

async function demo() {
  const agora = new Date();
  const anoInicio = agora.getMonth() >= 7 ? agora.getFullYear() : agora.getFullYear() - 1;
  const empresa = await prisma.empresa.update({
    where: { id: 1 },
    data: {
      nome: 'Transportes Exemplo, Lda', nif: '5000000000', endereco: 'Luanda, Angola', telefone: '923 000 000',
      diaLimite: 10, diasTolerancia: 0, tipoMulta: 'PERCENTAGEM', multaValor: 10, taxaInscricao: 5000, configurada: true,
    },
  });
  await prisma.utilizador.upsert({
    where: { username: 'operador' },
    update: {},
    create: { nome: 'Operador', username: 'operador', role: 'OPERADOR', senhaHash: await bcrypt.hash('operador123', 10) },
  });
  const ano = await prisma.anoLectivo.upsert({
    where: { nome: `${anoInicio}/${anoInicio + 1}` },
    update: {},
    create: { nome: `${anoInicio}/${anoInicio + 1}`, anoInicio, mesInicio: 9, mesesServico: 10, activo: true },
  });
  const rotas = [];
  for (const r of [
    { codigo: 'R01', nome: 'Talatona – Morro Bento', motorista: 'João Manuel', telefoneMotorista: '923 111 111', viatura: 'LD-12-34-AB', capacidade: 25, valorMensal: 35000 },
    { codigo: 'R02', nome: 'Kilamba – Camama', motorista: 'Pedro Afonso', telefoneMotorista: '923 222 222', viatura: 'LD-56-78-CD', capacidade: 30, valorMensal: 40000 },
  ]) {
    rotas.push(await prisma.rota.upsert({ where: { codigo: r.codigo }, update: {}, create: r }));
  }
  const nomes = ['Ana Paula Domingos', 'Bruno Kiala', 'Carla Neto', 'Daniel Sebastião', 'Eva Lukamba', 'Filipe Cardoso'];
  for (const [i, nome] of nomes.entries()) {
    const numero = `T-${String(i + 1).padStart(5, '0')}`;
    if (await prisma.aluno.findUnique({ where: { numero } })) continue;
    const enc = await prisma.encarregado.create({ data: { nome: `Encarregado de ${nome.split(' ')[0]}`, telefone: `92300000${i}` } });
    const aluno = await prisma.aluno.create({
      data: { numero, nome, colegio: 'Colégio Exemplo', classe: `${5 + (i % 4)}.ª`, turma: 'A', encarregadoId: enc.id, pontoReferencia: 'Junto à farmácia' },
    });
    const rota = rotas[i % 2];
    const mesEntrada = inicioMes(new Date(Date.UTC(anoInicio, 8 + (i % 2), 1)));
    await prisma.inscricao.create({
      data: {
        alunoId: aluno.id, anoLectivoId: ano.id, rotaId: rota.id, mesEntrada, valorMensal: rota.valorMensal,
        pontoRecolha: 'Portão principal', horaRecolha: `06:${String(30 + i * 5).padStart(2, '0')}`,
        cobrancas: { create: planoCobrancas(ano, empresa, mesEntrada, new Prisma.Decimal(rota.valorMensal), 'NOVA', true, hojeUTC()) },
      },
    });
  }
  await prisma.sequencia.upsert({ where: { chave: 'aluno' }, update: { valor: nomes.length }, create: { chave: 'aluno', valor: nomes.length } });
  console.log('Seed: dados de exemplo criados (utilizador operador / operador123).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
