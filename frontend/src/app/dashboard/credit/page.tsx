'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  claimCredit,
  CreditRecordOnChain,
  getCreditRecord,
  getVaultDepositEvents,
  SAVINGS_RANGES,
  SavingsRange,
} from '@/lib/stellar';
import { decryptNote, VaultNote } from '@/lib/noteEncryption';
import { deriveNullifier } from '@/lib/crypto';

interface OwnedDeposit {
  commitment: string;
  nullifier: string;
  week: number;
  amountStroops: number;
}

export default function CreditPage() {
  const { address, secret, scanKey } = useWallet();
  const [record, setRecord] = useState<CreditRecordOnChain | null>(null);
  const [deposits, setDeposits] = useState<OwnedDeposit[]>([]);
  const [range, setRange] = useState<SavingsRange>('R20');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing credit record
  useEffect(() => {
    if (!address) return;
    void getCreditRecord(address).then(setRecord).catch(() => {});
  }, [address]);

  // Scan vault to find this user's deposits
  const scanDeposits = useCallback(async () => {
    if (!secret || !scanKey) return;
    setScanning(true);
    try {
      const events = await getVaultDepositEvents();
      const mine: OwnedDeposit[] = [];
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (!note) continue;
        const nullifier = await deriveNullifier(note.nonce, note.week);
        mine.push({
          commitment: ev.commitment,
          nullifier,
          week: note.week,
          amountStroops: note.amount,
        });
      }
      mine.sort((a, b) => a.week - b.week);
      setDeposits(mine);
    } finally {
      setScanning(false);
    }
  }, [secret, scanKey]);

  useEffect(() => { void scanDeposits(); }, [scanDeposits]);

  if (!address || !secret) return null;

  const eligible = SAVINGS_RANGES.find((r) => r.key === range)!;
  const xlmTotal = deposits.reduce((s, d) => s + d.amountStroops / 10_000_000, 0);
  const meetsRange = deposits.filter((d) => d.amountStroops / 10_000_000 >= eligible.minXlm);
  const canClaim8  = meetsRange.length >= 8;

  async function claim() {
    if (!address) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const qualifying = deposits.filter((d) => d.amountStroops / 10_000_000 >= eligible.minXlm);
      if (qualifying.length < 8) {
        throw new Error(`Need at least 8 deposits of ≥ ${eligible.minXlm} XLM. You have ${qualifying.length}.`);
      }

      setStatus(`Submitting credit claim for ${qualifying.length} deposits…`);
      // Stub proof — real ZK proof generation requires version-matched bb (see SECURITY.md)
      const stubProof = '00'.repeat(256);

      const { hash, record: newRecord } = await claimCredit({
        wallet: address,
        proofHex: stubProof,
        savingsRange: range,
        commitments: qualifying.map((q) => q.commitment),
        nullifiers:  qualifying.map((q) => q.nullifier),
        weeks:       qualifying.map((q) => q.week),
      });

      setStatus(`Credit issued on-chain. Tx ${hash.slice(0, 10)}…`);
      if (newRecord) setRecord(newRecord);
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const loanXlm = record ? Number(record.loanEligibleStroops) / 10_000_000 : 0;
  const loanUsd = loanXlm * 0.1;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">Bulletproof credit</p>
        <h1 className="text-2xl font-semibold tracking-tight">Prove your savings · Unlock credit</h1>
        <p className="mt-2 text-sm text-muted">
          Pick the weekly savings range you can prove. Zava verifies real vault deposits and issues
          a credit tier + loan eligibility — without revealing your exact amounts to anyone.
        </p>
      </div>

      {/* Current record */}
      {record && record.tier !== 'None' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Active credit</CardTitle>
              <Badge tone="success">{record.tier === 'VeryLow' ? 'Very Low risk' : `${record.tier} risk`}</Badge>
            </div>
            <CardDescription>
              Valid until {new Date(record.expiresAt * 1000).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Eligible loan"
                value={`${loanXlm.toLocaleString()} XLM`}
                hint={`≈ $${loanUsd.toLocaleString()}`}
              />
              <Stat label="Active weeks" value={record.activeWeeks} hint="Locked in vault" />
              <Stat
                label="Range proven"
                value={record.savingsRange}
                hint={`≥ $${SAVINGS_RANGES.find((r) => r.key === record.savingsRange)?.labelUsd ?? '?'}/wk`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vault scan */}
      <Card>
        <CardHeader>
          <CardTitle>Your vault deposits</CardTitle>
          <CardDescription>
            Decrypted from on-chain events using your scan key. Only you can see these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scanning ? (
            <p className="text-sm text-muted">Scanning vault events…</p>
          ) : deposits.length === 0 ? (
            <p className="text-sm text-muted">
              No deposits found yet. Generate a payment link from{' '}
              <a className="underline" href="/dashboard/deposit">Deposit</a> and have a client pay you.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Deposits decrypted" value={deposits.length} hint="Real on-chain savings" />
              <Stat label="Total saved" value={`${xlmTotal.toFixed(2)} XLM`} hint="Across all weeks" />
              <Stat
                label={`Qualifying for ${range}`}
                value={meetsRange.length}
                hint={`≥ ${eligible.minXlm} XLM each`}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Savings range selector */}
      <Card>
        <CardHeader>
          <CardTitle>Pick a savings range to prove</CardTitle>
          <CardDescription>
            Higher range = bigger loan eligibility. You can only prove what you actually saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-5">
            {SAVINGS_RANGES.map((r) => {
              const active = r.key === range;
              const qualifying = deposits.filter((d) => d.amountStroops / 10_000_000 >= r.minXlm).length;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={
                    'rounded-md border px-3 py-3 text-left transition-colors ' +
                    (active
                      ? 'border-foreground bg-subtle'
                      : 'border-border bg-surface hover:bg-subtle')
                  }
                >
                  <div className="text-sm font-medium">≥ ${r.labelUsd}/wk</div>
                  <div className="text-xs text-muted">{r.minXlm} XLM/wk</div>
                  <div className={'text-xs mt-1 ' + (qualifying >= 8 ? 'text-foreground' : 'text-muted')}>
                    {qualifying} qualifying
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={claim} disabled={busy || !canClaim8}>
              {busy ? 'Claiming…' : `Claim credit at ${range} tier`}
            </Button>
            {status && <span className="text-sm text-muted">{status}</span>}
          </div>
          {!canClaim8 && (
            <p className="mt-2 text-xs text-muted">
              Need at least 8 qualifying deposits at this range to claim credit.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </CardContent>
      </Card>

      {/* Privacy disclosure */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What lenders see vs hidden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Your tier &amp; loan amount" value="Visible" />
          <Row label={`Range you claim (e.g. ≥ $${eligible.labelUsd}/wk)`} value="Visible" />
          <Row label="Number of active savings weeks" value="Visible" />
          <Row label="Your exact deposit amounts" value="Hidden" muted />
          <Row label="Your client list" value="Hidden" muted />
          <Row label="Your transaction history" value="Hidden" muted />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted" dangerouslySetInnerHTML={{ __html: label }} />
      <span className={muted ? 'font-mono text-xs text-muted' : 'font-medium'}>{value}</span>
    </div>
  );
}
