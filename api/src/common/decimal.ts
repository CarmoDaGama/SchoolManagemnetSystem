import { Prisma } from '@prisma/client';

// Chamado uma vez no arranque. Evita {"s":1,"e":4,"d":[...]} nas respostas JSON.
(Prisma.Decimal.prototype as any).toJSON = function (this: Prisma.Decimal) {
  return this.toString();
};
