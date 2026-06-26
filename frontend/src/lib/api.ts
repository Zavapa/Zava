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
};
