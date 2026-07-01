'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import { SAVINGS_RANGES } from '@/lib/stellar';
import { PlanProgress, usePlans } from '@/lib/plans';

export default function PlansPage() {
  const { address } = useWallet();
  const { plans, progressById, unassignedUsd, loading, error, refresh } = usePlans();

  if (!address) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">Savings plans</p>
          <h1 className="text-2xl font-semibold tracking-tight">Your plans</h1>
          <p className="mt-2 text-sm text-muted">
            Every deposit you tag lands in one of these plans. Track adherence,
            follow your streaks, and see live balances per plan.
          </p>
        </div>
        <Link href="/dashboard/plans/new">
          <Button size="sm">New plan</Button>
        </Link>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading && plans.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted">Loading your plans…</CardContent>
        </Card>
      )}

      {!loading && plans.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No plans yet</CardTitle>
            <CardDescription>
              Create your first plan to start building a track record lenders can trust.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/plans/new">
              <Button>Create your first plan</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {plans.map((plan) => {
          const p = progressById.get(plan.id);
          return p ? <PlanCard key={plan.id} progress={p} /> : null;
        })}
      </div>

      {unassignedUsd > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unassigned deposits</CardTitle>
            <CardDescription>
              You have deposits worth ~${(unassignedUsd / 10_000_000).toFixed(2)} that
              were made before plans existed (or without a plan tag). They still count
              toward your credit score — they just aren&apos;t grouped under a plan.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}

function PlanCard({ progress }: { progress: PlanProgress }) {
  const { plan } = progress;
  const range = SAVINGS_RANGES.find((r) => r.key === plan.targetRange);
  const startedAt = new Date(parseInt(plan.startedAt, 10) * 1000);
  const balanceUsd = (progress.liveBalanceUsd / 10_000_000).toFixed(2);
  const adherencePct = Math.round(progress.adherence * 100);
  const nextDue = new Date(progress.nextDueSec * 1000);

  return (
    <Link href={`/dashboard/plans/${plan.id}`} className="block">
      <Card className="transition-colors hover:border-foreground/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{plan.label || 'Untitled plan'}</CardTitle>
              <CardDescription>
                ≥ ${range?.labelUsd ?? '?'} every {plan.cadence === 'weekly' ? 'week' : 'month'}
                {' · '}
                since {startedAt.toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {progress.currentPeriodMet ? (
                <Badge tone="success">On track</Badge>
              ) : (
                <Badge tone="warning">Due</Badge>
              )}
              {progress.streak > 1 && (
                <Badge tone="neutral">🔥 {progress.streak}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat
              label="Live balance"
              value={`$${balanceUsd}`}
              hint={`${progress.depositCount} deposits`}
            />
            <Stat
              label="Adherence"
              value={`${adherencePct}%`}
              hint={`${progress.periodsHit} of ${progress.periodsElapsed} periods hit`}
            />
            <Stat
              label="Streak"
              value={String(progress.streak)}
              hint={plan.cadence === 'weekly' ? 'weeks' : 'months'}
            />
            <Stat
              label="Next due"
              value={nextDue.toLocaleDateString()}
              hint={progress.currentPeriodMet ? 'this period met' : 'this period pending'}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
