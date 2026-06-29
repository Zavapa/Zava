import { Body, Controller, Get, HttpCode, NotFoundException, Param, Put } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Cadence, SavingsRange } from './plan.entity';
import { PlanService } from './plan.service';

class UpsertPlanDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'wallet must be a 56-char Stellar G-address' })
  wallet!: string;

  @IsIn(['weekly', 'monthly'])
  cadence!: Cadence;

  @IsIn(['R5', 'R20', 'R50', 'R200', 'R500'])
  targetRange!: SavingsRange;

  @IsOptional()
  @IsString()
  label?: string;
}

@Controller('plan')
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @Get(':wallet')
  async get(@Param('wallet') wallet: string) {
    const plan = await this.plans.getByWallet(wallet);
    if (!plan) {
      throw new NotFoundException({ wallet, reason: 'No savings plan declared yet.' });
    }
    return jsonSafe(plan);
  }

  @Put()
  @HttpCode(200)
  async upsert(@Body() dto: UpsertPlanDto) {
    const plan = await this.plans.upsert(dto);
    return jsonSafe(plan);
  }
}

function jsonSafe<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
  );
}
