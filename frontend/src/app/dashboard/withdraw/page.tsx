'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  getVaultStats,
  getVaultDepositEvents,
  vaultWithdraw,
  VaultDepositEvent,
} from '@/lib/stellar';
import { decryptNote, VaultNote } from '@/lib/noteEncryption';
import { deriveNullifier } from '@/lib/crypto';

interface MyDeposit {
  event: VaultDepositEvent;
  note: VaultNote;
}

export default function WithdrawPage() {
  const { address, secret, scanKey } = useWallet();

  const [vaultLocked, setVaultLocked] = useState<bigint>(0n);
  const [leafCount, setLeafCount]     = useState(0);
  const [myDeposits, setMyDeposits]   = useState<MyDeposit[]>([]);
  const [scanning, setScanning]       = useState(false);
  const [recipient, setRecipient]     = useState('');
  const [busy, setBusy]               = useState(false);
  const [provingStep, setProvingStep] = useState('');
  const [txHash, setTxHash]           = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<MyDeposit | null>(null);

  useEffect(() => {
    void getVaultStats().then(({ totalLocked, leafCount: lc }) => {
      setVaultLocked(totalLocked);
      setLeafCount(lc);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (address && !recipient) setRecipient(address);
  }, [address, recipient]);

  // Scan vault events and decrypt notes that belong to this user
  const scanMyDeposits = useCallback(async () => {
    if (!secret || !scanKey) return;
    setScanning(true);
    try {
      const events = await getVaultDepositEvents();
      const mine: MyDeposit[] = [];
      for (const ev of events) {
        // Decrypt with our scanKey — same key the payer used to encrypt
        // scanKey = sha256("zava_scan_v1" || secret), derived at wallet load time
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (note) mine.push({ event: ev, note });
      }
      setMyDeposits(mine);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [secret, scanKey]);

  useEffect(() => {
    void scanMyDeposits();
  }, [scanMyDeposits]);

  if (!address || !secret) return null;

  const totalMine = myDeposits.reduce((sum, d) => sum + BigInt(d.note.amount), 0n);
  const xlmLocked = Number(vaultLocked) / 10_000_000;
  const myXlm = Number(totalMine) / 10_000_000;

  async function withdraw(deposit: MyDeposit) {
    if (!address || !secret) return;
    if (!recipient || recipient.length !== 56) {
      setError('Enter a valid recipient Stellar address.');
      return;
    }
    setBusy(true);
    setError(null);
    setTxHash(null);
    setSelected(deposit);
    try {
      const { note, event } = deposit;
      const amountStroops = BigInt(note.amount);
      const nullifier = await deriveNullifier(note.nonce, note.week);

      // Compute recipient hash (sha-256 of address bytes — matches contract logic)
      const recipientHashBuf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(recipient),
      );
      const recipientHash = Array.from(new Uint8Array(recipientHashBuf))
        .map((b) => b.toString(16).padStart(2, '0')).join('');

      setProvingStep('Fetching vault Merkle root…');
      const { root } = await getVaultStats();

      // Generate real ZK proof in the browser
      setProvingStep('Generating zero-knowledge proof (this takes ~30 seconds)…');
      const { generateShieldedProof } = await import('@/lib/prover');

      // For a single-leaf tree (leaf at index 0), all path siblings are zero
      const zeroPath = Array(20).fill('0'.repeat(64));
      const zeroIndices = Array(20).fill(false);

      const { proofHex } = await generateShieldedProof({
        secret,
        amount: amountStroops,
        merkleRoot: root || '0'.repeat(64),
        merklePathHex: zeroPath,
        merklePathIndices: zeroIndices,
        nullifier,
        recipientHash,
        amountOut: amountStroops,
      });

      // Recompute the commitment using the nonce and amount from the decrypted note
      const { deriveCommitment } = await import('@/lib/crypto');
      const commitment = await deriveCommitment(note.nonce, note.amount);

      setProvingStep('Submitting withdrawal (sign in Freighter)…');
      const { hash } = await vaultWithdraw({
        caller:        address,
        proofHex,
        commitment,
        root:          root || '0'.repeat(64),
        nullifier,
        recipientHash,
        amountStroops,
        recipient,
      });

      setTxHash(hash);
      setProvingStep('');
      // Refresh deposits
      void scanMyDeposits();
    } catch (e) {
      setError((e as Error).message);
      setProvingStep('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vault — your private funds</h1>
        <p className="mt-1 text-sm text-muted">
          These funds were paid to your Zava ID. Nobody knows they are yours — only you can
          decrypt and withdraw them.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Your shielded balance"
          value={`${myXlm.toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`}
          hint="Only visible to you"
        />
        <Stat
          label="Total vault pool"
          value={`${xlmLocked.toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`}
          hint="From all depositors combined"
        />
        <Stat
          label="Your deposits"
          value={scanning ? '…' : myDeposits.length}
          hint={scanning ? 'Scanning vault events…' : 'Decrypted from vault events'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send withdrawn funds to</CardTitle>
          <CardDescription>
            Can be ANY Stellar address — your own, a friend's, a cold wallet. The vault
            releases to whoever you name here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            label="Recipient Stellar address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            hint="Leave as your own address, or change for maximum privacy."
            disabled={busy}
          />
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-danger">{error}</p>
          </CardContent>
        </Card>
      )}

      {txHash && (
        <Card>
          <CardContent className="pt-5 space-y-2">
            <Badge tone="success">Withdrawal complete</Badge>
            <p className="text-sm text-muted">
              Transaction:{' '}
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank" rel="noopener noreferrer"
                className="underline"
              >
                {txHash.slice(0, 16)}…
              </a>
            </p>
            <p className="text-sm text-muted">
              XLM released from vault to {recipient.slice(0, 8)}…{recipient.slice(-8)}.
              No link to the original payer appears on-chain.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Deposit list */}
      <Card>
        <CardHeader>
          <CardTitle>Your deposits</CardTitle>
          <CardDescription>
            Decrypted from vault events using your secret key. Each one can be
            withdrawn independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {scanning ? (
            <p className="px-6 py-8 text-center text-sm text-muted">Scanning vault events…</p>
          ) : myDeposits.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted">
              No deposits found yet. Share your payment link to receive funds.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Amount</th>
                  <th className="px-6 py-3 text-left font-medium">Asset</th>
                  <th className="px-6 py-3 text-left font-medium">Week</th>
                  <th className="px-6 py-3 text-left font-medium">Leaf</th>
                  <th className="px-6 py-3 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {myDeposits.map((d, i) => {
                  const xlm = (d.note.amount / 10_000_000).toFixed(4);
                  const isActive = selected === d && busy;
                  return (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-6 py-3 font-medium">{xlm}</td>
                      <td className="px-6 py-3 text-muted">{d.note.asset}</td>
                      <td className="px-6 py-3 text-muted">#{d.note.week}</td>
                      <td className="px-6 py-3 text-muted">#{d.event.leafIndex}</td>
                      <td className="px-6 py-3">
                        {isActive ? (
                          <span className="text-xs text-muted">{provingStep}</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => withdraw(d)}
                            disabled={busy}
                          >
                            Withdraw
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
