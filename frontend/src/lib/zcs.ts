// Zava Credit Score (ZCS) — 300–850, FICO-like range, computed fully in
// the browser from data the user already has (decrypted vault notes + on-chain
// nullifier-spent checks + declared savings plan).
//
// Five factors with explicit weights:
//   Consistency      35%  — did the user meet their declared goal cadence?
//   Inflow           25%  — total ≥-monthly inflow into the vault
//   Withdrawal       20%  — discipline (low withdrawal ratio = high score)
//   Tenure           10%  — days since first deposit
//   Diversification  10%  — number of distinct deposit weeks (signal proxy)
//
// Output is the same blob the lender retrieves via the sharing-token API,
// so the user's browser is the ONLY thing that handles plaintext amounts.

export type Tier = 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor';
export type Cadence = 'weekly' | 'monthly';
export type SavingsRange = 'R5' | 'R20' | 'R50' | 'R200' | 'R500';

/** Range thresholds in stroops (XLM × 1e7). */
const RANGE_MIN_STROOPS: Record<SavingsRange, number> = {
  R5:   50  * 10_000_000,
  R20:  200 * 10_000_000,
  R50:  500 * 10_000_000,
  R200: 2000 * 10_000_000,
  R500: 5000 * 10_000_000,
};

export interface ScoreFactors {
  consistency: number;   // 0..1
  inflow: number;        // 0..1
  withdrawal: number;    // 0..1 (1 = great discipline)
  tenure: number;        // 0..1
  diversification: number; // 0..1
}

export interface ScoreSignals {
  meetsSavingsGoal: boolean;
  monthlyInflowAbove500: boolean; // $500 ≈ 5000 XLM at testnet pricing
  lowWithdrawalRatio: boolean;    // < 20%
  tenureAbove90d: boolean;
  diversifiedPayers: boolean;     // ≥ 3 distinct deposit weeks
}

export interface DepositForScoring {
  amountStroops: number;
  timestampSec: number;   // unix seconds
  week: number;
  spent: boolean;         // has the nullifier been spent on-chain?
}

export interface PlanForScoring {
  cadence: Cadence;
  targetRange: SavingsRange;
  startedAtSec: number;
  label?: string | null;
}

export interface ScoreReport {
  wallet: string;
  score: number;
  tier: Tier;
  loanEligibleStroops: string;  // bigint as string
  factors: ScoreFactors;
  signals: ScoreSignals;
  streak: number;
  plan: PlanForScoring | null;
  computedAtSec: number;
}

// ─── Sub-scoring functions ────────────────────────────────────────────────

function consistencyScore(deposits: DepositForScoring[], plan: PlanForScoring | null): number {
  if (!plan || deposits.length === 0) return 0;
  // Compute how many of the expected "periods" since plan start were met.
  const now = Math.floor(Date.now() / 1000);
  const periodSec = plan.cadence === 'weekly' ? 7 * 86_400 : 30 * 86_400;
  const elapsedPeriods = Math.max(1, Math.floor((now - plan.startedAtSec) / periodSec));
  const target = RANGE_MIN_STROOPS[plan.targetRange];

  // Bucket deposits into periods.
  const periodHits = new Set<number>();
  for (const d of deposits) {
    if (d.amountStroops < target) continue;
    const periodIndex = Math.floor((d.timestampSec - plan.startedAtSec) / periodSec);
    if (periodIndex >= 0 && periodIndex < elapsedPeriods) periodHits.add(periodIndex);
  }
  return Math.min(1, periodHits.size / elapsedPeriods);
}

function streakLength(deposits: DepositForScoring[], plan: PlanForScoring | null): number {
  if (!plan) return 0;
  const periodSec = plan.cadence === 'weekly' ? 7 * 86_400 : 30 * 86_400;
  const target = RANGE_MIN_STROOPS[plan.targetRange];
  const now = Math.floor(Date.now() / 1000);

  // Walk backwards from the current period, counting hits.
  let streak = 0;
  let endTime = now;
  while (true) {
    const startTime = endTime - periodSec;
    const matched = deposits.some(
      (d) => d.amountStroops >= target && d.timestampSec >= startTime && d.timestampSec < endTime,
    );
    if (!matched) break;
    streak += 1;
    endTime = startTime;
    if (endTime < plan.startedAtSec - periodSec) break;
  }
  return streak;
}

function inflowScore(deposits: DepositForScoring[]): { score: number; monthlyStroops: number } {
  const now = Math.floor(Date.now() / 1000);
  const monthAgo = now - 30 * 86_400;
  const monthlyStroops = deposits
    .filter((d) => d.timestampSec >= monthAgo)
    .reduce((s, d) => s + d.amountStroops, 0);
  // 0 stroops → 0; 100 XLM/mo (1e9) → 0.5; 1000 XLM/mo (1e10) → 1.0
  const xlm = monthlyStroops / 10_000_000;
  const score = Math.min(1, Math.log10(1 + xlm) / 3);
  return { score, monthlyStroops };
}

function withdrawalScore(deposits: DepositForScoring[]): { score: number; ratio: number } {
  if (deposits.length === 0) return { score: 0, ratio: 0 };
  const spent = deposits.filter((d) => d.spent).length;
  const ratio = spent / deposits.length;
  // 0% spent → 1.0, 50% spent → 0.5, 100% spent → 0.0
  return { score: Math.max(0, 1 - ratio), ratio };
}

function tenureScore(deposits: DepositForScoring[]): { score: number; days: number } {
  if (deposits.length === 0) return { score: 0, days: 0 };
  const earliest = Math.min(...deposits.map((d) => d.timestampSec));
  const days = Math.max(0, Math.floor((Date.now() / 1000 - earliest) / 86_400));
  // 0d → 0, 90d → 0.5, 365d → 1.0
  const score = Math.min(1, days / 365);
  return { score, days };
}

function diversificationScore(deposits: DepositForScoring[]): { score: number; uniqueWeeks: number } {
  const weeks = new Set(deposits.map((d) => d.week));
  const uniqueWeeks = weeks.size;
  // 1 unique → 0, 5 → 0.5, 10+ → 1.0
  const score = Math.min(1, uniqueWeeks / 10);
  return { score, uniqueWeeks };
}

function tierFromScore(score: number): Tier {
  if (score >= 750) return 'Excellent';
  if (score >= 700) return 'Very Good';
  if (score >= 650) return 'Good';
  if (score >= 600) return 'Fair';
  return 'Poor';
}

function loanMultiplierFor(tier: Tier): number {
  switch (tier) {
    case 'Excellent': return 6;
    case 'Very Good': return 4;
    case 'Good':      return 2;
    case 'Fair':      return 1;
    default:          return 0;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export function computeZCS(args: {
  wallet: string;
  deposits: DepositForScoring[];
  plan: PlanForScoring | null;
}): ScoreReport {
  const { wallet, deposits, plan } = args;

  const factors: ScoreFactors = {
    consistency: consistencyScore(deposits, plan),
    inflow: inflowScore(deposits).score,
    withdrawal: withdrawalScore(deposits).score,
    tenure: tenureScore(deposits).score,
    diversification: diversificationScore(deposits).score,
  };
  const streak = streakLength(deposits, plan);
  const inflow = inflowScore(deposits);
  const withdrawal = withdrawalScore(deposits);
  const tenure = tenureScore(deposits);
  const diversification = diversificationScore(deposits);

  const normalized =
    0.35 * factors.consistency +
    0.25 * factors.inflow +
    0.20 * factors.withdrawal +
    0.10 * factors.tenure +
    0.10 * factors.diversification;
  const score = Math.round(300 + 550 * normalized);
  const tier = tierFromScore(score);

  // Eligible loan = monthly inflow × multiplier (in stroops).
  const loanEligibleStroops = BigInt(
    Math.floor(inflow.monthlyStroops * loanMultiplierFor(tier)),
  ).toString();

  const signals: ScoreSignals = {
    meetsSavingsGoal: factors.consistency >= 0.6 && !!plan,
    monthlyInflowAbove500: inflow.monthlyStroops >= 5000 * 10_000_000,
    lowWithdrawalRatio: withdrawal.ratio < 0.2,
    tenureAbove90d: tenure.days >= 90,
    diversifiedPayers: diversification.uniqueWeeks >= 3,
  };

  return {
    wallet,
    score,
    tier,
    loanEligibleStroops,
    factors,
    signals,
    streak,
    plan,
    computedAtSec: Math.floor(Date.now() / 1000),
  };
}
