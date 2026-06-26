import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditV3Service } from './credit-v3.service';
import { VerifyProofDto } from './dto/verify-proof.dto';

@Controller('credit')
export class CreditController {
  constructor(
    private readonly credit: CreditService,
    private readonly creditV3: CreditV3Service,
  ) {}

  // ── v1 — legacy ───────────────────────────────────────────────────────────

  @Post('verify')
  @HttpCode(200)
  async verify(@Body() dto: VerifyProofDto) {
    return this.credit.verifyProof(dto);
  }

  @Get('tier/:wallet')
  async getTier(@Param('wallet') wallet: string) {
    const record = await this.credit.getCreditTier(wallet);
    return { record };
  }

  @Get('valid/:wallet')
  async isValid(@Param('wallet') wallet: string) {
    const valid = await this.credit.isCreditValid(wallet);
    return { valid };
  }

  // ── v3 — bulletproof credit (LENDER-FACING API) ───────────────────────────

  /** Full credit record + lender-friendly fields (tier, range, loan, risk score). */
  @Get('v3/:wallet')
  async getCreditV3(@Param('wallet') wallet: string) {
    const record = await this.creditV3.getCreditRecord(wallet);
    if (!record) {
      throw new NotFoundException({
        wallet,
        reason: 'No active Zava credit record. Borrower must claim credit first.',
      });
    }
    return jsonSafe(record);
  }

  /** Just the eligible loan amount (lightweight). */
  @Get('v3/:wallet/eligibility')
  async getEligibility(@Param('wallet') wallet: string) {
    const result = await this.creditV3.getLoanEligibility(wallet);
    return jsonSafe(result);
  }

  /** Simulated loan decision. Lender submits requested amount, gets terms back. */
  @Get('v3/:wallet/simulate-loan')
  async simulateLoan(
    @Param('wallet') wallet: string,
    @Query('amount') amount: string,
  ) {
    const record = await this.creditV3.getCreditRecord(wallet);
    if (!record) {
      throw new NotFoundException({
        wallet,
        reason: 'No active Zava credit record for this borrower.',
      });
    }
    const requested = parseFloat(amount ?? '0');
    if (!Number.isFinite(requested) || requested <= 0) {
      return { error: 'Provide ?amount=<XLM>' };
    }
    const decision = this.creditV3.simulateLoan(record, requested);
    return jsonSafe({
      borrower: wallet,
      record: { tier: record.tier, riskScore: record.riskScore },
      ...decision,
    });
  }
}

/** Recursively convert bigint → string so JSON.stringify doesn't crash. */
function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, val) => typeof val === 'bigint' ? val.toString() : val));
}
