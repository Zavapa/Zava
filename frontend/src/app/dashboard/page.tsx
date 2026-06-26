'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  AssetBalance,
  CommitmentRow,
  CreditRecord,
  getAccountBalances,
  getCommitmentCount,
  getCommitments,
  getCreditTier,
} from '@/lib/stellar';

const TIER_LABEL: Record<string, string> = {
  Medium: 'Medium risk',
  Low: 'Low risk',
  VeryLow: 'Very low risk',
};

function fmt(balance: string) {
  const n = parseFloat(balance);
  if (isNaN(n)) return balance;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function OverviewPage() {
  const { address, displayName, network } = useWallet();
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [credit, setCredit] = useState<CreditRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          getCreditTier(address),
        ]);
        if (cancelled) return;
        setBalances(bals);
        setCount(c);
        setCommitments(rows);
        setCredit(record);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  if (!address) return null;

  const xlm = balances.find((b) => b.asset === 'XLM');
  const otherAssets = balances.filter((b) => b.asset !== 'XLM');

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
        <Link href="/dashboard/deposit">
          <Button>New deposit</Button>
        </Link>
      </div>

      {/* Balance cards */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Wallet balance</p>
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
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Fund it with Friendbot
                </a>
                .
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {/* XLM always first */}
            {xlm && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted mb-1">XLM</p>
                  <p className="text-3xl font-semibold tracking-tight">{fmt(xlm.balance)}</p>
                  <p className="text-xs text-muted mt-1">Stellar Lumens</p>
                </CardContent>
              </Card>
            )}
            {/* Other assets (USDC, etc.) */}
            {otherAssets.map((b) => (
              <Card key={b.asset}>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted mb-1">{b.asset}</p>
                  <p className="text-3xl font-semibold tracking-tight">{fmt(b.balance)}</p>
                  <p className="text-xs text-muted mt-1">on Stellar</p>
                </CardContent>
              </Card>
            ))}
            {/* Zava stats */}
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium text-muted mb-1">Credit tier</p>
                <p className="text-3xl font-semibold tracking-tight">
                  {credit ? TIER_LABEL[credit.tier] ?? credit.tier : 'None'}
                </p>
                <p className="text-xs text-muted mt-1">
                  {credit
                    ? `Valid until ${new Date(credit.expiresAt * 1000).toLocaleDateString()}`
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

      {/* Zava stats row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Zava network deposits"
          value={count ?? (loading ? '…' : '—')}
          hint="Total commitments recorded across all users"
        />
        <Stat
          label="Your commitments"
          value={commitments.length}
          hint="Anonymous — not linked to your wallet on-chain"
        />
      </div>

      {/* Recent commitments table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Zava deposits</CardTitle>
          <CardDescription>
            Anonymous commitment hashes — amounts are hidden inside them.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && commitments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Loading from Stellar…</p>
          ) : commitments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              No deposits yet. Be the first.
            </p>
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
