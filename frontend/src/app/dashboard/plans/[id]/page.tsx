'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import { api } from '@/lib/api';
import { SAVINGS_RANGES } from '@/lib/stellar';
import { computePlanProgress, PlanDeposit, usePlans } from '@/lib/plans';

export default function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { address } = useWallet();
  const { plans, deposits, loading, error, refresh } = usePlans();
  const [archiving, setArchiving] = useState(false);

  const plan = useMemo(() => plans.find((p) => p.id === id) ?? null, [plans, id]);
  const planDeposits = useMemo<PlanDeposit[]>(
    () => deposits.filter((d) => d.planId === id),
    [deposits, id],
  );
  const progress = useMemo(
    () => (plan ? computePlanProgress(plan, planDeposits) : null),
    [plan, planDeposits],
  );

  if (!address) return null;

  if (loading && !plan) {
    return <p className="text-sm text-muted">Loading plan…</p>;
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm text-danger">Plan not found or archived.</p>
        <Link href="/dashboard/plans">
          <Button size="sm" variant="secondary">Back to plans</Button>
        </Link>
      </div>
    );
  }

  const range = SAVINGS_RANGES.find((r) => r.key === plan.targetRange);
  const startedAt = new Date(parseInt(plan.startedAt, 10) * 1000);
  const nextDue = progress ? new Date(progress.nextDueSec * 1000) : null;

  async function archive() {
    if (!confirm(`Archive "${plan!.label}"? It will stop counting toward streaks, but the deposits remain yours.`)) return;
    setArchiving(true);
    try {
      await api.archivePlan(plan!.id);
      router.push('/dashboard/plans');
    } catch (e) {
      alert((e as Error).message);
      setArchiving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/plans" className="text-xs text-muted hover:text-foreground">
            ← All plans
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{plan.label}</h1>
          <p className="mt-1 text-sm text-muted">
            ≥ ${range?.labelUsd ?? '?'} every {plan.cadence === 'weekly' ? 'week' : 'month'}
            {' · '}
            started {startedAt.toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {progress?.currentPeriodMet ? (
            <Badge tone="success">On track</Badge>
          ) : (
            <Badge tone="warning">This period pending</Badge>
          )}
        </div>
      </div>

      {progress && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat
                label="Live balance"
                value={`$${(progress.liveBalanceUsd / 10_000_000).toFixed(2)}`}
                hint={`${progress.depositCount} deposits`}
              />
              <Stat
                label="Adherence"
                value={`${Math.round(progress.adherence * 100)}%`}
                hint={`${progress.periodsHit} / ${progress.periodsElapsed}`}
              />
              <Stat
                label="Streak"
                value={String(progress.streak)}
                hint={plan.cadence === 'weekly' ? 'weeks in a row' : 'months in a row'}
              />
              <Stat
                label="Next due"
                value={nextDue?.toLocaleDateString() ?? '—'}
                hint={progress.currentPeriodMet ? 'ahead of schedule' : 'this period pending'}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/deposit?plan=${plan.id}`}>
          <Button>Deposit to this plan</Button>
        </Link>
        <Link href={`/dashboard/withdraw?plan=${plan.id}`}>
          <Button variant="secondary">Withdraw</Button>
        </Link>
        <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
        <div className="ml-auto">
          <Button variant="ghost" onClick={archive} disabled={archiving}>
            {archiving ? 'Archiving…' : 'Archive plan'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deposits in this plan</CardTitle>
          <CardDescription>
            Newest first. Live deposits are still in the vault; withdrawn ones have
            had their nullifier published on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {progress?.deposits.length === 0 ? (
            <p className="text-sm text-muted">
              No deposits yet.{' '}
              <Link href={`/dashboard/deposit?plan=${plan.id}`} className="underline">
                Make your first deposit to this plan.
              </Link>
            </p>
          ) : (
            <div className="divide-y divide-border">
              {progress?.deposits.map((d) => (
                <DepositRow key={`${d.nonce}-${d.week}`} deposit={d} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DepositRow({ deposit }: { deposit: PlanDeposit }) {
  const when = new Date(deposit.timestampSec * 1000);
  const nativeAmount = (deposit.amountStroops / 10_000_000).toFixed(deposit.asset === 'USDC' ? 2 : 4);
  const usd = (deposit.usdStroops / 10_000_000).toFixed(2);

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">
          {nativeAmount} {deposit.asset}
          <span className="ml-2 text-xs text-muted">≈ ${usd}</span>
        </p>
        {deposit.memo && <p className="mt-0.5 text-xs text-muted">{deposit.memo}</p>}
        <p className="mt-0.5 text-xs text-muted">{when.toLocaleString()}</p>
      </div>
      {deposit.spent ? (
        <Badge tone="neutral">Withdrawn</Badge>
      ) : (
        <Badge tone="success">In vault</Badge>
      )}
    </div>
  );
}
