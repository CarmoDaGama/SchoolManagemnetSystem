import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { MetodoPagamento } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { chaveMes, hojeUTC } from '../cobrancas/calculo';
import { FinanceiroService } from './financeiro.service';

class PagamentoDto {
  @Type(() => Number) @IsInt() inscricaoId: number;
  @IsArray() @ArrayNotEmpty({ message: 'Seleccione pelo menos um mês.' }) @IsInt({ each: true }) cobrancaIds: number[];
  @IsEnum(MetodoPagamento) metodo: MetodoPagamento;
  @IsOptional() @IsString() referenciaBanc?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) desconto?: number | null;
}

class AnularDto {
  @IsString() @IsNotEmpty() @MinLength(5, { message: 'Descreva o motivo da anulação (mínimo 5 caracteres).' }) motivo: string;
}

class PagamentosQuery {
  @IsOptional() @IsDateString() de?: string;
  @IsOptional() @IsDateString() ate?: string;
  @IsOptional() @Type(() => Number) @IsInt() rotaId?: number;
}

class PagosQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) mes?: string;
  @IsOptional() @Type(() => Number) @IsInt() rotaId?: number;
}

class DevedoresQuery {
  @IsOptional() @Type(() => Number) @IsInt() rotaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minMeses?: number;
}

/** "2026-09-16" → início desse dia no relógio local. */
const inicioDoDia = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

@Controller('financeiro')
export class FinanceiroController {
  constructor(private service: FinanceiroService) {}

  @Get('extracto/:inscricaoId')
  extracto(@Param('inscricaoId', ParseIntPipe) id: number) {
    return this.service.extracto(id);
  }

  @Post('pagamentos')
  registar(@Body() dto: PagamentoDto, @CurrentUser() user: SessionUser) {
    return this.service.registar(dto, user);
  }

  @Get('pagamentos')
  listar(@Query() q: PagamentosQuery) {
    const agora = new Date();
    const de = q.de ? inicioDoDia(q.de) : new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const ate = q.ate ? inicioDoDia(q.ate) : new Date(de);
    ate.setDate(ate.getDate() + 1); // intervalo inclusivo
    return this.service.listar(de, ate, q.rotaId);
  }

  @Get('pagamentos/:id')
  recibo(@Param('id', ParseIntPipe) id: number) {
    return this.service.recibo(id);
  }

  @Roles('ADMIN')
  @Post('pagamentos/:id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularDto, @CurrentUser() user: SessionUser) {
    return this.service.anular(id, dto.motivo.trim(), user.id);
  }

  @Get('pagos')
  pagos(@Query() q: PagosQuery) {
    return this.service.pagos(q.mes ?? chaveMes(hojeUTC()), q.rotaId);
  }

  @Get('devedores')
  devedores(@Query() q: DevedoresQuery) {
    return this.service.devedores(q);
  }
}
