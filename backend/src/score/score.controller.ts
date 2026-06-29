import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScoreService } from './score.service';

class FactorsDto {
  @IsNumber() @Min(0) @Max(1) consistency!: number;
  @IsNumber() @Min(0) @Max(1) inflow!: number;
  @IsNumber() @Min(0) @Max(1) withdrawal!: number;
  @IsNumber() @Min(0) @Max(1) tenure!: number;
  @IsNumber() @Min(0) @Max(1) diversification!: number;
}

class SignalsDto {
  @IsBoolean() meetsSavingsGoal!: boolean;
  @IsBoolean() monthlyInflowAbove500!: boolean;
  @IsBoolean() lowWithdrawalRatio!: boolean;
  @IsBoolean() tenureAbove90d!: boolean;
  @IsBoolean() diversifiedPayers!: boolean;
}

class PlanDto {
  @IsString() cadence!: string;
  @IsString() targetRange!: string;
  @IsOptional() @IsString() label?: string | null;
}

class IssueReportDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  wallet!: string;

  @IsInt() @Min(300) @Max(850)
  score!: number;

  @IsIn(['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'])
  tier!: string;

  @IsString()
  loanEligibleStroops!: string;

  @IsObject() @ValidateNested() @Type(() => FactorsDto)
  factors!: FactorsDto;

  @IsObject() @ValidateNested() @Type(() => SignalsDto)
  signals!: SignalsDto;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => PlanDto)
  plan?: PlanDto | null;

  @IsInt() @Min(0)
  streak!: number;

  @IsOptional() @IsInt() @Min(60)
  ttlSeconds?: number;
}

@Controller('score')
export class ScoreController {
  constructor(private readonly scores: ScoreService) {}

  /** Borrower issues a sharing token containing their precomputed ZCS report. */
  @Post('issue')
  @HttpCode(200)
  async issue(@Body() dto: IssueReportDto) {
    const report = await this.scores.issue({
      wallet: dto.wallet,
      score: dto.score,
      tier: dto.tier,
      loanEligibleStroops: dto.loanEligibleStroops,
      factors: dto.factors,
      signals: dto.signals,
      plan: (dto.plan ?? null) as never,
      streak: dto.streak,
      ttlSeconds: dto.ttlSeconds,
    });
    return jsonSafe(report);
  }

  /** Lender fetches the report using the token the borrower shared. */
  @Get('report/:token')
  async getReport(@Param('token') token: string) {
    const report = await this.scores.getByToken(token);
    return jsonSafe(report);
  }

  /** Quick yes/no — does this report meet a lender's requested loan amount? */
  @Get('report/:token/loan')
  async loan(
    @Param('token') token: string,
    @Query('amount') amount: string,
  ) {
    const report = await this.scores.getByToken(token);
    const requested = parseFloat(amount ?? '0');
    const eligibleXlm = Number(BigInt(report.loanEligibleStroops)) / 10_000_000;
    const approved = Number.isFinite(requested) && requested > 0 && requested <= eligibleXlm;
    const interestRate = tierRate(report.tier);
    const termWeeks = 24;
    const approvedXlm = approved ? requested : 0;
    const totalRepayable = approved
      ? Math.round(approvedXlm * (1 + (interestRate / 100) * (termWeeks / 52)) * 100) / 100
      : 0;
    return {
      borrower: report.wallet,
      score: report.score,
      tier: report.tier,
      requestedXlm: requested,
      approved,
      approvedXlm,
      maxEligibleXlm: eligibleXlm,
      interestRate,
      termWeeks,
      totalRepayable,
      decision: approved
        ? `Approved at the ${report.tier} tier (ZCS ${report.score}).`
        : `Declined — requested ${requested} XLM exceeds eligible ${eligibleXlm.toFixed(2)} XLM.`,
    };
  }
}

function tierRate(tier: string): number {
  switch (tier) {
    case 'Excellent': return 6;
    case 'Very Good': return 8;
    case 'Good':      return 12;
    case 'Fair':      return 18;
    default:          return 0;
  }
}

function jsonSafe<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
  );
}
