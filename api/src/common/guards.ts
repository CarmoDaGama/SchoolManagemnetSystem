import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC, ROLES } from './auth.decorators';

export const COOKIE_SESSAO = 'escola_sessao';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[COOKIE_SESSAO];
    if (!token) throw new UnauthorizedException('Sessão expirada. Entre novamente.');

    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }
    const user = await this.prisma.utilizador.findUnique({
      where: { id: payload.sub },
      select: { id: true, nome: true, username: true, role: true, activo: true },
    });
    if (!user || !user.activo) throw new UnauthorizedException('Utilizador inactivo.');
    req.user = { id: user.id, nome: user.nome, username: user.username, role: user.role };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Sem permissão para esta operação.');
    return true;
  }
}
