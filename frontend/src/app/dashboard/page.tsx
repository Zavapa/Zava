'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import {
  CommitmentRow,
  CreditRecord,
  getCommitmentCount,
  getCommitments,
  getCreditTier,
} from '@/lib/stellar';

const TIER_LABEL: Record<string, string> = {
  Medium: 'Medium',
  Low: 'Low',
  VeryLow: 'Very Low',
};

export default function OverviewPage() {
  const { address, displayName, network } = useWallet();
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
        const [c, rows, record] = await Promise.all([
          getCommitmentCount(),
          getCommitments(0, 50),
          getCreditTier(address),
        ]);
        if (cancelled) return;
        setCount(c);
        setCommitments(rows);
        setCredit(record);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName ?? 'You'}</h1>
        </div>
        <Link href="/dashboard/deposit">
          <Button>New deposit</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Network commitments"
          value={count ?? (loading ? '…' : '—')}
          hint="Total deposits across all Zava users"
        />
        <Stat
          label="Your wallet"
          value={
            <span className="font-mono text-base">
              {address.slice(0, 6)}…{address.slice(-6)}
            </span>
          }
          hint={network ?? 'Stellar testnet'}
        />
        <Stat
          label="Credit tier"
          value={credit ? TIER_LABEL[credit.tier] ?? credit.tier : 'None'}
          hint={
            credit
              ? `Expires ${new Date(credit.expiresAt * 1000).toLocaleDateString()}`
              : 'Generate a proof to unlock credit'
          }
        />
      </div>

      {error && (
        <Card className="border-danger/40">
          <CardContent>
            <p className="text-sm text-danger">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent deposits on Zava</CardTitle>
          <CardDescription>
            Anonymous commitments and nullifiers visible to anyone — but unlinked to wallets.
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
                  <th className="px-6 py-3 text-left font-medium">Week</th>
                  <th className="px-6 py-3 text-left font-medium">Commitment</th>
                  <th className="px-6 py-3 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {commitments.slice(-15).reverse().map((c, idx) => (
                  <tr key={`${c.hash}-${idx}`} className="border-b border-border/60 last:border-0">
                    <td className="px-6 py-3">
                      <Badge>#{c.weekNumber}</Badge>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-muted">
                      {c.hash.slice(0, 16)}…{c.hash.slice(-8)}
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
