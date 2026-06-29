'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Stat } from '@/components/ui/Stat';
import { ScoreGauge } from '@/components/ScoreGauge';
import { api, ApiError, ScoreLoanDecision, ScoreReport } from '@/lib/api';
import { Tier } from '@/lib/zcs';

const TIER_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Excellent: 'success',
  'Very Good': 'success',
  Good: 'warning',
  Fair: 'warning',
  Poor: 'danger',
};

function LenderContent() {
  const params = useSearchParams();
  const initialToken = params.get('token') ?? '';

  const [token, setToken] = useState(initialToken);
  const [report, setReport] = useState<ScoreReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedXlm, setRequestedXlm] = useState('100');
  const [decision, setDecision] = useState<ScoreLoanDecision | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

  useEffect(() => {
    if (initialToken) void load(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  async function load(t: string) {
    if (!t) return;
    setError(null);
    setReport(null);
    setDecision(null);
    setLoading(true);
    try {
      const r = await api.getScoreReport(t.trim());
      setReport(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError(
          'Report not found or expired. Ask the borrower to issue a fresh sharing link.',
        );
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function evaluateLoan() {
    if (!report) return;
    const xlm = parseFloat(requestedXlm);
    if (!Number.isFinite(xlm) || xlm <= 0) {
      setError('Enter a positive XLM amount to request.');
      return;
    }
    setError(null);
    setDecisionLoading(true);
    try {
      const d = await api.simulateScoreLoan(report.token, xlm);
      setDecision(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDecisionLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="text-base font-semibold tracking-tight">zava · lender portal</div>
          <span className="text-xs text-muted">testnet</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div>
          <p className="text-sm text-muted">Privacy-preserving credit check</p>
          <h1 className="text-2xl font-semibold tracking-tight">Read a Zava credit score</h1>
          <p className="mt-2 text-sm text-muted">
            Paste the sharing token a borrower gave you. You&apos;ll see their ZCS,
            tier, and risk-factor signals — but never their amounts, payers, or
            transaction history.
          </p>
        </div>

        {/* Token entry */}
        <Card>
          <CardHeader>
            <CardTitle>Borrower&apos;s sharing token</CardTitle>
            <CardDescription>
              Looks like a short string at the end of <span className="font-mono">/lender?token=…</span>.
              The borrower generates it from their dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Token"
              placeholder="e.g. eJ9w…3Kt"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={loading}
            />
            <Button onClick={() => load(token)} disabled={loading || !token}>
              {loading ? 'Looking up…' : 'Look up borrower'}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </CardContent>
        </Card>

        {report && (
          <>
            {/* Score gauge */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Credit profile</CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">
                      {report.wallet.slice(0, 8)}…{report.wallet.slice(-8)}
                    </CardDescription>
                  </div>
                  <Badge tone={TIER_TONE[report.tier]}>{report.tier}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
                  <ScoreGauge score={report.score} tier={report.tier as Tier} size={220} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Stat
                      label="Eligible loan"
                      value={`${(Number(BigInt(report.loanEligibleStroops)) / 10_000_000).toLocaleString()} XLM`}
                      hint={`≈ $${((Number(BigInt(report.loanEligibleStroops)) / 10_000_000) * 0.10).toLocaleString()}`}
                    />
                    <Stat
                      label="Streak"
                      value={`${report.streak}`}
                      hint={`${report.plan?.cadence ?? 'period'}s of on-time savings`}
                    />
                    <Stat
                      label="Declared plan"
                      value={
                        report.plan
                          ? `${report.plan.targetRange} ${report.plan.cadence}`
                          : 'None'
                      }
                      hint={report.plan?.label ?? 'Borrower has not committed to a plan'}
                    />
                    <Stat
                      label="Report valid until"
                      value={new Date(parseInt(report.expiresAt, 10) * 1000).toLocaleDateString()}
                      hint="Tokens expire after 7 days"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Factor breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What drives this score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <Bar label="Savings consistency"  value={report.factors.consistency}     weight={35} />
                  <Bar label="Inflow capacity"       value={report.factors.inflow}          weight={25} />
                  <Bar label="Withdrawal discipline" value={report.factors.withdrawal}      weight={20} />
                  <Bar label="Vault tenure"          value={report.factors.tenure}          weight={10} />
                  <Bar label="Diversification"       value={report.factors.diversification} weight={10} />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  <Sig on={report.signals.meetsSavingsGoal}      label="Meets declared savings goal" />
                  <Sig on={report.signals.monthlyInflowAbove500} label="Monthly inflow ≥ $500" />
                  <Sig on={report.signals.lowWithdrawalRatio}    label="Low withdrawal ratio (< 20%)" />
                  <Sig on={report.signals.tenureAbove90d}        label="Vault tenure > 90 days" />
                  <Sig on={report.signals.diversifiedPayers}     label="Diversified income source" />
                </div>
              </CardContent>
            </Card>

            {/* What stays hidden */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What this proves (and what stays private)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="ZCS, tier, eligible loan, factor breakdown" value="Visible to you" />
                <Row label="Yes/no signals (the 5 chips above)" value="Visible to you" />
                <Row label="Borrower&apos;s exact deposit amounts" value="Hidden" muted />
                <Row label="Borrower&apos;s payer identities" value="Hidden" muted />
                <Row label="Borrower&apos;s memos / transaction history" value="Hidden" muted />
                <Row label="Borrower&apos;s spending outside Zava" value="Hidden" muted />
              </CardContent>
            </Card>

            {/* Loan simulator */}
            <Card>
              <CardHeader>
                <CardTitle>Simulate a loan</CardTitle>
                <CardDescription>
                  Pricing assumes 24-week term. Rate scales by tier. Demo only — funds
                  are not disbursed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  label="Requested loan (XLM)"
                  type="number"
                  min={1}
                  step={1}
                  value={requestedXlm}
                  onChange={(e) => setRequestedXlm(e.target.value)}
                  disabled={decisionLoading}
                />
                <Button onClick={evaluateLoan} disabled={decisionLoading}>
                  {decisionLoading ? 'Evaluating…' : 'Evaluate loan'}
                </Button>

                {decision && (
                  <div className="space-y-3 rounded-md border border-border bg-subtle p-4">
                    <div className="flex items-center gap-2">
                      {decision.approved ? (
                        <Badge tone="success">Approved</Badge>
                      ) : (
                        <Badge tone="danger">Declined</Badge>
                      )}
                      <span className="text-sm text-muted">{decision.decision}</span>
                    </div>
                    {decision.approved && (
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <Row label="Approved amount"
                             value={`${decision.approvedXlm.toLocaleString()} XLM ($${(decision.approvedXlm * 0.10).toLocaleString()})`} />
                        <Row label="Interest rate" value={`${decision.interestRate}% APR`} />
                        <Row label="Term"          value={`${decision.termWeeks} weeks`} />
                        <Row label="Total repayable"
                             value={`${decision.totalRepayable.toLocaleString()} XLM`} />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

function Bar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label} <span className="text-foreground/60">({weight}%)</span></span>
        <span className="font-medium">{pct}/100</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Sig({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={
      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 ' +
      (on ? 'border-border bg-surface text-foreground' : 'border-border bg-subtle text-muted')
    }>
      <span>{on ? '✓' : '○'}</span>
      <span className="text-[11px]">{label}</span>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted" dangerouslySetInnerHTML={{ __html: label }} />
      <span className={muted ? 'font-mono text-xs text-muted' : 'font-medium'}>{value}</span>
    </div>
  );
}

export default function LenderPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    }>
      <LenderContent />
    </Suspense>
  );
}
