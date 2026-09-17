import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { HealthController } from './health.controller';
import { AuthController } from './auth/auth.controller';
import { UtilizadoresController } from './utilizadores/utilizadores.controller';
import { EmpresaController } from './empresa/empresa.controller';
import { AnosLectivosController } from './anos-lectivos/anos-lectivos.controller';
import { RotasController } from './rotas/rotas.controller';
import { EncarregadosController } from './alunos/encarregados.controller';
import { AlunosController } from './alunos/alunos.controller';
import { InscricoesController } from './inscricoes/inscricoes.controller';
import { InscricoesService } from './inscricoes/inscricoes.service';
import { CobrancasController } from './cobrancas/cobrancas.controller';
import { FinanceiroController } from './financeiro/financeiro.controller';
import { FinanceiroService } from './financeiro/financeiro.service';
import { PainelController } from './painel/painel.controller';
import { BackupController } from './backup/backup.controller';
import { BackupService } from './backup/backup.service';
import { EscritaBloqueadaGuard } from './backup/escrita-bloqueada.guard';

const webDir = (() => {
  const d = process.env.WEB_DIR ?? 'web';
  return isAbsolute(d) ? d : join(process.cwd(), d);
})();

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET em falta no ficheiro .env');

@Module({
  imports: [
    ...(existsSync(webDir) ? [ServeStaticModule.forRoot({ rootPath: webDir, exclude: ['/api/{*path}'] })] : []),
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET, signOptions: { expiresIn: '8h' } }),
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    UtilizadoresController,
    EmpresaController,
    AnosLectivosController,
    RotasController,
    EncarregadosController,
    AlunosController,
    InscricoesController,
    CobrancasController,
    FinanceiroController,
    PainelController,
    BackupController,
  ],
  providers: [
    InscricoesService,
    FinanceiroService,
    BackupService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: EscritaBloqueadaGuard },
  ],
})
export class AppModule {}
