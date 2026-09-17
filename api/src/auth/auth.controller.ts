import { Body, Controller, Get, HttpCode, Patch, Post, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Public, SessionUser } from '../common/auth.decorators';
import { COOKIE_SESSAO } from '../common/guards';

class LoginDto {
  @IsString() @IsNotEmpty() username: string;
  @IsString() @IsNotEmpty() senha: string;
}

class TrocarSenhaDto {
  @IsString() @IsNotEmpty() senhaActual: string;
  @IsString() @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres.' }) novaSenha: string;
}

const OITO_HORAS = 8 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.prisma.utilizador.findUnique({ where: { username: dto.username.trim().toLowerCase() } });
    if (!user || !user.activo || !(await bcrypt.compare(dto.senha, user.senhaHash))) {
      throw new UnauthorizedException('Utilizador ou senha incorrectos.');
    }
    const token = await this.jwt.signAsync({ sub: user.id });
    res.cookie(COOKIE_SESSAO, token, { httpOnly: true, sameSite: 'lax', maxAge: OITO_HORAS, path: '/' });
    return { id: user.id, nome: user.nome, username: user.username, role: user.role };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_SESSAO, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  @Patch('senha')
  async trocarSenha(@CurrentUser() user: SessionUser, @Body() dto: TrocarSenhaDto) {
    const u = await this.prisma.utilizador.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(dto.senhaActual, u.senhaHash))) throw new BadRequestException('A senha actual está incorrecta.');
    await this.prisma.utilizador.update({ where: { id: user.id }, data: { senhaHash: await bcrypt.hash(dto.novaSenha, 10) } });
    return { ok: true };
  }
}
