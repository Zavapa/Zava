'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  CommitmentRow,
  CreditRecord,
  getCommitments,
  getCreditTier,
  verifyProof,
} from '@/lib/stellar';
import { api } from '@/lib/api';
import { deriveCommitment, deriveNullifier } from '@/lib/crypto';

type Tier = 8 | 12 | 24;

const TIERS: Array<{ weeks: Tier; label: string; risk: string; loan: string }> = [
  { weeks: 8, label: '8 weeks', risk: 'Medium', loan: '2× monthly savings' },
  { weeks: 12, label: '12 weeks', risk: 'Low', loan: '4× monthly savings' },
  { weeks: 24, label: '24 weeks', risk: 'Very Low', loan: '6× monthly savings' },
];

const MIN_WEEKLY_USDC = 40;
const MIN_WEEKLY_STROOPS = MIN_WEEKLY_USDC * 10_000_000;

export default function CreditPage() {
  const { address, secret } = useWallet();
  const [selectedTier, setSelectedTier] = useState<Tier>(8);
  const [credit, setCredit] = useState<CreditRecord | null>(null);
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void (async () => {
      try {
        const [record, rows] = await Promise.all([
          getCreditTier(address),
          getCommitments(0, 200),
        ]);
        if (cancelled) return;
        setCredit(record);
        setCommitments(rows);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address || !secret) return null;

  async function generateAndVerify() {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const weeklyAmounts = Array.from({ length: selectedTier }, () => MIN_WEEKLY_STROOPS);
      const weekNumbers = Array.from({ length: selectedTier }, (_, i) => i);
      const now = Math.floor(Date.now() / 1000);
      const depositTimestamps = weekNumbers.map(
        (w) => now - (selectedTier - w) * 86_400 * 7,
      );

      const commitmentsArr: string[] = [];
      const nullifiersArr: string[] = [];
      for (let i = 0; i < selectedTier; i++) {
        commitmentsArr.push(await deriveCommitment(secret!, weeklyAmounts[i]));
        nullifiersArr.push(await deriveNullifier(secret!, weekNumbers[i]));
      }

      setStatus('Generating zero-knowledge proof…');
      const proof = await api.generateProof({
        secret: secret!,
        consistencyWeeks: selectedTier,
        minWeeklyAmount: MIN_WEEKLY_STROOPS,
        weeklyAmounts,
        depositTimestamps,
        weekNumbers,
        commitments: commitmentsArr,
        nullifiers: nullifiersArr,
      });

      setStatus('Signing proof verification with Freighter…');
      const { tier, hash } = await verifyProof({
        wallet: address!,
        proof: proof.proof,
        minWeeklyAmount: MIN_WEEKLY_STROOPS,
        consistencyWeeks: selectedTier,
        commitments: commitmentsArr,
        nullifiers: nullifiersArr,
      });

      setStatus(`Tier ${tier} verified on-chain. Tx ${hash.slice(0, 10)}…`);

      const record = await getCreditTier(address!);
      setCredit(record);
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">Step 2</p>
        <h1 className="text-2xl font-semibold tracking-tight">Prove discipline. Unlock credit.</h1>
        <p className="mt-2 text-sm text-muted">
          Generate a zero-knowledge proof that you saved consistently. The verifier never sees
          your amounts, your balance, or your transaction history.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Current tier"
          value={credit ? credit.tier : 'None'}
          hint={
            credit
              ? `Valid until ${new Date(credit.expiresAt * 1000).toLocaleDateString()}`
              : 'Run a proof to apply'
          }
        />
        <Stat
          label="On-chain deposits"
          value={commitments.length}
          hint="Requires matching commitments in savings"
        />
        <Stat label="Threshold" value={`$${MIN_WEEKLY_USDC}/wk`} hint="Demo minimum claim" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose a credit tier</CardTitle>
          <CardDescription>
            More weeks of proven consistency = lower risk profile = larger eligible loan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const active = selectedTier === t.weeks;
              return (
                <button
                  key={t.weeks}
                  type="button"
                  onClick={() => setSelectedTier(t.weeks)}
                  className={
                    'rounded-md border px-4 py-4 text-left transition-colors ' +
                    (active
                      ? 'border-foreground bg-subtle'
                      : 'border-border bg-surface hover:bg-subtle')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t.label}</span>
                    <Badge>{t.risk}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">Eligible: {t.loan}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={generateAndVerify} disabled={busy}>
              {busy ? 'Working…' : `Generate proof for ${selectedTier}-week tier`}
            </Button>
            {status && <span className="text-sm text-muted">{status}</span>}
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the verifier sees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Threshold met" value="✓" />
          <Row label="Consecutive weeks" value={`${selectedTier}`} />
          <Row label="Balance" value="hidden" muted />
          <Row label="Wallet identity beyond address" value="hidden" muted />
          <Row label="Client / income source" value="hidden" muted />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={muted ? 'font-mono text-xs text-muted' : 'font-medium'}>{value}</span>
    </div>
  );
}
