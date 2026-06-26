// Tracks the user's own deposit history locally.
// On-chain commitments are anonymous — this local store links week numbers
// back to your wallet so the savings page can show progress.

export interface DepositRecord {
  week: number;
  timestamp: number; // unix seconds
  asset: string;     // 'XLM' | 'USDC' | ...
  txHash: string;
}

const KEY = (address: string) => `zava.savings.v1.${address}`;

export function loadDeposits(address: string): DepositRecord[] {
  try {
    const raw = localStorage.getItem(KEY(address));
    return raw ? (JSON.parse(raw) as DepositRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveDeposit(address: string, record: DepositRecord) {
  const existing = loadDeposits(address).filter((r) => r.week !== record.week);
  existing.push(record);
  existing.sort((a, b) => a.week - b.week);
  localStorage.setItem(KEY(address), JSON.stringify(existing));
}

export function depositedWeeks(address: string): Set<number> {
  return new Set(loadDeposits(address).map((r) => r.week));
}
