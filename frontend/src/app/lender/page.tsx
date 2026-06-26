'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Stat } from '@/components/ui/Stat';
import { api, ApiError, CreditRecordV3, LoanDecision } from '@/lib/api';

const tierColor: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  VeryLow: 'success',
  Low: 'success',
  Medium: 'warning',
  None: 'danger',
};

export default function LenderPage() {
  const [wallet, setWallet] = useState('');
  const [record, setRecord] = useState<CreditRecordV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedXlm, setRequestedXlm] = useState('1000');
  const [decision, setDecision] = useState<LoanDecision | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

  async function check() {
    if (wallet.length !== 56) {
      setError('Please enter a valid 56-character Stellar wallet address.');
      return;
    }
    setError(null);
    setRecord(null);
    setDecision(null);
    setLoading(true);
    try {
      const r = await api.getCreditV3(wallet);
      setRecord(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError('No Zava credit record found for this wallet. The borrower must claim credit first.');
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function evaluateLoan() {
    if (!record) return;
    const xlm = parseFloat(requestedXlm);
    if (!Number.isFinite(xlm) || xlm <= 0) {
      setError('Enter a positive XLM amount to request.');
      return;
    }
    setError(null);
    setDecisionLoading(true);
    try {
      const d = await api.simulateLoan(wallet, xlm);
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
          <p className="text-sm text-muted">Credit verification</p>
          <h1 className="text-2xl font-semibold tracking-tight">Look up a Zava borrower</h1>
          <p className="mt-2 text-sm text-muted">
            Enter a wallet address. You will see their credit tier, savings range, eligible loan
            amount, and risk score — proven by zero-knowledge cryptography, with their exact
            savings amounts kept private.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Borrower wallet</CardTitle>
            <CardDescription>Paste the borrower&apos;s Stellar address (G...)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Stellar wallet address"
              placeholder="GABC..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value.trim())}
              hint="56-character Stellar G-address"
              disabled={loading}
            />
            <Button onClick={check} disabled={loading || !wallet}>
              {loading ? 'Checking on-chain…' : 'Check credit'}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </CardContent>
        </Card>

        {record && (
          <>
            {/* Headline credit card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Credit profile</CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">
                      {record.wallet.slice(0, 8)}…{record.wallet.slice(-8)}
                    </CardDescription>
                  </div>
                  <Badge tone={tierColor[record.tier]}>
                    {record.tier === 'VeryLow' ? 'Very Low risk' : `${record.tier} risk`}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="Eligible loan"
                    value={`${record.loanEligibleXlm.toLocaleString()} XLM`}
                    hint={`≈ $${record.loanEligibleUsd.toLocaleString()}`}
                  />
                  <Stat
                    label="Risk score"
                    value={`${record.riskScore} / 100`}
                    hint="Higher is better"
                  />
                  <Stat
                    label="Active savings weeks"
                    value={record.activeWeeks}
                    hint={record.withdrawnWeeks ? `${record.withdrawnWeeks} withdrawn` : 'No withdrawals'}
                  />
                </div>
              </CardContent>
            </Card>

            {/* What the lender sees vs hidden */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What this proves</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row
                  label="Borrower&apos;s claimed savings range"
                  value={`At least ${record.rangeMinWeeklyXlm.toLocaleString()} XLM/week (≈ $${record.rangeLabelUsd}+/wk)`}
                />
                <Row
                  label="Credit valid until"
                  value={new Date(record.expiresAt * 1000).toLocaleDateString()}
                />
                <Row label="Exact deposit amounts" value="Hidden by ZK proof" muted />
                <Row label="Borrower&apos;s transaction history" value="Hidden" muted />
                <Row label="Borrower&apos;s clients / income source" value="Hidden" muted />
              </CardContent>
            </Card>

            {/* Loan simulator */}
            <Card>
              <CardHeader>
                <CardTitle>Simulate a loan</CardTitle>
                <CardDescription>
                  This is a demo — no funds are disbursed. In production, plug this into your
                  lending engine and let on-chain rails do the rest.
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
                        <Row
                          label="Approved amount"
                          value={`${decision.approvedXlm.toLocaleString()} XLM ($${decision.approvedUsd.toLocaleString()})`}
                        />
                        <Row label="Interest rate" value={`${decision.interestRate}% APR`} />
                        <Row label="Term" value={`${decision.termWeeks} weeks`} />
                        <Row
                          label="Total repayable"
                          value={`${decision.totalRepayable.toLocaleString()} XLM`}
                        />
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

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted" dangerouslySetInnerHTML={{ __html: label }} />
      <span className={muted ? 'font-mono text-xs text-muted' : 'font-medium'}>{value}</span>
    </div>
  );
}
