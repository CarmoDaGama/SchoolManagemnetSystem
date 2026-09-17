import './env';
import './common/decimal';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' }); // logótipo e importação em lote
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();
  if (process.env.NODE_ENV === 'development') {
    app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true });
  }
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port, '127.0.0.1');
  Logger.log(`Transporte Escolar em http://127.0.0.1:${port}`, 'Bootstrap');
}
bootstrap();
