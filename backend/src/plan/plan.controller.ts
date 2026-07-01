import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Cadence, SavingsRange } from './plan.entity';
import { PlanService } from './plan.service';

class CreatePlanDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'wallet must be a 56-char Stellar G-address' })
  wallet!: string;

  @IsIn(['weekly', 'monthly'])
  cadence!: Cadence;

  @IsIn(['R5', 'R20', 'R50', 'R200', 'R500'])
  targetRange!: SavingsRange;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;
}

class UpdatePlanDto {
  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  cadence?: Cadence;

  @IsOptional()
  @IsIn(['R5', 'R20', 'R50', 'R200', 'R500'])
  targetRange?: SavingsRange;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;
}

@Controller('plan')
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  /** List all plans for a wallet. Pass ?includeArchived=1 to include archived ones. */
  @Get(':wallet')
  async list(
    @Param('wallet') wallet: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const list = await this.plans.listByWallet(wallet, includeArchived === '1');
    return { plans: list.map(jsonSafe) };
  }

  /** Fetch one plan by id (used by the plan-detail page). */
  @Get('id/:id')
  async getOne(@Param('id') id: string) {
    return jsonSafe(await this.plans.getById(id));
  }

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreatePlanDto) {
    return jsonSafe(await this.plans.create(dto));
  }

  @Patch(':id')
  @HttpCode(200)
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return jsonSafe(await this.plans.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(200)
  async archive(@Param('id') id: string) {
    return jsonSafe(await this.plans.archive(id));
  }
}

function jsonSafe<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
  );
}
