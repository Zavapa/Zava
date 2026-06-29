const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw new ApiError(Array.isArray(message) ? message.join(', ') : String(message), res.status);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface UserProfile {
  id: string;
  wallet: string;
  displayName: string;
  createdAt: string;
}

export interface CommitmentRow {
  hash: string;
  nullifier: string;
  weekNumber: number;
  timestamp: number;
}

export interface ProofPayload {
  proof: string;
  publicInputs: {
    minWeeklyAmount: number;
    consistencyWeeks: 8 | 12 | 24;
    commitments: string[];
    nullifiers: string[];
  };
  isStub: boolean;
}

export interface CreditRecord {
  wallet: string;
  tier: 'Medium' | 'Low' | 'VeryLow';
  consistencyWeeks: number;
  verifiedAt: number;
  expiresAt: number;
}

export type CreditTierV3 = 'None' | 'Medium' | 'Low' | 'VeryLow';
export type SavingsRange = 'R5' | 'R20' | 'R50' | 'R200' | 'R500';

export interface CreditRecordV3 {
  wallet: string;
  tier: CreditTierV3;
  savingsRange: SavingsRange;
  loanEligibleStroops: string; // bigint serialised
  loanEligibleXlm: number;
  loanEligibleUsd: number;
  activeWeeks: number;
  withdrawnWeeks: number;
  verifiedAt: number;
  expiresAt: number;
  rangeMinWeeklyXlm: number;
  rangeLabelUsd: number;
  riskScore: number;
}

export interface LoanDecision {
  borrower: string;
  record: { tier: CreditTierV3; riskScore: number };
  approved: boolean;
  requestedXlm: number;
  approvedXlm: number;
  approvedUsd: number;
  interestRate: number;
  termWeeks: number;
  totalRepayable: number;
  decision: string;
  borrowerVisible: {
    tier: CreditTierV3;
    riskScore: number;
    savingsRangeLabel: string;
    activeWeeks: number;
  };
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  registerUser: (data: { wallet: string; displayName: string }) =>
    request<UserProfile>('/users', { method: 'POST', body: JSON.stringify(data) }),

  getUser: (wallet: string) =>
    request<UserProfile>(`/users/${wallet}`),

  getSavingsCount: () => request<{ count: number }>('/savings/count'),

  getCommitments: (start = 0, end = 50) =>
    request<{ commitments: CommitmentRow[] }>(
      `/savings/commitments?start=${start}&end=${end}`,
    ),

  deposit: (data: {
    wallet: string;
    commitment: string;
    nullifier: string;
    weekNumber: number;
  }) => request<{ hash: string }>('/savings/deposit', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  generateProof: (data: {
    secret: string;
    consistencyWeeks: 8 | 12 | 24;
    minWeeklyAmount: number;
    weeklyAmounts: number[];
    depositTimestamps: number[];
    weekNumbers: number[];
    commitments: string[];
    nullifiers: string[];
  }) => request<ProofPayload>('/proofs/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  verifyProof: (data: {
    wallet: string;
    proof: string;
    minWeeklyAmount: number;
    consistencyWeeks: 8 | 12 | 24;
    commitments: string[];
    nullifiers: string[];
  }) => request<{ hash: string; tier: 'Medium' | 'Low' | 'VeryLow' }>('/credit/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getCreditTier: (wallet: string) =>
    request<{ record: CreditRecord | null }>(`/credit/tier/${wallet}`),

  // ── v3 — bulletproof credit (lender-facing) ───────────────────────────────
  getCreditV3: (wallet: string) =>
    request<CreditRecordV3>(`/credit/v3/${wallet}`),

  getLoanEligibility: (wallet: string) =>
    request<{ stroops: string; xlm: number; usd: number }>(`/credit/v3/${wallet}/eligibility`),

  simulateLoan: (wallet: string, amountXlm: number) =>
    request<LoanDecision>(`/credit/v3/${wallet}/simulate-loan?amount=${amountXlm}`),

  // ── Savings Plan ────────────────────────────────────────────────────────
  getPlan: (wallet: string) =>
    request<SavingsPlan>(`/plan/${wallet}`),

  upsertPlan: (data: {
    wallet: string;
    cadence: 'weekly' | 'monthly';
    targetRange: 'R5' | 'R20' | 'R50' | 'R200' | 'R500';
    label?: string;
  }) => request<SavingsPlan>('/plan', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // ── ZCS sharing tokens ─────────────────────────────────────────────────
  issueScore: (report: IssueScoreRequest) =>
    request<ScoreReport>('/score/issue', {
      method: 'POST',
      body: JSON.stringify(report),
    }),

  getScoreReport: (token: string) =>
    request<ScoreReport>(`/score/report/${token}`),

  simulateScoreLoan: (token: string, amountXlm: number) =>
    request<ScoreLoanDecision>(`/score/report/${token}/loan?amount=${amountXlm}`),
};

export interface SavingsPlan {
  id: string;
  wallet: string;
  cadence: 'weekly' | 'monthly';
  targetRange: 'R5' | 'R20' | 'R50' | 'R200' | 'R500';
  label: string | null;
  startedAt: string;   // unix seconds as string
  createdAt: string;
  updatedAt: string;
}

export interface IssueScoreRequest {
  wallet: string;
  score: number;
  tier: 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor';
  loanEligibleStroops: string;
  factors: {
    consistency: number;
    inflow: number;
    withdrawal: number;
    tenure: number;
    diversification: number;
  };
  signals: {
    meetsSavingsGoal: boolean;
    monthlyInflowAbove500: boolean;
    lowWithdrawalRatio: boolean;
    tenureAbove90d: boolean;
    diversifiedPayers: boolean;
  };
  plan: {
    cadence: string;
    targetRange: string;
    label?: string | null;
  } | null;
  streak: number;
  ttlSeconds?: number;
}

export interface ScoreReport extends IssueScoreRequest {
  id: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ScoreLoanDecision {
  borrower: string;
  score: number;
  tier: string;
  requestedXlm: number;
  approved: boolean;
  approvedXlm: number;
  maxEligibleXlm: number;
  interestRate: number;
  termWeeks: number;
  totalRepayable: number;
  decision: string;
}
