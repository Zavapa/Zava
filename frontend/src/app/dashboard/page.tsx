'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  AssetBalance,
  CommitmentRow,
  CreditRecordOnChain,
  getAccountBalances,
  getCommitmentCount,
  getCommitments,
  getCreditRecord,
  getVaultDepositEvents,
  getVaultStats,
  SAVINGS_RANGES,
} from '@/lib/stellar';
import { decryptNote } from '@/lib/noteEncryption';

function fmt(balance: string | number) {
  const n = typeof balance === 'number' ? balance : parseFloat(balance);
  if (isNaN(n)) return String(balance);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const TIER_LABEL: Record<string, string> = {
  Medium: 'Medium risk',
  Low: 'Low risk',
  VeryLow: 'Very low risk',
  None: 'None',
};

export default function OverviewPage() {
  const { address, displayName, network, scanKey } = useWallet();

  const [balances, setBalances]       = useState<AssetBalance[]>([]);
  const [poolCount, setPoolCount]     = useState<number | null>(null);
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [credit, setCredit]           = useState<CreditRecordOnChain | null>(null);
  const [vaultMineXlm, setVaultMineXlm]     = useState(0);
  const [vaultMineCount, setVaultMineCount] = useState(0);
  const [vaultTotalXlm, setVaultTotalXlm]   = useState(0);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Scan vault events and decrypt the ones belonging to this wallet
  const scanMyVault = useCallback(async () => {
    if (!scanKey) return;
    try {
      const [events, stats] = await Promise.all([
        getVaultDepositEvents(),
        getVaultStats(),
      ]);
      let mine = 0;
      let total = 0n;
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (note) {
          mine += 1;
          total += BigInt(note.amount);
        }
      }
      setVaultMineCount(mine);
      setVaultMineXlm(Number(total) / 10_000_000);
      setVaultTotalXlm(Number(stats.totalLocked) / 10_000_000);
    } catch {
      // ignore — vault may not have events yet
    }
  }, [scanKey]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [bals, c, rows, record] = await Promise.all([
          getAccountBalances(address),
          getCommitmentCount(),
          getCommitments(0, 50),
          getCreditRecord(address),
        ]);
        if (cancelled) return;
        setBalances(bals);
        setPoolCount(c);
        setCommitments(rows);
        setCredit(record);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void scanMyVault();
    return () => { cancelled = true; };
  }, [address, scanMyVault]);

  if (!address) return null;

  const xlm = balances.find((b) => b.asset === 'XLM');
  const otherAssets = balances.filter((b) => b.asset !== 'XLM');
  const loanXlm = credit ? Number(credit.loanEligibleStroops) / 10_000_000 : 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName ?? 'You'}</h1>
          <p className="font-mono text-xs text-muted mt-0.5">
            {address.slice(0, 8)}…{address.slice(-8)} · {network ?? 'testnet'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/deposit"><Button>Receive payment</Button></Link>
          <Link href="/dashboard/withdraw"><Button variant="secondary">Withdraw</Button></Link>
        </div>
      </div>

      {/* ────────── Private Vault — your shielded funds ────────── */}
      <Card className="border-foreground/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Private vault
                <Badge tone="success">Shielded</Badge>
              </CardTitle>
              <CardDescription>
                Funds clients have paid you privately via Zava. Decrypted from on-chain
                events using your scan key — nobody else can see your balance.
              </CardDescription>
            </div>
            <Link href="/dashboard/withdraw">
              <Button>Withdraw privately</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Your shielded balance"
              value={`${fmt(vaultMineXlm)} XLM`}
              hint={`${vaultMineCount} deposit${vaultMineCount === 1 ? '' : 's'} only you can see`}
            />
            <Stat
              label="Total in vault pool"
              value={`${fmt(vaultTotalXlm)} XLM`}
              hint="Across all Zava users — provides anonymity"
            />
            <Stat
              label="Anonymity set"
              value={vaultMineCount > 0 && vaultTotalXlm > 0
                ? `1 of ${poolCount ?? '?'}`
                : '—'}
              hint="Deposits a withdrawal could be matched to"
            />
          </div>
          {vaultMineCount === 0 && (
            <p className="mt-4 text-xs text-muted">
              No private deposits yet. Share a{' '}
              <Link className="underline" href="/dashboard/deposit">payment link</Link> to receive funds privately.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ────────── Wallet balance ────────── */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Wallet balance (public)
        </p>
        {loading && balances.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted">Loading…</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : balances.length === 0 ? (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted">
                Account not found on {network ?? 'testnet'}.{' '}
                <a
                  href="https://laboratory.stellar.org/#account-creator?network=test"
                  target="_blank" rel="noreferrer" className="underline"
                >
                  Fund with Friendbot
                </a>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {xlm && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted mb-1">XLM</p>
                  <p className="text-3xl font-semibold tracking-tight">{fmt(xlm.balance)}</p>
                  <p className="text-xs text-muted mt-1">Stellar Lumens · Public</p>
                </CardContent>
              </Card>
            )}
            {otherAssets.map((b) => (
              <Card key={b.asset}>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted mb-1">{b.asset}</p>
                  <p className="text-3xl font-semibold tracking-tight">{fmt(b.balance)}</p>
                  <p className="text-xs text-muted mt-1">on Stellar · Public</p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium text-muted mb-1">Credit tier</p>
                <p className="text-3xl font-semibold tracking-tight">
                  {credit && credit.tier !== 'None' ? TIER_LABEL[credit.tier] : 'None'}
                </p>
                <p className="text-xs text-muted mt-1">
                  {credit && credit.tier !== 'None'
                    ? `Loan eligible: ${fmt(loanXlm)} XLM`
                    : 'Generate a proof to unlock'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {error && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-danger">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ────────── Network activity ────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Zava network deposits"
          value={poolCount ?? (loading ? '…' : '—')}
          hint="Total commitments recorded across all users"
        />
        <Stat
          label="Your credit"
          value={credit && credit.tier !== 'None' ? `${credit.activeWeeks} weeks` : '—'}
          hint={credit && credit.tier !== 'None'
            ? `Range: ${SAVINGS_RANGES.find((r) => r.key === credit.savingsRange)?.minXlm} XLM/wk`
            : 'Not yet claimed'}
        />
      </div>

      {/* ────────── Recent commitments (anonymous pool view) ────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Zava pool deposits</CardTitle>
          <CardDescription>
            Anonymous commitment hashes from all users — amounts hidden, identities hidden.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && commitments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Loading from Stellar…</p>
          ) : commitments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">No deposits in pool yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Commitment</th>
                  <th className="px-6 py-3 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {commitments.slice(-15).reverse().map((c, idx) => (
                  <tr key={`${c.hash}-${idx}`} className="border-b border-border/60 last:border-0">
                    <td className="px-6 py-3 font-mono text-xs text-muted">
                      {c.hash.slice(0, 20)}…{c.hash.slice(-8)}
                    </td>
                    <td className="px-6 py-3 text-muted">
                      {new Date(c.timestamp * 1000).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
