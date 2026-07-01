'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/components/WalletProvider';
import { api, ApiError, SavingsPlan } from '@/lib/api';
import { decryptNote } from '@/lib/noteEncryption';
import { getVaultDepositEvents, toUsdStroops, vaultIsNullifierSpent } from '@/lib/stellar';
import { deriveNullifier } from '@/lib/crypto';
import {
  computeZCS,
  DepositForScoring,
  PlanForScoring,
  ScoreReport,
} from '@/lib/zcs';

/** Compute the user's ZCS locally and re-fetch when wallet/plan changes. */
export function useZcs() {
  const { address, scanKey } = useWallet();
  const [plan, setPlan] = useState<SavingsPlan | null>(null);
  const [report, setReport] = useState<ScoreReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address || !scanKey) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Pull plans (many-per-wallet). ZCS is computed against the OLDEST
      //    active plan — that's the one with the longest track record. If the
      //    user has no plan yet we treat as null and consistency = 0.
      let p: SavingsPlan | null = null;
      try {
        const { plans } = await api.listPlans(address, false);
        if (plans.length > 0) p = plans[0]; // API returns ascending by createdAt
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }
      setPlan(p);

      // 2. Pull vault events from BOTH asset pools, decrypt with scanKey,
      //    normalize amounts to USD-equivalent stroops for unified scoring.
      const events = await getVaultDepositEvents();
      const deposits: DepositForScoring[] = [];
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (!note) continue;
        const nullifier = await deriveNullifier(note.nonce, note.week);
        const spent = await vaultIsNullifierSpent(nullifier, ev.asset);
        deposits.push({
          amountStroops: toUsdStroops(note.amount, ev.asset),
          timestampSec: ev.timestampSec ?? Math.floor(Date.now() / 1000),
          week: note.week,
          spent,
        });
      }

      const planForScoring: PlanForScoring | null = p ? {
        cadence: p.cadence,
        targetRange: p.targetRange,
        startedAtSec: parseInt(p.startedAt, 10),
        label: p.label ?? null,
      } : null;

      const r = computeZCS({ wallet: address, deposits, plan: planForScoring });
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, scanKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { report, plan, loading, error, refresh };
}
