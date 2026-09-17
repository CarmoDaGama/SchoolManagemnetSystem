import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BackupService } from './backup.service';

/** Durante um restauro ninguém pode registar pagamentos ou alterar dados a meio. */
@Injectable()
export class EscritaBloqueadaGuard implements CanActivate {
  constructor(private backup: BackupService) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (this.backup.restaurando && req.method !== 'GET') {
      throw new ServiceUnavailableException('Está a decorrer um restauro de dados. Aguarde um momento.');
    }
    return true;
  }
}
