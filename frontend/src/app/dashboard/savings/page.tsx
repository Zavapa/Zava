'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { useWallet } from '@/components/WalletProvider';
import { DepositRecord, loadDeposits } from '@/lib/savingsStore';

const TIERS = [
  { weeks: 8,  label: '8-week tier',  risk: 'Medium', loan: '2× monthly savings' },
  { weeks: 12, label: '12-week tier', risk: 'Low',    loan: '4× monthly savings' },
  { weeks: 24, label: '24-week tier', risk: 'Very Low', loan: '6× monthly savings' },
];

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
      <div
        className="h-full rounded-full bg-foreground transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function SavingsPage() {
  const { address } = useWallet();
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);

  useEffect(() => {
    if (!address) return;
    setDeposits(loadDeposits(address));
  }, [address]);

  if (!address) return null;

  const weekCount = deposits.length;
  const nextTier = TIERS.find((t) => weekCount < t.weeks) ?? TIERS[TIERS.length - 1];
  const weeksLeft = Math.max(0, nextTier.weeks - weekCount);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My savings</h1>
          <p className="mt-1 text-sm text-muted">
            Each deposit builds your ZK savings record — without revealing amounts to lenders.
          </p>
        </div>
        <Link href="/dashboard/deposit">
          <Button>New deposit</Button>
        </Link>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted mb-1">Weeks saved</p>
            <p className="text-4xl font-semibold">{weekCount}</p>
            <p className="text-xs text-muted mt-1">deposits recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted mb-1">Next tier</p>
            <p className="text-2xl font-semibold">{nextTier.label}</p>
            <p className="text-xs text-muted mt-1">
              {weeksLeft === 0 ? 'Eligible — generate a proof' : `${weeksLeft} more week${weeksLeft !== 1 ? 's' : ''} to go`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted mb-1">Credit eligible</p>
            <p className="text-2xl font-semibold">{nextTier.loan}</p>
            <p className="text-xs text-muted mt-1">when proof is verified</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier progress */}
      <Card>
        <CardHeader>
          <CardTitle>Progress toward credit tiers</CardTitle>
          <CardDescription>
            Save consistently each week to unlock higher credit limits with lower risk scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {TIERS.map((t) => {
            const done = weekCount >= t.weeks;
            const progress = Math.min(weekCount, t.weeks);
            return (
              <div key={t.weeks} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.label}</span>
                    <Badge tone={done ? 'success' : 'neutral'}>{t.risk} risk</Badge>
                  </div>
                  <span className="text-muted">
                    {progress}/{t.weeks} weeks
                  </span>
                </div>
                <ProgressBar value={progress} max={t.weeks} />
                <p className="text-xs text-muted">Eligible loan: {t.loan}</p>
              </div>
            );
          })}

          {weekCount >= 8 && (
            <div className="pt-2">
              <Link href="/dashboard/credit">
                <Button variant="secondary">Generate ZK proof &amp; unlock credit</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposit history */}
      <Card>
        <CardHeader>
          <CardTitle>Deposit history</CardTitle>
          <CardDescription>
            Your locally tracked savings. Commitments on-chain are anonymous — only
            your device knows these belong to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {deposits.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-muted">No deposits recorded yet.</p>
              <Link href="/dashboard/deposit">
                <Button variant="secondary" size="sm">Make your first deposit</Button>
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Week</th>
                  <th className="px-6 py-3 text-left font-medium">Asset</th>
                  <th className="px-6 py-3 text-left font-medium">Date</th>
                  <th className="px-6 py-3 text-left font-medium">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {[...deposits].reverse().map((d) => (
                  <tr key={d.week} className="border-b border-border/60 last:border-0">
                    <td className="px-6 py-3">
                      <Badge>Week {d.week + 1}</Badge>
                    </td>
                    <td className="px-6 py-3 font-medium">{d.asset}</td>
                    <td className="px-6 py-3 text-muted">
                      {new Date(d.timestamp * 1000).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-3">
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${d.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-muted underline"
                      >
                        {d.txHash.slice(0, 10)}…
                      </a>
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
