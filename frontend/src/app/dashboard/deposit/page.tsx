'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useWallet } from '@/components/WalletProvider';
import { depositCommitment, getCommitmentCount } from '@/lib/stellar';
import { deriveCommitment, deriveNullifier, randomFieldHex } from '@/lib/crypto';
import { saveDeposit } from '@/lib/savingsStore';
import { encryptNote } from '@/lib/noteEncryption';

type Mode = 'self' | 'link';
type Currency = 'XLM' | 'USDC';

const CURRENCIES: Currency[] = ['XLM', 'USDC'];

// Nonce must be a valid BN254 field element (value < ~2^254) so it can be
// used as a private witness in the Noir/UltraHonk circuits later.
const generateNonce = randomFieldHex;

function savePaymentNonce(weekNumber: number, nonce: string) {
  localStorage.setItem(`zava.payreq.v1.week.${weekNumber}`, nonce);
}

export default function DepositPage() {
  const router = useRouter();
  const { address, secret, zavaId, scanKey, connect, connecting } = useWallet();
  const [mode, setMode] = useState<Mode>('self');
  const [currency, setCurrency] = useState<Currency>('XLM');
  const [amount, setAmount] = useState('40');
  const [suggestedAmount, setSuggestedAmount] = useState('');
  const [weekNumber, setWeekNumber] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    void getCommitmentCount().then(setWeekNumber).catch(() => {});
  }, [address]);

  // Reset link when currency changes
  useEffect(() => {
    setPayLink(null);
  }, [currency]);

  async function onSelfSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address || !secret) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const amountStroops = Math.floor(Number(amount) * 10_000_000);
      if (!Number.isFinite(amountStroops) || amountStroops <= 0)
        throw new Error(`Enter a positive amount in ${currency}.`);
      const commitment = await deriveCommitment(secret, amountStroops);
      const nullifier = await deriveNullifier(secret, weekNumber);
      const { hash } = await depositCommitment({ wallet: address, commitment, nullifier, weekNumber });
      saveDeposit(address, { week: weekNumber, timestamp: Math.floor(Date.now() / 1000), asset: currency, txHash: hash });
      setSuccess(`Recorded on Stellar. Tx ${hash.slice(0, 10)}…`);
      setTimeout(() => router.push('/dashboard/savings'), 1800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address || !zavaId || !scanKey) return;
    setError(null);
    setPayLink(null);
    setBusy(true);
    try {
      const nonce = generateNonce();
      savePaymentNonce(weekNumber, nonce);
      const params = new URLSearchParams({
        zavaId,   // public identity — sha256("zava_id_v1" || secret)
        scanKey,  // viewing key — sha256("zava_scan_v1" || secret)
                  // client uses scanKey to encrypt the note so only YOU can decrypt
                  // scanKey lets anyone READ your incoming payments but NOT withdraw them
        w: String(weekNumber),
        nonce,
        asset: currency,
      });
      if (suggestedAmount && Number(suggestedAmount) > 0) {
        params.set('a', suggestedAmount);
      }
      setPayLink(`${window.location.origin}/pay?${params.toString()}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!payLink) return;
    await navigator.clipboard.writeText(payLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const notConnected = !address;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-muted">Step 1</p>
        <h1 className="text-2xl font-semibold tracking-tight">Record a savings commitment</h1>
        <p className="mt-2 text-sm text-muted">
          Your money stays in your wallet. Zava records a cryptographic hash of your
          savings amount each week — building the ZK proof you need to unlock credit.
        </p>
      </div>

      {notConnected && (
        <Card>
          <CardContent className="pt-5 pb-5 flex items-center justify-between gap-4">
            <p className="text-sm text-muted">Connect your Freighter wallet to continue.</p>
            <Button onClick={connect} disabled={connecting} size="sm">
              {connecting ? 'Connecting…' : 'Connect Freighter'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Currency selector */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted">Asset</p>
        <div className="flex gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={
                'rounded-md border px-4 py-1.5 text-sm font-medium transition-colors ' +
                (currency === c
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-surface text-muted hover:bg-subtle')
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-md border border-border overflow-hidden text-sm">
        <button
          type="button"
          onClick={() => { setMode('self'); setPayLink(null); setError(null); }}
          className={
            'flex-1 px-4 py-2.5 font-medium transition-colors ' +
            (mode === 'self' ? 'bg-foreground text-background' : 'bg-surface text-muted hover:bg-subtle')
          }
        >
          Record my own savings
        </button>
        <button
          type="button"
          onClick={() => { setMode('link'); setSuccess(null); setError(null); }}
          className={
            'flex-1 px-4 py-2.5 font-medium transition-colors border-l border-border ' +
            (mode === 'link' ? 'bg-foreground text-background' : 'bg-surface text-muted hover:bg-subtle')
          }
        >
          Client paid me
        </button>
      </div>

      {mode === 'self' ? (
        <Card>
          <CardHeader>
            <CardTitle>Record this week&apos;s savings</CardTitle>
            <CardDescription>
              No money moves. You are publishing a cryptographic proof that you saved
              this amount — the exact number stays hidden from lenders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSelfSubmit} className="flex flex-col gap-5">
              <Input
                label={`Amount I saved this week (${currency})`}
                type="number"
                min={0.0000001}
                step={0.0000001}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                hint={`The ${currency} stays in your wallet. Only a hash is published on Stellar.`}
                required
                disabled={busy || notConnected}
              />
              <PrivacyNote />
              {error && <p className="text-sm text-danger">{error}</p>}
              {success && (
                <div className="flex items-center gap-2">
                  <Badge tone="success">Success</Badge>
                  <span className="text-sm">{success}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || notConnected}>
                  {busy ? 'Recording…' : 'Record savings commitment'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => router.push('/dashboard')} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Generate a payment link</CardTitle>
            <CardDescription>
              Send this link to your client. They pay in <strong>{currency}</strong> and
              choose the exact amount — including tips. Your secret never leaves your device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onGenerateLink} className="flex flex-col gap-5">
              <Input
                label={`Suggested amount (${currency}) — optional`}
                type="number"
                min={0.0000001}
                step={0.0000001}
                value={suggestedAmount}
                onChange={(e) => setSuggestedAmount(e.target.value)}
                hint="Leave blank and your client decides the amount freely."
                disabled={busy || notConnected}
              />
              <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-1">
                <p className="font-medium text-foreground">How this works:</p>
                <p>A one-time key is generated for this payment. Your client uses it to commit to whatever {currency} amount they send — your main secret is never shared.</p>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={busy || notConnected}>
                {busy ? 'Generating…' : 'Generate payment link'}
              </Button>
            </form>

            {payLink && (
              <div className="mt-6 space-y-3">
                <p className="text-sm font-medium">Share this link with your client:</p>
                <div className="rounded-md border border-border bg-subtle p-3">
                  <p className="break-all font-mono text-xs text-muted">{payLink}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={copyLink}>
                    {copied ? 'Copied!' : 'Copy link'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setPayLink(null); setSuggestedAmount(''); }}>
                    Clear
                  </Button>
                </div>
                <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-1">
                  <p className="font-medium text-foreground">Your client will see:</p>
                  <p>→ Your Stellar address to send <strong>{currency}</strong> to</p>
                  <p>→ An amount field{suggestedAmount ? ` pre-filled as ${suggestedAmount} ${currency}` : ` they set freely`}</p>
                  <p>→ A button to record the hidden commitment on-chain</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PrivacyNote() {
  return (
    <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-2">
      <p className="font-medium text-foreground">What actually happens:</p>
      <ul className="list-inside list-disc space-y-1">
        <li>Your {`XLM / USDC`} <strong className="text-foreground">stays in your wallet</strong> — nothing is transferred or locked</li>
        <li>Zava publishes a <strong className="text-foreground">commitment hash</strong> (not the amount) to the savings contract</li>
        <li>You pay a tiny Stellar gas fee (~0.00001 XLM)</li>
        <li>Later you use a ZK proof to show lenders you saved consistently — without revealing the exact number</li>
      </ul>
    </div>
  );
}
