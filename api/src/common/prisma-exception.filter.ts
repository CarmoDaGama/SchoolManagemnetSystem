import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro na base de dados.';
    switch (e.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'Já existe um registo com estes dados.';
        break;
      case 'P2003':
      case 'P2014':
        status = HttpStatus.CONFLICT;
        message = 'Este registo está a ser usado noutro sítio e não pode ser removido.';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Registo não encontrado.';
        break;
      default:
        this.logger.error(`${e.code}: ${e.message}`);
    }
    res.status(status).json({ statusCode: status, message });
  }
}
