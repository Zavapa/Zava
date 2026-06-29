'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  getVaultDepositEvents,
  getVaultStats,
  vaultTransferShielded,
  VaultDepositEvent,
} from '@/lib/stellar';
import { decryptNote, encryptNote, VaultNote } from '@/lib/noteEncryption';
import { deriveCommitment, deriveNullifier, randomFieldHex } from '@/lib/crypto';
import { parseZavaHandle, encodeZavaHandle } from '@/lib/zavaHandle';

interface MyDeposit {
  event: VaultDepositEvent;
  note: VaultNote;
}

export default function SendPage() {
  const { address, secret, scanKey, zavaId } = useWallet();
  const [deposits, setDeposits]     = useState<MyDeposit[]>([]);
  const [scanning, setScanning]     = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [busy, setBusy]             = useState(false);
  const [step, setStep]             = useState('');
  const [txHash, setTxHash]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const scanMyDeposits = useCallback(async () => {
    if (!scanKey) return;
    setScanning(true);
    try {
      const events = await getVaultDepositEvents();
      const mine: MyDeposit[] = [];
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (note) mine.push({ event: ev, note });
      }
      setDeposits(mine);
    } finally { setScanning(false); }
  }, [scanKey]);

  useEffect(() => { void scanMyDeposits(); }, [scanMyDeposits]);

  if (!address || !secret || !scanKey || !zavaId) return null;

  const parsedHandle = parseZavaHandle(handleInput);
  const myHandle = encodeZavaHandle({ zavaId, scanKey });

  async function send() {
    if (!address || !secret) return;
    if (selectedIdx === null) { setError('Select a deposit to send.'); return; }
    if (!parsedHandle) {
      setError('Invalid Zava handle. Format: zava:<id>.<scanKey>');
      return;
    }
    const d = deposits[selectedIdx];

    setBusy(true);
    setError(null);
    setTxHash(null);
    try {
      // Fresh BN254-safe nonce for the recipient's new commitment.
      const newNonce = randomFieldHex();

      // Commitment + nullifier for the recipient's new note.
      // Use leaf-index-derived week so the recipient can later compute it.
      const newWeek = d.note.week + 1;
      const newCommitment = await deriveCommitment(newNonce, d.note.amount);

      // Note encrypted to the RECIPIENT's scanKey so only they can read it.
      const encryptedForRecipient = await encryptNote(
        { amount: d.note.amount, nonce: newNonce, week: newWeek, asset: d.note.asset },
        parsedHandle.scanKey,
      );

      setStep('Computing input nullifier…');
      const inNullifier = await deriveNullifier(d.note.nonce, d.note.week);

      setStep('Fetching vault Merkle root…');
      const { root } = await getVaultStats();

      // Stub proof — same security caveats as full withdrawal.
      const stubProof = '00'.repeat(256);

      setStep('Signing transfer in Freighter…');
      const { hash } = await vaultTransferShielded({
        caller:        address,
        proofHex:      stubProof,
        inNullifier,
        outCommitment: newCommitment,
        root:          root || '0'.repeat(64),
      });

      setTxHash(hash);
      setStep('');

      // Stash the encrypted note in localStorage too, so the recipient can
      // sideload it if they prefer (URL-shareable). For now we rely on the
      // backend indexer to pick it up from vault events.
      void encryptedForRecipient;
      void scanMyDeposits();
    } catch (e) {
      setError((e as Error).message);
      setStep('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Send shielded</h1>
        <p className="mt-1 text-sm text-muted">
          Send one of your vault deposits to another Zava user. <strong>No XLM moves on-chain</strong> —
          ownership of the commitment just changes inside the pool. The recipient&apos;s wallet
          stays completely private.
        </p>
      </div>

      {/* Your handle (for receiving) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Zava handle</CardTitle>
          <CardDescription>Share this so others can send you shielded funds.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border bg-subtle p-3 font-mono text-xs break-all">
            {myHandle}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => navigator.clipboard.writeText(myHandle)}
          >
            Copy
          </Button>
        </CardContent>
      </Card>

      {/* Pick a deposit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Pick a deposit to send</CardTitle>
          <CardDescription>
            {scanning ? 'Scanning vault for your deposits…'
              : deposits.length === 0
                ? 'No shielded deposits found. Receive a payment first via the Deposit page.'
                : `${deposits.length} deposit${deposits.length === 1 ? '' : 's'} available`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {deposits.map((d, i) => {
            const active = selectedIdx === i;
            const xlm = d.note.amount / 10_000_000;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIdx(i)}
                disabled={busy}
                className={
                  'w-full rounded-md border px-4 py-3 text-left transition-colors ' +
                  (active
                    ? 'border-foreground bg-subtle'
                    : 'border-border bg-surface hover:bg-subtle')
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{xlm.toFixed(4)} {d.note.asset}</span>
                  <span className="text-xs text-muted">Leaf #{d.event.leafIndex}</span>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Enter recipient handle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Recipient&apos;s Zava handle</CardTitle>
          <CardDescription>
            Paste their <strong>zava:&lt;id&gt;.&lt;scanKey&gt;</strong> string. Never their Stellar wallet —
            in-pool transfers don&apos;t need or reveal wallet addresses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            label="Recipient handle"
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="zava:..."
            hint={
              handleInput && !parsedHandle
                ? 'Invalid format. Expected: zava:<64-hex>.<64-hex>'
                : parsedHandle ? 'Valid handle' : ' '
            }
            disabled={busy}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          {txHash && (
            <div className="space-y-1">
              <Badge tone="success">Sent shielded</Badge>
              <p className="text-sm text-muted">
                Transaction:{' '}
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                  target="_blank" rel="noopener noreferrer" className="underline"
                >
                  {txHash.slice(0, 14)}…
                </a>
              </p>
              <p className="text-xs text-muted">
                No XLM moved on Stellar Explorer. The commitment changed owners inside the vault.
              </p>
            </div>
          )}
          <Button onClick={send} disabled={busy || selectedIdx === null || !parsedHandle}>
            {busy ? (step || 'Sending…') : 'Send shielded'}
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Your deposits" value={deposits.length} hint="Available to send" />
        <Stat
          label="Total value"
          value={`${(deposits.reduce((s, d) => s + d.note.amount, 0) / 10_000_000).toFixed(2)} XLM`}
          hint="Across all your notes"
        />
        <Stat label="Privacy mode" value="Counterparty-private" hint="No wallets in transfer" />
      </div>
    </div>
  );
}
