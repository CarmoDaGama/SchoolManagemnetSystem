import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Após reiniciar o Windows o MySQL pode ainda não estar pronto.
    for (let tentativa = 1; ; tentativa++) {
      try {
        await this.$connect();
        return;
      } catch (e) {
        if (tentativa >= 20) throw e;
        this.logger.warn(`MySQL indisponível (tentativa ${tentativa}/20). Nova tentativa em 3 s.`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Incremento atómico de uma sequência (processo-2026, recibo-2026). */
  async proximo(tx: Tx, chave: string): Promise<number> {
    const seq = await tx.sequencia.upsert({
      where: { chave },
      create: { chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return seq.valor;
  }

  audit(tx: Tx, utilizadorId: number | null, accao: string, entidade: string, entidadeId: string | number, dados?: unknown) {
    return tx.auditLog.create({
      data: {
        utilizadorId,
        accao,
        entidade,
        entidadeId: String(entidadeId),
        // texto JSON: o MySQL 5.6 do cliente não tem o tipo JSON
        dados: dados === undefined ? undefined : JSON.stringify(dados),
      },
    });
  }
}
