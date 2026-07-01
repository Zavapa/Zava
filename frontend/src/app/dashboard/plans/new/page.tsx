'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useWallet } from '@/components/WalletProvider';
import { api } from '@/lib/api';
import { SAVINGS_RANGES, SavingsRange } from '@/lib/stellar';

type Cadence = 'weekly' | 'monthly';

const CADENCES: Array<{ key: Cadence; label: string }> = [
  { key: 'weekly',  label: 'Every week' },
  { key: 'monthly', label: 'Every month' },
];

export default function NewPlanPage() {
  const router = useRouter();
  const { address } = useWallet();
  const [label, setLabel] = useState('');
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [range, setRange] = useState<SavingsRange>('R20');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!address) return null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) { setError('Give your plan a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const plan = await api.createPlan({
        wallet: address!,
        cadence,
        targetRange: range,
        label: trimmed,
      });
      router.push(`/dashboard/plans/${plan.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const rangeInfo = SAVINGS_RANGES.find((r) => r.key === range)!;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="text-sm text-muted">New savings plan</p>
        <h1 className="text-2xl font-semibold tracking-tight">Create a plan</h1>
        <p className="mt-2 text-sm text-muted">
          Name it, set the cadence and minimum, then start depositing. Each plan
          tracks its own balance, streak, and adherence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan details</CardTitle>
          <CardDescription>
            You can create as many plans as you like — Emergency, House, Q1 bonus…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-widest">
                Plan name
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 80))}
                placeholder="Emergency fund"
                disabled={saving}
                autoFocus
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
              <p className="text-xs text-muted">{label.length}/80</p>
            </div>

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

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted uppercase tracking-widest">
                Minimum each {cadence === 'weekly' ? 'week' : 'month'}
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
                      <p className="text-sm font-medium">≥ ${r.labelUsd}</p>
                      <p className="text-xs text-muted">{r.minXlm} XLM / {r.minUsdc} USDC</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-border bg-subtle p-4 text-sm">
              <p className="font-medium text-foreground">You commit to</p>
              <p className="mt-1 text-muted">
                Deposit at least <strong className="text-foreground">${rangeInfo.labelUsd}</strong>
                {' '}(≥ {rangeInfo.minXlm} XLM or {rangeInfo.minUsdc} USDC) every{' '}
                <strong className="text-foreground">{cadence === 'weekly' ? '7 days' : '30 days'}</strong>.
              </p>
              <p className="mt-2 text-xs text-muted">
                Each period you meet the target extends your streak. Missing a
                period resets it. You can archive the plan any time.
              </p>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create plan'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push('/dashboard/plans')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Badge tone="neutral">Private on-chain</Badge>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
