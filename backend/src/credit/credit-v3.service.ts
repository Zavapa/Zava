import { Injectable, Logger } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';

export type CreditTierV3 = 'None' | 'Medium' | 'Low' | 'VeryLow';
export type SavingsRange = 'R5' | 'R20' | 'R50' | 'R200' | 'R500';

export interface CreditRecordV3 {
  wallet: string;
  tier: CreditTierV3;
  savingsRange: SavingsRange;
  loanEligibleStroops: bigint;
  loanEligibleXlm: number;
  loanEligibleUsd: number; // assumes ~$0.10/XLM, adjust at deploy
  activeWeeks: number;
  withdrawnWeeks: number;
  verifiedAt: number;
  expiresAt: number;
  // Lender-facing helpers
  rangeMinWeeklyXlm: number;
  rangeLabelUsd: number; // "R20" → 20
  riskScore: number;     // 0-100; higher = lower risk
}

/** Numeric weekly lower bound in XLM for each savings range (matches contract). */
const RANGE_TO_MIN_XLM: Record<SavingsRange, number> = {
  R5: 50,
  R20: 200,
  R50: 500,
  R200: 2000,
  R500: 5000,
};
const RANGE_TO_LABEL: Record<SavingsRange, number> = {
  R5: 5, R20: 20, R50: 50, R200: 200, R500: 500,
};

/** Convert a tier + active weeks into a 0–100 lender-friendly score. */
function computeRiskScore(tier: CreditTierV3, activeWeeks: number, withdrawn: number): number {
  const tierBase = { None: 0, Medium: 60, Low: 75, VeryLow: 90 }[tier];
  const weekBonus = Math.min(10, activeWeeks / 3);
  const withdrawPenalty = Math.min(15, withdrawn * 1.5);
  return Math.max(0, Math.min(100, Math.round(tierBase + weekBonus - withdrawPenalty)));
}

@Injectable()
export class CreditV3Service {
  private readonly logger = new Logger(CreditV3Service.name);

  constructor(private readonly stellar: StellarService) {}

  private get creditContractId(): string {
    return this.stellar.contracts.credit;
  }

  /** Fetch the on-chain credit record for a wallet. Null if no record / expired. */
  async getCreditRecord(wallet: string): Promise<CreditRecordV3 | null> {
    const raw = (await this.stellar.readContract(
      this.creditContractId,
      'get_credit_record',
      [this.stellar.addressScVal(wallet)],
    )) as
      | {
          wallet: string;
          tier: { tag: CreditTierV3 } | CreditTierV3;
          savings_range: { tag: SavingsRange } | SavingsRange;
          loan_eligible_stroops: bigint | string;
          active_weeks: number;
          withdrawn_weeks: number;
          verified_at: bigint | number;
          expires_at: bigint | number;
        }
      | null;
    if (!raw) return null;

    const tier      = this.unpackEnum<CreditTierV3>(raw.tier);
    const range     = this.unpackEnum<SavingsRange>(raw.savings_range);
    const stroops   = BigInt(raw.loan_eligible_stroops as bigint);
    const xlm       = Number(stroops) / 10_000_000;
    const usd       = xlm * 0.10;
    const activeW   = Number(raw.active_weeks);
    const withdrawW = Number(raw.withdrawn_weeks);

    return {
      wallet,
      tier,
      savingsRange: range,
      loanEligibleStroops: stroops,
      loanEligibleXlm: xlm,
      loanEligibleUsd: Math.round(usd * 100) / 100,
      activeWeeks: activeW,
      withdrawnWeeks: withdrawW,
      verifiedAt: Number(raw.verified_at),
      expiresAt: Number(raw.expires_at),
      rangeMinWeeklyXlm: RANGE_TO_MIN_XLM[range],
      rangeLabelUsd: RANGE_TO_LABEL[range],
      riskScore: computeRiskScore(tier, activeW, withdrawW),
    };
  }

  /** Just the loan amount — for fast eligibility checks. */
  async getLoanEligibility(wallet: string): Promise<{ stroops: bigint; xlm: number; usd: number }> {
    const raw = (await this.stellar.readContract(
      this.creditContractId,
      'get_loan_eligibility',
      [this.stellar.addressScVal(wallet)],
    )) as bigint | null;
    const stroops = BigInt(raw ?? 0);
    const xlm = Number(stroops) / 10_000_000;
    return { stroops, xlm, usd: Math.round(xlm * 10) / 100 };
  }

  /** Simulated loan approval — returns terms but does NOT disburse funds. */
  simulateLoan(record: CreditRecordV3, requestedXlm: number) {
    const eligible = record.loanEligibleXlm;
    const approvedXlm = Math.min(requestedXlm, eligible);
    const approved = approvedXlm > 0;

    // Interest rate scales inversely with credit tier
    const rateByTier = { None: 0, Medium: 18, Low: 12, VeryLow: 8 } as const;
    const interestRate = rateByTier[record.tier];
    const termWeeks = record.activeWeeks; // mirror their proven savings horizon
    const totalRepayable = approved
      ? Math.round(approvedXlm * (1 + (interestRate / 100) * (termWeeks / 52)) * 100) / 100
      : 0;

    return {
      approved,
      requestedXlm,
      approvedXlm: Math.round(approvedXlm * 100) / 100,
      approvedUsd: Math.round(approvedXlm * 0.10 * 100) / 100,
      interestRate,
      termWeeks,
      totalRepayable,
      decision: approved
        ? `Approved on the basis of ${record.tier} tier credit verified by ZK proof on ${new Date(record.verifiedAt * 1000).toLocaleDateString()}.`
        : 'Insufficient credit history.',
      borrowerVisible: {
        tier: record.tier,
        riskScore: record.riskScore,
        savingsRangeLabel: `≥ $${record.rangeLabelUsd}/week`,
        activeWeeks: record.activeWeeks,
      },
    };
  }

  private unpackEnum<T extends string>(v: { tag: T } | T): T {
    if (typeof v === 'object' && v !== null && 'tag' in v) return v.tag;
    return v as T;
  }
}
