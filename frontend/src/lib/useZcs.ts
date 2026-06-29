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
      // 1. Pull plan (404 = no plan declared yet, treat as null).
      let p: SavingsPlan | null = null;
      try {
        p = await api.getPlan(address);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
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
          timestampSec: Date.now() / 1000, // TODO: surface ledgerCloseTime from indexer
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
