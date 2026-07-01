'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { useWallet } from '@/components/WalletProvider';
import { DepositRecord, loadDeposits } from '@/lib/savingsStore';

const TIERS = [
  { weeks: 8,  label: '8-week tier',  risk: 'Medium',   loan: '2× monthly savings' },
  { weeks: 12, label: '12-week tier', risk: 'Low',       loan: '4× monthly savings' },
  { weeks: 24, label: '24-week tier', risk: 'Very Low',  loan: '6× monthly savings' },
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

function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How savings work</CardTitle>
        <CardDescription>
          Understanding deposits, the vault, and how to withdraw.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-subtle p-4 space-y-2">
            <div className="text-lg font-semibold text-foreground">① Deposit</div>
            <p>
              You send XLM or USDC to the Zava vault. On-chain it records a hidden
              <strong className="text-foreground"> commitment</strong> — a cryptographic
              fingerprint of your amount + a private nonce. Nobody can read the amount
              from the blockchain.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-subtle p-4 space-y-2">
            <div className="text-lg font-semibold text-foreground">② Build your record</div>
            <p>
              Each deposit counts as one savings week. After <strong className="text-foreground">8 weeks</strong> you
              unlock credit eligibility. After <strong className="text-foreground">12</strong> and{' '}
              <strong className="text-foreground">24</strong> weeks you move to lower-risk tiers with
              higher loan limits.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-subtle p-4 space-y-2">
            <div className="text-lg font-semibold text-foreground">③ Withdraw any time</div>
            <p>
              Go to <strong className="text-foreground">Withdraw</strong> and your wallet
              scans the vault for deposits belonging to you. You generate a{' '}
              <strong className="text-foreground">ZK proof</strong> that proves ownership
              without revealing which commitment is yours, then funds land at any address
              you choose.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-border bg-subtle/60 px-4 py-3 text-xs space-y-1">
          <p className="font-medium text-foreground">Privacy guarantee</p>
          <p>
            The vault contract never links a withdrawal back to a deposit. An observer
            can see that <em>someone</em> deposited and <em>someone</em> withdrew, but not
            that they are the same person. Your <strong className="text-foreground">scan key</strong> (derived
            from your wallet secret) is what lets your device find its own deposits —
            it never leaves your browser.
          </p>
        </div>
      </CardContent>
    </Card>
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
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My savings</h1>
          <p className="mt-1 text-sm text-muted">
            Each deposit builds your ZK savings record — without revealing amounts to lenders.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/withdraw">
            <Button variant="secondary">Withdraw</Button>
          </Link>
          <Link href="/dashboard/deposit">
            <Button>New deposit</Button>
          </Link>
        </div>
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
              {weeksLeft === 0
                ? 'Eligible — generate a proof'
                : `${weeksLeft} more week${weeksLeft !== 1 ? 's' : ''} to go`}
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

      {/* My deposits — card list with actions */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>My deposits</CardTitle>
              <CardDescription>
                Your shielded vault savings. Amounts are hidden on-chain — only your
                device knows these belong to you. Click <strong>Withdraw</strong> on any
                deposit to take funds out privately.
              </CardDescription>
            </div>
            <Link href="/dashboard/deposit" className="shrink-0">
              <Button size="sm">+ Add deposit</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {deposits.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-muted">No deposits recorded yet.</p>
              <p className="text-xs text-muted max-w-xs mx-auto">
                Make your first deposit to start building your private savings record and
                unlock credit eligibility after 8 weeks.
              </p>
              <Link href="/dashboard/deposit">
                <Button variant="secondary" size="sm">Make your first deposit</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...deposits].reverse().map((d) => (
                <div key={d.week} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Left: week + asset + date */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge>Week {d.week + 1}</Badge>
                      <span className="text-sm font-medium">{d.asset}</span>
                      <span className="text-xs text-muted">
                        {new Date(d.timestamp * 1000).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${d.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-muted underline"
                      >
                        {d.txHash.slice(0, 10)}…
                      </a>
                    </div>

                    {/* Right: actions */}
                    <div className="flex gap-2 shrink-0">
                      <Link href="/dashboard/deposit">
                        <Button size="sm" variant="secondary">Deposit again</Button>
                      </Link>
                      <Link href="/dashboard/withdraw">
                        <Button size="sm">Withdraw</Button>
                      </Link>
                    </div>
                  </div>

                  {/* How withdrawal works — inline hint */}
                  <p className="mt-2 text-xs text-muted">
                    To withdraw: go to <strong className="text-foreground">Withdraw</strong>, your
                    wallet will find this deposit automatically, then you generate a ZK proof and
                    choose a recipient. No on-chain link is created between this deposit and the withdrawal.
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                    {done && <Badge tone="success">Unlocked</Badge>}
                  </div>
                  <span className="text-muted">
                    {progress}/{t.weeks} weeks
                  </span>
                </div>
                <ProgressBar value={progress} max={t.weeks} />
                <p className="text-xs text-muted">
                  Eligible loan: <strong className="text-foreground">{t.loan}</strong>
                  {done ? ' — you qualify, generate a ZK proof to claim.' : ''}
                </p>
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

      {/* How it works */}
      <HowItWorks />
    </div>
  );
}
