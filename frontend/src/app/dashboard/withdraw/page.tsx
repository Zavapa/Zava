'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  CONTRACT_IDS,
  getVaultStats,
  getVaultDepositEvents,
  vaultBindChangeNullifier,
  vaultCommitmentExists,
  vaultIsNullifierSpent,
  vaultPartialWithdraw,
  vaultWithdraw,
  VaultDepositEvent,
} from '@/lib/stellar';
import { decryptNote, VaultNote } from '@/lib/noteEncryption';
import { deriveCommitment, deriveNullifier, randomFieldHex } from '@/lib/crypto';

interface MyDeposit {
  /** "original" = paid in via the link; "change" = leftover from a partial withdrawal. */
  kind: 'original' | 'change';
  /** Vault leaf index if known (originals always have it; change UTXOs may not until we index events). */
  leafIndex: number | null;
  /** Nonce used for commitment/nullifier derivation. */
  nonce: string;
  amount: number;
  week: number;
  asset: string;
  commitment: string;
  nullifier: string;
  /** Only set for originals; needed only for display. */
  event?: VaultDepositEvent;
}

interface SavedChange {
  nonce: string;
  amountStroops: string; // bigint as string
  createdAt: number;
}

const CHANGE_PREFIX = 'zava.change.v1.';
/** Week used for change UTXOs — they have no real week. */
const CHANGE_WEEK = 0;

/** Read all `zava.change.v1.<commitment>` entries from localStorage. */
function readSavedChanges(): Array<{ commitment: string; data: SavedChange }> {
  if (typeof window === 'undefined') return [];
  const out: Array<{ commitment: string; data: SavedChange }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CHANGE_PREFIX)) continue;
    const commitment = key.slice(CHANGE_PREFIX.length);
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as SavedChange;
      if (data.nonce && data.amountStroops) out.push({ commitment, data });
    } catch {
      // skip malformed entries
    }
  }
  return out;
}

export default function WithdrawPage() {
  const { address, secret, scanKey } = useWallet();

  const [vaultLocked, setVaultLocked] = useState<bigint>(0n);
  const [leafCount, setLeafCount]     = useState(0);
  const [eventCount, setEventCount]   = useState(0);
  const [myDeposits, setMyDeposits]   = useState<MyDeposit[]>([]);
  const [scanning, setScanning]       = useState(false);

  const [recipient, setRecipient]     = useState('');
  const [partialAmounts, setPartialAmounts] = useState<Record<number, string>>({});

  const [busy, setBusy]               = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [provingStep, setProvingStep] = useState('');
  const [txHash, setTxHash]           = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const scanMyDeposits = useCallback(async () => {
    if (!secret || !scanKey) return;
    setScanning(true);
    setError(null);
    try {
      const [events, stats] = await Promise.all([
        getVaultDepositEvents(),
        getVaultStats(),
      ]);
      setEventCount(events.length);
      setVaultLocked(stats.totalLocked);
      setLeafCount(stats.leafCount);

      // 1) Original deposits — decrypt indexer notes with scanKey.
      const candidates: MyDeposit[] = [];
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (!note) continue;
        const commitment = await deriveCommitment(note.nonce, note.amount);
        const nullifier  = await deriveNullifier(note.nonce, note.week);
        candidates.push({
          kind: 'original',
          leafIndex: ev.leafIndex,
          nonce: note.nonce,
          amount: note.amount,
          week: note.week,
          asset: note.asset,
          commitment,
          nullifier,
          event: ev,
        });
      }

      // 2) Change UTXOs — pulled from localStorage (saved at partial-withdraw time).
      const saved = readSavedChanges();
      for (const { commitment, data } of saved) {
        const amount = Number(BigInt(data.amountStroops));
        const nullifier = await deriveNullifier(data.nonce, CHANGE_WEEK);
        candidates.push({
          kind: 'change',
          leafIndex: null,
          nonce: data.nonce,
          amount,
          week: CHANGE_WEEK,
          asset: 'XLM',
          commitment,
          nullifier,
        });
      }

      // 3) Filter: keep only commitments that exist on-chain AND whose
      //    nullifier hasn't been spent yet.
      const active: MyDeposit[] = [];
      for (const c of candidates) {
        const [exists, spent] = await Promise.all([
          vaultCommitmentExists(c.commitment),
          vaultIsNullifierSpent(c.nullifier),
        ]);
        if (exists && !spent) active.push(c);
      }

      setMyDeposits(active);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [secret, scanKey]);

  useEffect(() => { if (address && !recipient) setRecipient(address); }, [address, recipient]);
  useEffect(() => { void scanMyDeposits(); }, [scanMyDeposits]);

  if (!address || !secret) return null;

  const totalMineXlm = myDeposits.reduce((s, d) => s + d.amount, 0) / 10_000_000;
  const xlmLocked = Number(vaultLocked) / 10_000_000;

  async function computeRecipientHash(): Promise<string> {
    const { Address } = await import('@stellar/stellar-sdk');
    const xdr = new Address(recipient).toScVal().toXDR();
    const hashBuf = await crypto.subtle.digest('SHA-256', xdr);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Change UTXOs need their nullifier bound to the commitment in the vault
   *  before they can be spent. Originals already have this binding from deposit. */
  async function ensureBound(d: MyDeposit): Promise<void> {
    if (d.kind !== 'change') return;
    if (!address) return;
    setProvingStep('Binding change nullifier (one-time setup)…');
    const { generateShieldedProof } = await import('@/lib/prover');
    // The bind_change_nullifier contract method takes (proof, commitment,
    // nullifier) — current stub verifier accepts any proof.
    const { proofHex } = await generateShieldedProof({
      secret:            d.nonce,
      amount:            BigInt(d.amount),
      merkleRoot:        '0'.repeat(64),
      merklePathHex:     Array(20).fill('0'.repeat(64)),
      merklePathIndices: Array(20).fill(false),
      nullifier:         d.nullifier,
      recipientHash:     '0'.repeat(64),
      amountOut:         0n,
    });
    await vaultBindChangeNullifier({
      caller:           address,
      proofHex,
      changeCommitment: d.commitment,
      changeNullifier:  d.nullifier,
    });
  }

  async function doWithdrawFull(idx: number) {
    if (!address || !secret) return;
    const d = myDeposits[idx];
    if (!recipient || recipient.length !== 56) {
      setError('Enter a valid recipient Stellar address.'); return;
    }
    setBusy(true); setError(null); setTxHash(null); setSelectedIdx(idx);
    try {
      await ensureBound(d);

      const recipientHash = await computeRecipientHash();

      setProvingStep('Fetching vault Merkle root…');
      const { root } = await getVaultStats();

      setProvingStep('Generating ZK proof (stub)…');
      const { generateShieldedProof } = await import('@/lib/prover');
      const zeroPath = Array(20).fill('0'.repeat(64));
      const zeroIndices = Array(20).fill(false);
      const { proofHex } = await generateShieldedProof({
        secret:            d.nonce,
        amount:            BigInt(d.amount),
        merkleRoot:        root || '0'.repeat(64),
        merklePathHex:     zeroPath,
        merklePathIndices: zeroIndices,
        nullifier:         d.nullifier,
        recipientHash,
        amountOut:         BigInt(d.amount),
      });

      setProvingStep('Signing withdrawal in Freighter…');
      const { hash } = await vaultWithdraw({
        caller:        address,
        proofHex,
        commitment:    d.commitment,
        root:          root || '0'.repeat(64),
        nullifier:     d.nullifier,
        recipientHash,
        amountStroops: BigInt(d.amount),
        recipient,
      });

      setTxHash(hash);
      setProvingStep('');
      // Withdrawing a change UTXO clears its localStorage entry.
      if (d.kind === 'change') {
        localStorage.removeItem(`zava.change.v1.${d.commitment}`);
      }
      void scanMyDeposits();
    } catch (e) {
      setError((e as Error).message);
      setProvingStep('');
    } finally {
      setBusy(false);
    }
  }

  async function doWithdrawPartial(idx: number, withdrawXlm: number) {
    if (!address || !secret) return;
    const d = myDeposits[idx];
    if (!recipient || recipient.length !== 56) {
      setError('Enter a valid recipient Stellar address.'); return;
    }
    const withdrawStroops = BigInt(Math.floor(withdrawXlm * 10_000_000));
    const depositStroops  = BigInt(d.amount);
    if (withdrawStroops <= 0n || withdrawStroops > depositStroops) {
      setError(`Withdraw amount must be between 0 and ${d.amount / 10_000_000} XLM.`);
      return;
    }
    const changeStroops = depositStroops - withdrawStroops;

    setBusy(true); setError(null); setTxHash(null); setSelectedIdx(idx);
    try {
      await ensureBound(d);

      // Fresh nonce for change UTXO — kept in localStorage so it shows up in
      // the deposits list after the partial completes.
      const changeNonce = randomFieldHex();
      const changeCommitment = await deriveCommitment(changeNonce, Number(changeStroops));
      localStorage.setItem(
        `${CHANGE_PREFIX}${changeCommitment}`,
        JSON.stringify({ nonce: changeNonce, amountStroops: changeStroops.toString(), createdAt: Date.now() }),
      );

      const recipientHash = await computeRecipientHash();

      setProvingStep('Fetching vault Merkle root…');
      const { root } = await getVaultStats();

      setProvingStep('Generating ZK proof (stub)…');
      const { generatePartialWithdrawProof } = await import('@/lib/prover');
      const zeroPath = Array(20).fill('0'.repeat(64));
      const zeroIndices = Array(20).fill(false);
      const { proofHex } = await generatePartialWithdrawProof({
        secret:           d.nonce,
        inputAmount:      depositStroops,
        week:             BigInt(d.week),
        merklePathHex:    zeroPath,
        merklePathIndices: zeroIndices,
        changeSecret:     changeNonce,
        inCommitment:     d.commitment,
        inRoot:           root || '0'.repeat(64),
        inNullifier:      d.nullifier,
        recipientHash,
        withdrawAmount:   withdrawStroops,
        changeCommitment,
      });

      setProvingStep('Signing partial withdrawal in Freighter…');
      const { hash } = await vaultPartialWithdraw({
        caller:          address,
        proofHex,
        inCommitment:    d.commitment,
        inNullifier:     d.nullifier,
        inRoot:          root || '0'.repeat(64),
        recipient,
        recipientHash,
        withdrawStroops,
        changeCommitment,
      });

      setTxHash(hash);
      setProvingStep('');
      // If we just partial-withdrew from a CHANGE UTXO, its old localStorage
      // entry is dead (nullifier now spent). Remove it. The new change UTXO
      // is already saved above.
      if (d.kind === 'change') {
        localStorage.removeItem(`${CHANGE_PREFIX}${d.commitment}`);
      }
      void scanMyDeposits();
    } catch (e) {
      setError((e as Error).message);
      setProvingStep('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vault · your private funds</h1>
          <p className="mt-1 text-sm text-muted">
            Funds clients paid you privately. Only you can see and withdraw them.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={scanMyDeposits} disabled={scanning || busy}>
          {scanning ? 'Scanning…' : 'Refresh'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Your shielded balance"
          value={`${totalMineXlm.toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`}
          hint={`${myDeposits.length} deposit${myDeposits.length === 1 ? '' : 's'}`}
        />
        <Stat
          label="Total vault pool"
          value={`${xlmLocked.toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`}
          hint={`${leafCount} commitments across all users`}
        />
        <Stat
          label="Events indexed"
          value={scanning ? '…' : eventCount}
          hint="Backend keeps these forever"
        />
      </div>

      {/* Recipient */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send withdrawn funds to</CardTitle>
          <CardDescription>
            Any Stellar address. Pre-filled with your wallet — change for maximum privacy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            label="Recipient Stellar address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
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
                target="_blank" rel="noopener noreferrer" className="underline"
              >
                {txHash.slice(0, 16)}…
              </a>
            </p>
            <p className="text-sm text-muted">
              XLM released from vault to {recipient.slice(0, 8)}…{recipient.slice(-8)}.
              No on-chain link to the original payer.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Deposit list */}
      <Card>
        <CardHeader>
          <CardTitle>Your deposits</CardTitle>
          <CardDescription>
            Each deposit can be withdrawn fully or partially. Leave the partial amount
            empty to withdraw everything; the rest stays shielded as a new commitment.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {scanning ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Scanning vault events…</p>
          ) : myDeposits.length === 0 ? (
            <div className="px-6 py-10 space-y-3 text-sm">
              <p className="font-medium">No deposits yet.</p>
              <p className="text-muted">
                Go to <a className="underline" href="/dashboard/deposit">Deposit</a>,
                generate a payment link, and have a client pay you. Your deposit will appear
                here within ~15 seconds.
              </p>
              <p className="text-xs text-muted">
                Vault: <span className="font-mono">{CONTRACT_IDS.vault.slice(0, 10)}…{CONTRACT_IDS.vault.slice(-6)}</span>
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {myDeposits.map((d, i) => {
                const xlm = d.amount / 10_000_000;
                const isActive = selectedIdx === i && busy;
                const partialStr = partialAmounts[i] ?? '';
                const partialNum = Number(partialStr);
                const partialValid = partialStr !== '' && Number.isFinite(partialNum) && partialNum > 0 && partialNum <= xlm;
                const subLabel = d.kind === 'change'
                  ? 'Change from a previous partial withdrawal'
                  : `Week #${d.week}${d.leafIndex != null ? ` · Leaf #${d.leafIndex}` : ''}`;
                return (
                  <div key={d.commitment} className="px-6 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold">{xlm.toFixed(4)} {d.asset}</span>
                        {d.kind === 'change' && <Badge>Change</Badge>}
                        <span className="text-xs text-muted">{subLabel}</span>
                      </div>
                      {isActive && <span className="text-xs text-muted">{provingStep}</span>}
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[180px]">
                        <Input
                          label="Amount to withdraw (XLM)"
                          type="number"
                          min={0.0000001}
                          step={0.0000001}
                          value={partialStr}
                          onChange={(e) => setPartialAmounts({ ...partialAmounts, [i]: e.target.value })}
                          placeholder={`Leave empty for full ${xlm.toFixed(4)}`}
                          disabled={busy}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => doWithdrawFull(i)}
                        disabled={busy}
                      >
                        Withdraw all
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => doWithdrawPartial(i, partialNum)}
                        disabled={busy || !partialValid}
                      >
                        Withdraw {partialValid ? partialNum.toFixed(4) : ''} XLM
                      </Button>
                    </div>

                    {partialValid && partialNum < xlm && (
                      <p className="text-xs text-muted">
                        {(xlm - partialNum).toFixed(4)} XLM stays shielded in the vault as a new commitment.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
