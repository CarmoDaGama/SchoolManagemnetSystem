import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrigemBackup } from '@prisma/client';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

const PADRAO_FICHEIRO = /^transporte_\d{8}_\d{6}(_\d+)?\.sql$/;

/** Nome em hora local com segundos e sufixo se já existir: nunca sobrescreve uma cópia (ex.: "antes de restauro" no mesmo segundo). */
async function nomeFicheiro(pasta: string, d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `transporte_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  for (let n = 0; ; n++) {
    const nome = n ? `${base}_${n}.sql` : `${base}.sql`;
    const existe = await fs.access(path.join(pasta, nome)).then(() => true, () => false);
    if (!existe) return nome;
  }
}

/**
 * Em produção: mysqldump/mysql do Windows com --defaults-extra-file (tem de ser o 1.º argumento).
 * Em desenvolvimento (BACKUP_DOCKER_CONTAINER): os mesmos binários dentro do contentor MySQL.
 */
function comando(bin: 'mysqldump' | 'mysql', args: string[]): [string, string[]] {
  const url = new URL(process.env.DATABASE_URL!);
  const base = url.pathname.slice(1);
  const container = process.env.BACKUP_DOCKER_CONTAINER;
  if (container) {
    return ['docker', ['exec', '-i', '-e', `MYSQL_PWD=${decodeURIComponent(url.password)}`, container, bin, `-u${decodeURIComponent(url.username)}`, ...args, base]];
  }
  const exe = bin === 'mysqldump' ? process.env.MYSQLDUMP_PATH : process.env.MYSQL_PATH;
  if (!exe) throw new Error(`${bin === 'mysqldump' ? 'MYSQLDUMP_PATH' : 'MYSQL_PATH'} não está definido no ficheiro .env.`);
  return [exe, [`--defaults-extra-file=${process.env.MYSQL_CNF}`, ...args, base]];
}

@Injectable()
export class BackupService {
  private emCurso = false;
  /** Lido pelo guard global: durante o restauro recusam-se escritas. */
  restaurando = false;
  private readonly log = new Logger('Backup');

  constructor(private prisma: PrismaService) {}

  config() {
    return this.prisma.configBackup.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  // A cada minuto: faz a cópia do dia assim que passar da hora definida.
  // Se o PC esteve desligado à hora marcada, a cópia é feita logo que o serviço arranca.
  @Interval(60_000)
  async verificarAgendado() {
    try {
      const cfg = await this.prisma.configBackup.findUnique({ where: { id: 1 } });
      if (!cfg?.activo || this.emCurso) return;
      const agora = new Date();
      const [h, m] = cfg.hora.split(':').map(Number);
      const marcada = new Date(agora);
      marcada.setHours(h, m, 0, 0);
      if (agora < marcada) return;
      const meiaNoite = new Date(agora);
      meiaNoite.setHours(0, 0, 0, 0);
      const feita = await this.prisma.registoBackup.count({ where: { origem: 'AGENDADO', sucesso: true, inicio: { gte: meiaNoite } } });
      if (feita) return;
      const falhaRecente = await this.prisma.registoBackup.count({
        where: { origem: 'AGENDADO', sucesso: false, inicio: { gte: new Date(agora.getTime() - 3_600_000) } },
      });
      if (falhaRecente) return; // no máximo 1 tentativa falhada por hora
      await this.executar('AGENDADO');
    } catch (e) {
      this.log.error((e as Error).message);
    }
  }

  async executar(origem: OrigemBackup, utilizadorId?: number) {
    if (this.emCurso) throw new ConflictException('Já está a decorrer uma cópia de segurança.');
    this.emCurso = true;
    const cfg = await this.config();
    const reg = await this.prisma.registoBackup.create({ data: { origem, utilizadorId } });
    let destino = '';
    try {
      await fs.mkdir(cfg.pastaLocal, { recursive: true });
      const ficheiro = await nomeFicheiro(cfg.pastaLocal);
      destino = path.join(cfg.pastaLocal, ficheiro);
      const [exe, args] = comando('mysqldump', ['--single-transaction', '--routines', '--triggers', '--no-tablespaces', '--default-character-set=utf8mb4']);
      await this.correr(exe, args, { stdoutPara: destino });
      const { size } = await fs.stat(destino);

      let copiadoExterno = false;
      let aviso: string | null = null;
      if (cfg.pastaExterna) {
        try {
          await fs.mkdir(cfg.pastaExterna, { recursive: true });
          await fs.copyFile(destino, path.join(cfg.pastaExterna, ficheiro));
          copiadoExterno = true;
        } catch {
          aviso = 'A cópia foi feita no computador, mas a pen não estava disponível.';
        }
      }
      await this.apagarAntigas(cfg.pastaLocal, cfg.retencaoDias);
      if (copiadoExterno) await this.apagarAntigas(cfg.pastaExterna!, cfg.retencaoDias);

      return await this.prisma.registoBackup.update({
        where: { id: reg.id },
        data: { fim: new Date(), sucesso: true, ficheiro, tamanhoBytes: size, copiadoExterno, aviso },
      });
    } catch (e) {
      if (destino) await fs.unlink(destino).catch(() => null);
      await this.prisma.registoBackup.update({ where: { id: reg.id }, data: { fim: new Date(), aviso: (e as Error).message.slice(0, 4000) } });
      this.log.error(`Cópia ${origem} falhou: ${(e as Error).message}`);
      throw new InternalServerErrorException('A cópia de segurança falhou. Veja o histórico.');
    } finally {
      this.emCurso = false;
    }
  }

  async verificarPasta(caminho: string) {
    if (!path.isAbsolute(caminho)) throw new BadRequestException('Indique um caminho completo, ex.: E:\\CopiasTransporte');
    const teste = path.join(caminho, `.teste_${Date.now()}`);
    try {
      await fs.mkdir(caminho, { recursive: true });
      await fs.writeFile(teste, 'ok');
      await fs.unlink(teste);
      const s = await fs.statfs(caminho);
      return { ok: true, livreBytes: s.bavail * s.bsize };
    } catch {
      return { ok: false, mensagem: 'Não foi possível escrever nesta pasta. A pen está ligada e a letra está certa?' };
    }
  }

  historico() {
    return this.prisma.registoBackup.findMany({ orderBy: { inicio: 'desc' }, take: 100 });
  }

  async ficheiros() {
    const cfg = await this.config();
    const listar = async (pasta: string | null, local: 'LOCAL' | 'EXTERNA') => {
      if (!pasta) return { disponivel: false, ficheiros: [] };
      try {
        const nomes = (await fs.readdir(pasta)).filter((f) => PADRAO_FICHEIRO.test(f));
        const ficheiros = await Promise.all(
          nomes.map(async (nome) => {
            const s = await fs.stat(path.join(pasta, nome));
            return { local, nome, tamanhoBytes: s.size, data: s.mtime };
          }),
        );
        return { disponivel: true, ficheiros: ficheiros.sort((a, b) => b.data.getTime() - a.data.getTime()) };
      } catch {
        return { disponivel: false, ficheiros: [] };
      }
    };
    return { local: await listar(cfg.pastaLocal, 'LOCAL'), externa: await listar(cfg.pastaExterna, 'EXTERNA') };
  }

  async estado() {
    const cfg = await this.config();
    const [ultimaOk, ultima] = await Promise.all([
      this.prisma.registoBackup.findFirst({ where: { sucesso: true }, orderBy: { inicio: 'desc' } }),
      this.prisma.registoBackup.findFirst({ orderBy: { inicio: 'desc' } }),
    ]);
    const alertas: string[] = [];
    if (!cfg.activo) alertas.push('A cópia de segurança diária está desligada.');
    if (!ultimaOk) alertas.push('Ainda não foi feita nenhuma cópia de segurança.');
    else if (Date.now() - ultimaOk.inicio.getTime() > 24 * 3_600_000) alertas.push('A última cópia de segurança tem mais de 24 horas.');
    if (ultima && ultima.fim && !ultima.sucesso) alertas.push('A última tentativa de cópia falhou.');
    if (ultima?.sucesso && cfg.pastaExterna && !ultima.copiadoExterno) alertas.push('A última cópia não foi para a pen (não estava ligada).');
    return { ultimaCopia: ultimaOk, ultimaTentativa: ultima, alertas, activo: cfg.activo, hora: cfg.hora };
  }

  async restaurar(dto: { local: 'LOCAL' | 'EXTERNA'; ficheiro: string; confirmacao: string }, utilizadorId: number) {
    if (dto.confirmacao !== 'RESTAURAR') throw new BadRequestException('Escreva RESTAURAR para confirmar.');
    const cfg = await this.config();
    const pasta = dto.local === 'LOCAL' ? cfg.pastaLocal : cfg.pastaExterna;
    const nome = path.basename(dto.ficheiro); // impede ../
    if (!pasta || !PADRAO_FICHEIRO.test(nome)) throw new BadRequestException('Ficheiro inválido.');
    const origem = path.join(pasta, nome);
    await fs.access(origem).catch(() => {
      throw new NotFoundException('O ficheiro já não existe nessa pasta.');
    });

    await this.executar('ANTES_RESTAURO', utilizadorId); // rede de segurança
    this.emCurso = true;
    this.restaurando = true;
    try {
      const [exe, args] = comando('mysql', ['--default-character-set=utf8mb4']);
      await this.correr(exe, args, { stdinDe: origem });
    } catch (e) {
      throw new InternalServerErrorException(`O restauro falhou: ${(e as Error).message.split('\n')[0]}. Existe uma cópia "antes de restauro" para voltar atrás.`);
    } finally {
      this.emCurso = false;
      this.restaurando = false;
    }
    // o mysqldump inclui DROP TABLE: o conteúdo actual foi substituído (incluindo o histórico de cópias)
    await this.prisma.registoBackup.create({ data: { origem: 'MANUAL', sucesso: true, fim: new Date(), utilizadorId, aviso: `Restaurado a partir de ${nome}` } }).catch(() => null);
    return { ok: true, mensagem: 'Dados restaurados. Entre novamente no sistema.' };
  }

  private correr(exe: string, args: string[], io: { stdoutPara?: string; stdinDe?: string }) {
    return new Promise<void>((ok, falha) => {
      const p = spawn(exe, args, { windowsHide: true });
      let erro = '';
      p.stderr.on('data', (d) => (erro += d));
      p.on('error', (e) => falha(new Error(`Não foi possível executar ${exe}: ${e.message}`)));
      // o processo pode terminar antes de o ficheiro estar todo escrito: esperar pelo 'finish'
      const escrito = new Promise<void>((fim, erroEscrita) => {
        if (!io.stdoutPara) return fim();
        const out = createWriteStream(io.stdoutPara);
        out.on('finish', fim);
        out.on('error', erroEscrita);
        p.stdout.pipe(out);
      });
      if (io.stdinDe) createReadStream(io.stdinDe).pipe(p.stdin);
      p.on('close', (code) => {
        const mensagens = erro.split('\n').filter((l) => l.trim() && !/Using a password|Warning/i.test(l)).join('\n');
        if (code !== 0) return falha(new Error(mensagens || `${path.basename(exe)} terminou com código ${code}`));
        escrito.then(ok, falha);
      });
    });
  }

  private async apagarAntigas(pasta: string, dias: number) {
    const limite = Date.now() - dias * 86_400_000;
    for (const f of await fs.readdir(pasta)) {
      if (!PADRAO_FICHEIRO.test(f)) continue;
      const alvo = path.join(pasta, f);
      if ((await fs.stat(alvo)).mtimeMs < limite) await fs.unlink(alvo);
    }
  }
}
