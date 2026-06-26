'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useWallet } from '@/components/WalletProvider';
import { depositCommitment, getCommitmentCount } from '@/lib/stellar';
import { deriveCommitment, deriveNullifier } from '@/lib/crypto';

export default function DepositPage() {
  const router = useRouter();
  const { address, secret } = useWallet();
  const [amount, setAmount] = useState('40');
  const [weekNumber, setWeekNumber] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    void (async () => {
      const count = await getCommitmentCount().catch(() => 0);
      setWeekNumber(count);
    })();
  }, [address]);

  if (!address || !secret) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const amountStroops = Math.floor(Number(amount) * 10_000_000);
      if (!Number.isFinite(amountStroops) || amountStroops <= 0) {
        throw new Error('Enter a positive amount in USDC.');
      }
      const commitment = await deriveCommitment(secret!, amountStroops);
      const nullifier = await deriveNullifier(secret!, weekNumber);
      const { hash } = await depositCommitment({
        wallet: address!,
        commitment,
        nullifier,
        weekNumber,
      });
      setSuccess(`Recorded on Stellar. Tx ${hash.slice(0, 10)}…`);
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-muted">Step 1</p>
        <h1 className="text-2xl font-semibold tracking-tight">Make a savings deposit</h1>
        <p className="mt-2 text-sm text-muted">
          Your amount stays hidden on-chain. Only a cryptographic commitment is published.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deposit details</CardTitle>
          <CardDescription>
            Freighter will prompt you to sign the transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Input
              label="Amount (USDC)"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint="Stored as stroops (1 USDC = 10⁷ stroops)."
              required
              disabled={busy}
            />
            <Input
              label="Week number"
              type="number"
              min={0}
              value={weekNumber}
              onChange={(e) => setWeekNumber(parseInt(e.target.value || '0', 10))}
              hint="Strictly increasing per deposit."
              required
              disabled={busy}
            />

            <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted">
              <p className="mb-1 font-medium text-foreground">Published on Stellar:</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>A 32-byte commitment hash (your amount stays private)</li>
                <li>A 32-byte nullifier preventing replays</li>
                <li>The week number and ledger timestamp</li>
              </ul>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
            {success && (
              <div className="flex items-center gap-2">
                <Badge tone="success">Success</Badge>
                <span className="text-sm text-foreground">{success}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Signing & submitting…' : 'Sign with Freighter'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
