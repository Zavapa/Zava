'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useWallet } from '@/components/WalletProvider';
import { api, ApiError, SavingsPlan } from '@/lib/api';
import { SAVINGS_RANGES, SavingsRange } from '@/lib/stellar';

type Cadence = 'weekly' | 'monthly';

const CADENCES: Array<{ key: Cadence; label: string; periodDays: number }> = [
  { key: 'weekly',  label: 'Every week',   periodDays: 7 },
  { key: 'monthly', label: 'Every month',  periodDays: 30 },
];

export default function PlanPage() {
  const { address } = useWallet();
  const [plan, setPlan] = useState<SavingsPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [range, setRange] = useState<SavingsRange>('R20');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    void api.getPlan(address)
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        setCadence(p.cadence);
        setRange(p.targetRange);
        setLabel(p.label ?? '');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          // no plan yet — fine, user can declare one
          return;
        }
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [address]);

  if (!address) return null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await api.upsertPlan({
        wallet: address,
        cadence,
        targetRange: range,
        label: label.trim() || undefined,
      });
      setPlan(saved);
      setSuccess('Plan saved. Your credit score updates as you meet it.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const rangeInfo = SAVINGS_RANGES.find((r) => r.key === range)!;
  const cadenceInfo = CADENCES.find((c) => c.key === cadence)!;
  const startedAt = plan ? new Date(parseInt(plan.startedAt, 10) * 1000) : null;
  const daysActive = plan ? Math.floor((Date.now() / 1000 - parseInt(plan.startedAt, 10)) / 86_400) : 0;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <p className="text-sm text-muted">Step 0 of your credit story</p>
        <h1 className="text-2xl font-semibold tracking-tight">Set a savings plan</h1>
        <p className="mt-2 text-sm text-muted">
          Pick what you commit to saving — every week or every month. Zava tracks
          your adherence and builds your credit score from it. Lenders only ever
          see the score, never the exact amounts.
        </p>
      </div>

      {/* Current plan if any */}
      {plan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Active plan</CardTitle>
                <CardDescription>{plan.label || 'No label'}</CardDescription>
              </div>
              <Badge tone="success">Active</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Goal"
                value={`≥ ${SAVINGS_RANGES.find((r) => r.key === plan.targetRange)?.minXlm} XLM`}
                hint={plan.cadence === 'weekly' ? 'per week' : 'per month'}
              />
              <Stat
                label="Started"
                value={startedAt?.toLocaleDateString() ?? '—'}
                hint={`${daysActive} day${daysActive === 1 ? '' : 's'} ago`}
              />
              <Stat
                label="Range tier"
                value={plan.targetRange}
                hint="Locks loan eligibility ceiling"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{plan ? 'Update plan' : 'Declare your plan'}</CardTitle>
          <CardDescription>
            You can change this at any time, but doing so restarts your streak count.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-6">
            {/* Cadence */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted uppercase tracking-widest">Cadence</p>
              <div className="flex gap-2">
                {CADENCES.map((c) => {
                  const active = cadence === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setCadence(c.key)}
                      disabled={saving}
                      className={
                        'flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ' +
                        (active
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-surface text-muted hover:bg-subtle')
                      }
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Range tier */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted uppercase tracking-widest">
                Minimum amount each {cadence === 'weekly' ? 'week' : 'month'}
              </p>
              <div className="grid gap-2 sm:grid-cols-5">
                {SAVINGS_RANGES.map((r) => {
                  const active = range === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRange(r.key)}
                      disabled={saving}
                      className={
                        'rounded-md border px-3 py-3 text-left transition-colors ' +
                        (active
                          ? 'border-foreground bg-subtle'
                          : 'border-border bg-surface hover:bg-subtle')
                      }
                    >
                      <p className="text-sm font-medium">≥ {r.minXlm} XLM</p>
                      <p className="text-xs text-muted">≈ ${r.labelUsd}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-widest">
                Label (optional)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 80))}
                placeholder="e.g. Emergency fund, House deposit, Q1 savings"
                disabled={saving}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </div>

            {/* Summary */}
            <div className="rounded-md border border-border bg-subtle p-4 text-sm">
              <p className="font-medium text-foreground">Your commitment</p>
              <p className="mt-1 text-muted">
                Save at least <strong className="text-foreground">{rangeInfo.minXlm} XLM</strong>
                {' '} (≈ ${rangeInfo.labelUsd}) every <strong className="text-foreground">{cadenceInfo.periodDays} days</strong>.
              </p>
              <p className="mt-2 text-xs text-muted">
                Each on-time deposit extends your streak. Missing a period resets it.
                Withdrawing reduces your withdrawal-discipline score but doesn&apos;t break the streak.
              </p>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
            {success && (
              <div className="flex items-center gap-2 text-sm">
                <Badge tone="success">Saved</Badge>
                <span>{success}</span>
              </div>
            )}

            <Button type="submit" disabled={saving || loading}>
              {saving ? 'Saving…' : plan ? 'Update plan' : 'Declare plan'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
