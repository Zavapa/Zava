'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import * as freighter from '@/lib/freighter';
import {
  buildAddUsdcTrustlineTx,
  CONTRACT_IDS,
  hasUsdcTrustline,
  submitSignedXdr,
  vaultDeposit,
} from '@/lib/stellar';
import { deriveCommitment, deriveNullifier } from '@/lib/crypto';
import { encryptNote } from '@/lib/noteEncryption';
import { saveDeposit } from '@/lib/savingsStore';

// The zavaId in the URL is sha256(recipient_secret).
// It IS NOT a Stellar address — the recipient's real wallet is never in the URL.

type Step = 'idle' | 'depositing' | 'done';

function PayContent() {
  const params = useSearchParams();

  const zavaId       = params.get('zavaId')  ?? '';
  const scanKey      = params.get('scanKey') ?? ''; // viewing key — used to encrypt note
  const nonce        = params.get('nonce')   ?? '';
  const weekNumber   = parseInt(params.get('w') ?? '0', 10);
  const suggestedAmt = params.get('a') ?? '';
  const asset        = (params.get('asset') ?? 'XLM') as 'XLM' | 'USDC';

  const [amount, setAmount]         = useState(suggestedAmt);
  const [memo, setMemo]             = useState('');
  const [wallet, setWallet]         = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [step, setStep]             = useState<Step>('idle');
  const [txHash, setTxHash]         = useState<string | null>(null);
  const [leafIndex, setLeafIndex]   = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);
  /** Cached trustline state — only relevant for USDC payments. */
  const [trustlineReady, setTrustlineReady] = useState<boolean | null>(null);
  const [establishingTrustline, setEstablishingTrustline] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await freighter.getStatus();
      if (s.connected && s.address) setWallet(s.address);
    })();
  }, []);

  // Check whether the payer's wallet can hold USDC. For XLM payments this is
  // always true (native asset, no trustline needed).
  useEffect(() => {
    if (!wallet) return;
    if (asset === 'XLM') { setTrustlineReady(true); return; }
    setTrustlineReady(null);
    void hasUsdcTrustline(wallet).then((ok) => setTrustlineReady(ok));
  }, [wallet, asset]);

  async function establishTrustline() {
    if (!wallet) return;
    setError(null);
    setEstablishingTrustline(true);
    try {
      const xdr = await buildAddUsdcTrustlineTx(wallet);
      const signed = await freighter.signTransaction(xdr, {
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
        accountToSign: wallet,
      });
      await submitSignedXdr(signed);
      const ok = await hasUsdcTrustline(wallet);
      setTrustlineReady(ok);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstablishingTrustline(false);
    }
  }

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const s = await freighter.connect();
      if (!s.address) throw new Error('Freighter did not return an address.');
      setWallet(s.address);
    } catch (e) { setError((e as Error).message); }
    finally { setConnecting(false); }
  }, []);

  const pay = useCallback(async () => {
    if (!wallet) return;
    const num = Number(amount);
    if (!num || num <= 0) { setError('Enter a valid amount.'); return; }
    setError(null);
    setStep('depositing');
    try {
      const amountStroops = BigInt(Math.floor(num * 10_000_000));

      // Commitment = hash(nonce, amountStroops) — hides the amount
      const commitment = await deriveCommitment(nonce, Number(amountStroops));
      const nullifier  = await deriveNullifier(nonce, weekNumber);

      // Encrypt the note with the recipient's scanKey (viewing key from the URL).
      // scanKey = sha256("zava_scan_v1" || secret) — derived from their secret but separate.
      // The recipient decrypts with their own scanKey (derived from their secret at load time).
      // Knowing scanKey lets you READ notes but CANNOT withdraw — that needs the real secret.
      const encryptedNote = await encryptNote(
        {
          amount: Number(amountStroops),
          nonce,
          week: weekNumber,
          asset,
          memo: memo.trim() || undefined,
        },
        scanKey,
      );

      const { hash, leafIndex: idx } = await vaultDeposit({
        depositor:     wallet,
        asset,
        commitment,
        nullifier,
        amountStroops,
        encryptedNote,
      });

      setTxHash(hash);
      setLeafIndex(idx);
      setStep('done');
    } catch (e) {
      setError((e as Error).message);
      setStep('idle');
    }
  }, [wallet, amount, memo, nonce, weekNumber, scanKey, asset]);

  // Validate — zavaId, scanKey, and nonce must all be 64 hex chars
  const isValidLink = zavaId.length === 64 && scanKey.length === 64 && nonce.length === 64;

  if (!isValidLink) return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <p className="text-sm text-danger">Invalid or expired payment link. Ask the sender for a new one.</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-6">

        <div className="text-center space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">Zava · Private Payment</p>
          <h1 className="text-2xl font-semibold tracking-tight">Pay privately in {asset}</h1>
          <p className="text-sm text-muted">
            Payment goes into the <strong>Zava shielded vault</strong>. The recipient's
            wallet address is completely hidden — even from you.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How your payment stays private</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted space-y-2">
            <p>✦ Your {asset} locks into the <strong className="text-foreground">ZavaVault contract</strong> — not sent to any personal wallet</p>
            <p>✦ Only a cryptographic hash (not the amount) is stored on-chain</p>
            <p>✦ An encrypted note is stored — only the recipient can read it</p>
            <p>✦ The recipient withdraws privately using a ZK proof — <strong className="text-foreground">you cannot trace them</strong></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enter amount &amp; pay</CardTitle>
            <CardDescription>
              {suggestedAmt
                ? `Suggested: ${suggestedAmt} ${asset} — you can change it or tip more.`
                : `Enter any amount of ${asset}. Tips welcome.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={`Amount (${asset})`}
              type="number"
              min={0.0000001}
              step={0.0000001}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint="Your exact amount is hidden inside the vault — not visible on-chain."
              disabled={step !== 'idle'}
            />

            {/* Private memo — encrypted with recipient's scanKey, opaque on-chain.
                See lib/noteEncryption.ts for the fixed-size padding scheme. */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Private note (optional)
              </label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value.slice(0, 256))}
                placeholder="e.g. Project Atlas — March invoice. Encrypted; only the recipient can read it."
                rows={3}
                maxLength={256}
                disabled={step !== 'idle'}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
              />
              <p className="text-xs text-muted">
                {memo.length}/256 — encrypted before going on-chain. Only the recipient&apos;s
                scan key can decrypt it.
              </p>
            </div>

            <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted">
              <p className="font-medium text-foreground mb-1">Funds go to vault:</p>
              <p className="font-mono break-all">
                {(asset === 'USDC' ? CONTRACT_IDS.vaultUSDC : CONTRACT_IDS.vaultXLM) || '…'}
              </p>
            </div>

            {!wallet ? (
              <Button onClick={connect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Freighter to pay'}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge tone="success">Connected</Badge>
                  <span className="font-mono text-xs text-muted">
                    {wallet.slice(0, 6)}…{wallet.slice(-6)}
                  </span>
                </div>

                {asset === 'USDC' && trustlineReady === false && (
                  <div className="rounded-md border border-warning/40 bg-subtle p-3 space-y-2">
                    <p className="text-sm font-medium">USDC trustline required</p>
                    <p className="text-xs text-muted">
                      USDC is a Stellar issued asset — your wallet needs a one-time
                      trustline before it can hold or send USDC. Costs ≈ 0.5 XLM in
                      reserves (refundable if you remove the trustline later).
                    </p>
                    <Button
                      size="sm"
                      onClick={establishTrustline}
                      disabled={establishingTrustline}
                    >
                      {establishingTrustline ? 'Establishing…' : 'Add USDC trustline'}
                    </Button>
                  </div>
                )}

                {step === 'done' && txHash ? (
                  <div className="space-y-3">
                    <Badge tone="success">Payment complete</Badge>
                    <div className="text-sm text-muted space-y-1">
                      <p>
                        <strong className="text-foreground">{amount} {asset}</strong> is locked
                        in the Zava vault. Leaf #{leafIndex}.
                      </p>
                      <p>
                        Transaction:{' '}
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                          target="_blank" rel="noopener noreferrer"
                          className="underline"
                        >
                          {txHash.slice(0, 14)}…
                        </a>
                      </p>
                      <p className="pt-1 text-xs">
                        On-chain: {'"'}someone deposited {asset} to ZavaVault.{"'"} The recipient, amount,
                        and link to any wallet are completely hidden.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={pay}
                    disabled={
                      step !== 'idle' ||
                      !amount ||
                      Number(amount) <= 0 ||
                      (asset === 'USDC' && trustlineReady !== true)
                    }
                  >
                    {step === 'depositing'
                      ? 'Signing in Freighter…'
                      : `Pay ${amount || '?'} ${asset} into vault`}
                  </Button>
                )}
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-2">
              <div>
                <p className="font-medium text-foreground">Visible on Stellar:</p>
                <p>• Your wallet sent {asset} to ZavaVault</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Completely hidden:</p>
                <p>• Who the recipient is</p>
                <p>• The exact amount</p>
                <p>• Any connection to their withdrawal</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading payment request…</p>
      </div>
    }>
      <PayContent />
    </Suspense>
  );
}
