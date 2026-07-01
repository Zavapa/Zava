'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/components/WalletProvider';
import { api, ApiError, SavingsPlan } from '@/lib/api';
import { decryptNote } from '@/lib/noteEncryption';
import { getVaultDepositEvents, toUsdStroops, vaultIsNullifierSpent, Asset } from '@/lib/stellar';
import { deriveNullifier } from '@/lib/crypto';

/** A decrypted deposit tied to a specific plan (or 'unassigned' for legacy notes). */
export interface PlanDeposit {
  planId: string | null;
  amountStroops: number;      // native (XLM or USDC) stroops
  usdStroops: number;         // normalised to USD-equivalent stroops
  asset: Asset;
  week: number;
  timestampSec: number;
  spent: boolean;             // has the nullifier been spent on-chain?
  nonce: string;
  memo?: string;
}

export interface PlanProgress {
  plan: SavingsPlan;
  periodsElapsed: number;
  periodsHit: number;
  adherence: number;          // 0..1
  streak: number;             // consecutive hits from current period backwards
  currentPeriodMet: boolean;
  nextDueSec: number;         // unix seconds when next period rolls
  totalDepositedUsd: number;  // USD-equivalent
  totalWithdrawnUsd: number;  // USD-equivalent (from spent-nullifier deposits)
  liveBalanceUsd: number;     // deposited - withdrawn
  depositCount: number;
  deposits: PlanDeposit[];    // sorted newest → oldest
}

const RANGE_MIN_USD_STROOPS: Record<SavingsPlan['targetRange'], number> = {
  R5:   5   * 10_000_000,
  R20:  20  * 10_000_000,
  R50:  50  * 10_000_000,
  R200: 200 * 10_000_000,
  R500: 500 * 10_000_000,
};

function periodSeconds(cadence: 'weekly' | 'monthly'): number {
  return cadence === 'weekly' ? 7 * 86_400 : 30 * 86_400;
}

/** Pure function — given a plan and its filtered deposits, compute progress. */
export function computePlanProgress(plan: SavingsPlan, deposits: PlanDeposit[]): PlanProgress {
  const now = Math.floor(Date.now() / 1000);
  const startedAt = parseInt(plan.startedAt, 10);
  const period = periodSeconds(plan.cadence);
  const targetUsd = RANGE_MIN_USD_STROOPS[plan.targetRange];

  const periodsElapsed = Math.max(1, Math.floor((now - startedAt) / period) + 1);
  const currentPeriodIndex = periodsElapsed - 1;

  // Sum USD-equivalent deposits per period.
  const perPeriodUsd = new Map<number, number>();
  for (const d of deposits) {
    const idx = Math.floor((d.timestampSec - startedAt) / period);
    if (idx < 0) continue;
    perPeriodUsd.set(idx, (perPeriodUsd.get(idx) ?? 0) + d.usdStroops);
  }
  let periodsHit = 0;
  for (let i = 0; i < periodsElapsed; i++) {
    if ((perPeriodUsd.get(i) ?? 0) >= targetUsd) periodsHit += 1;
  }

  // Streak walks backwards from current period.
  let streak = 0;
  for (let i = currentPeriodIndex; i >= 0; i--) {
    if ((perPeriodUsd.get(i) ?? 0) >= targetUsd) streak += 1;
    else break;
  }

  const totalDepositedUsd = deposits.reduce((s, d) => s + d.usdStroops, 0);
  const totalWithdrawnUsd = deposits
    .filter((d) => d.spent)
    .reduce((s, d) => s + d.usdStroops, 0);

  return {
    plan,
    periodsElapsed,
    periodsHit,
    adherence: periodsHit / periodsElapsed,
    streak,
    currentPeriodMet: (perPeriodUsd.get(currentPeriodIndex) ?? 0) >= targetUsd,
    nextDueSec: startedAt + periodsElapsed * period,
    totalDepositedUsd,
    totalWithdrawnUsd,
    liveBalanceUsd: totalDepositedUsd - totalWithdrawnUsd,
    depositCount: deposits.length,
    deposits: [...deposits].sort((a, b) => b.timestampSec - a.timestampSec),
  };
}

/** Bucket deposits by planId (falling back to 'unassigned' for legacy notes). */
export function groupDepositsByPlan(deposits: PlanDeposit[]): Map<string, PlanDeposit[]> {
  const out = new Map<string, PlanDeposit[]>();
  for (const d of deposits) {
    const key = d.planId ?? 'unassigned';
    const arr = out.get(key) ?? [];
    arr.push(d);
    out.set(key, arr);
  }
  return out;
}

interface UsePlansResult {
  plans: SavingsPlan[];
  deposits: PlanDeposit[];
  progressById: Map<string, PlanProgress>;
  unassignedUsd: number;      // USD-equivalent of deposits with no planId
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Load all plans + all decrypted deposits for the connected wallet. */
export function usePlans(): UsePlansResult {
  const { address, scanKey } = useWallet();
  const [plans, setPlans] = useState<SavingsPlan[]>([]);
  const [deposits, setDeposits] = useState<PlanDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address || !scanKey) return;
    setLoading(true);
    setError(null);
    try {
      // Plans (active only — the archived toggle lives on individual pages).
      let planList: SavingsPlan[] = [];
      try {
        const r = await api.listPlans(address, false);
        planList = r.plans;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }

      // Vault events (both assets), decrypt with our scanKey.
      const events = await getVaultDepositEvents();
      const out: PlanDeposit[] = [];
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (!note) continue;
        const nullifier = await deriveNullifier(note.nonce, note.week);
        const spent = await vaultIsNullifierSpent(nullifier, ev.asset);
        out.push({
          planId: note.planId ?? null,
          amountStroops: note.amount,
          usdStroops: toUsdStroops(note.amount, ev.asset),
          asset: ev.asset,
          week: note.week,
          timestampSec: ev.timestampSec ?? Math.floor(Date.now() / 1000),
          spent,
          nonce: note.nonce,
          memo: note.memo,
        });
      }

      setPlans(planList);
      setDeposits(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, scanKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const buckets = groupDepositsByPlan(deposits);
  const progressById = new Map<string, PlanProgress>();
  for (const p of plans) {
    progressById.set(p.id, computePlanProgress(p, buckets.get(p.id) ?? []));
  }
  const unassignedUsd = (buckets.get('unassigned') ?? []).reduce(
    (s, d) => s + (d.spent ? 0 : d.usdStroops),
    0,
  );

  return { plans, deposits, progressById, unassignedUsd, loading, error, refresh };
}
