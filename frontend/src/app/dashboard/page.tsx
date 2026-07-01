'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { ActionCard } from '@/components/ui/ActionCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScoreGauge } from '@/components/ScoreGauge';
import { useWallet } from '@/components/WalletProvider';
import {
  AssetBalance,
  CreditRecordOnChain,
  getAccountBalances,
  getCreditRecord,
  getVaultDepositEvents,
  SAVINGS_RANGES,
  toUsdStroops,
} from '@/lib/stellar';
import { decryptNote } from '@/lib/noteEncryption';
import { useZcs } from '@/lib/useZcs';
import { api } from '@/lib/api';

function fmt(balance: string | number) {
  const n = typeof balance === 'number' ? balance : parseFloat(balance);
  if (isNaN(n)) return String(balance);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const TIER_LABEL: Record<string, string> = {
  Medium: 'Medium risk',
  Low: 'Low risk',
  VeryLow: 'Very low risk',
  None: 'None',
};

export default function OverviewPage() {
  const { address, displayName, network, scanKey } = useWallet();

  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [credit, setCredit] = useState<CreditRecordOnChain | null>(null);
  const [vaultMineXlm, setVaultMineXlm] = useState(0);
  const [vaultMineCount, setVaultMineCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const scanMyVault = useCallback(async () => {
    if (!scanKey) return;
    try {
      const events = await getVaultDepositEvents();
      let mineUsdStroops = 0n;
      let mineCount = 0;
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (note) {
          mineCount += 1;
          mineUsdStroops += BigInt(toUsdStroops(note.amount, ev.asset));
        }
      }
      setVaultMineCount(mineCount);
      setVaultMineXlm(Number(mineUsdStroops) / 10_000_000);
    } catch {
      // ignore
    }
  }, [scanKey]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [bals, record] = await Promise.all([
          getAccountBalances(address),
          getCreditRecord(address),
        ]);
        if (cancelled) return;
        setBalances(bals);
        setCredit(record);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void scanMyVault();
    return () => { cancelled = true; };
  }, [address, scanMyVault]);

  const zcs = useZcs();

  const [issuingLink, setIssuingLink] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function issueShareLink() {
    if (!zcs.report) return;
    setIssuingLink(true);
    setShareError(null);
    try {
      const r = zcs.report;
      const issued = await api.issueScore({
        wallet: r.wallet,
        score: r.score,
        tier: r.tier,
        loanEligibleStroops: r.loanEligibleStroops,
        factors: r.factors,
        signals: r.signals,
        plan: r.plan ? {
          cadence: r.plan.cadence,
          targetRange: r.plan.targetRange,
          label: r.plan.label,
        } : null,
        streak: r.streak,
      });
      setShareUrl(`${window.location.origin}/lender?token=${issued.token}`);
    } catch (e) {
      setShareError((e as Error).message);
    } finally {
      setIssuingLink(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (!address) return null;

  const xlm = balances.find((b) => b.asset === 'XLM');
  const otherAssets = balances.filter((b) => b.asset !== 'XLM');
  const loanXlm = credit ? Number(credit.loanEligibleStroops) / 10_000_000 : 0;
  const scoreValue = zcs.report?.score ?? null;
  const tierValue = zcs.report?.tier ?? null;

  return (
    <div className="space-y-12">

      {/* ───── Greeting / page header ───── */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Overview
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Welcome back, {displayName ?? 'friend'}
          </h1>
          <p className="font-mono text-xs text-muted">
            {address.slice(0, 10)}…{address.slice(-10)} · Stellar {network ?? 'testnet'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/deposit"><Button>Receive payment</Button></Link>
          <Link href="/dashboard/withdraw"><Button variant="secondary">Withdraw</Button></Link>
        </div>
      </section>

      {/* ───── Hero stats row ───── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          tone="accent"
          label="Zava Credit Score"
          value={scoreValue ?? '—'}
          hint={
            tierValue
              ? `Tier · ${tierValue}`
              : 'Make your first deposit to start your score'
          }
        />
        <MetricCard
          label="Shielded balance"
          value={vaultMineXlm > 0 ? fmt(vaultMineXlm) : '0.00'}
          hint={`${vaultMineCount} private deposit${vaultMineCount === 1 ? '' : 's'} · USD eq.`}
        />
        <MetricCard
          label="Public wallet"
          value={xlm ? fmt(xlm.balance) : (loading ? '…' : '0.00')}
          hint="XLM on Stellar account"
        />
        <MetricCard
          label="Loan eligible"
          value={credit && credit.tier !== 'None' ? fmt(loanXlm) : '—'}
          hint={
            credit && credit.tier !== 'None'
              ? `Tier · ${TIER_LABEL[credit.tier]}`
              : 'Generate a proof to unlock'
          }
        />
      </section>

      {/* ───── Score Panel + Quick Actions ───── */}
      <section className="grid gap-6 lg:grid-cols-3">

        {/* Score panel — spans 2 cols */}
        <Card className="lg:col-span-2 border-foreground/15">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Zava Credit Score</CardTitle>
                <CardDescription>
                  Privacy-preserving FICO-like score (300–850) computed locally from your
                  vault activity. Lenders see only this score, never your amounts.
                </CardDescription>
              </div>
              {!zcs.plan && (
                <Link href="/dashboard/plan">
                  <Button size="sm" variant="secondary">Set savings plan</Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {zcs.loading ? (
              <p className="text-sm text-muted">Computing score…</p>
            ) : !zcs.report ? (
              <EmptyState
                icon="◎"
                title="No score yet"
                description="Make your first private deposit to start building your Zava credit score."
                action={
                  <Link href="/dashboard/deposit">
                    <Button size="sm">Receive your first payment</Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <ScoreGauge score={zcs.report.score} tier={zcs.report.tier} />
                  <Badge tone={
                    zcs.report.tier === 'Excellent' || zcs.report.tier === 'Very Good' ? 'success'
                      : zcs.report.tier === 'Good' || zcs.report.tier === 'Fair' ? 'warning'
                      : 'danger'
                  }>
                    {zcs.report.tier}
                  </Badge>
                  <div className="text-center text-xs text-muted">
                    Streak: <strong className="text-foreground">{zcs.report.streak}</strong>
                    {' '}{zcs.plan?.cadence === 'weekly' ? 'weeks' : 'months'}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2 text-sm">
                    <FactorBar label="Savings consistency"  value={zcs.report.factors.consistency}     weight="35%" />
                    <FactorBar label="Inflow capacity"       value={zcs.report.factors.inflow}          weight="25%" />
                    <FactorBar label="Withdrawal discipline" value={zcs.report.factors.withdrawal}      weight="20%" />
                    <FactorBar label="Vault tenure"          value={zcs.report.factors.tenure}          weight="10%" />
                    <FactorBar label="Diversification"       value={zcs.report.factors.diversification} weight="10%" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <SignalChip on={zcs.report.signals.meetsSavingsGoal}      label="Meets savings goal" />
                    <SignalChip on={zcs.report.signals.monthlyInflowAbove500} label="Inflow ≥ $500 / mo" />
                    <SignalChip on={zcs.report.signals.lowWithdrawalRatio}    label="Low withdrawal ratio" />
                    <SignalChip on={zcs.report.signals.tenureAbove90d}        label="Tenure > 90d" />
                    <SignalChip on={zcs.report.signals.diversifiedPayers}     label="Diversified income" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          {zcs.report && (
            <div className="border-t border-border bg-subtle/40 px-6 py-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Share with a lender</p>
                  <p className="text-xs text-muted">
                    A signed link that reveals your score + risk signals. Nothing else. Expires in 7 days.
                  </p>
                </div>
                {!shareUrl && (
                  <Button size="sm" onClick={issueShareLink} disabled={issuingLink}>
                    {issuingLink ? 'Generating…' : 'Create link'}
                  </Button>
                )}
              </div>
              {shareUrl && (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-mono break-all">
                    {shareUrl}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={copyShareLink}>
                      {linkCopied ? 'Copied!' : 'Copy link'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShareUrl(null)}>Clear</Button>
                  </div>
                </div>
              )}
              {shareError && <p className="text-sm text-danger">{shareError}</p>}
            </div>
          )}
        </Card>

        {/* Quick actions side rail */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Quick actions
          </p>
          <ActionCard
            href="/dashboard/deposit"
            icon="↓"
            title="Receive payment"
            description="Create a private payment link for a client."
          />
          <ActionCard
            href="/dashboard/send"
            icon="↗"
            title="Send payment"
            description="Pay another Zava handle or Stellar address."
          />
          <ActionCard
            href="/dashboard/withdraw"
            icon="↑"
            title="Withdraw"
            description="Move funds out of your shielded vault."
          />
          <ActionCard
            href="/dashboard/credit"
            icon="◆"
            title="Credit proofs"
            description="Generate or refresh your ZK credit proof."
          />
          <ActionCard
            href="/dashboard/plan"
            icon="◎"
            title="Savings plan"
            description="Set or adjust your target cadence and range."
          />
        </div>
      </section>

      {/* ───── Private Vault ───── */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="Shielded"
          title={
            <span className="flex items-center gap-3">
              Private vault
              <Badge tone="success">Encrypted</Badge>
            </span>
          }
          description="Funds clients have paid you privately via Zava. Decrypted from on-chain events using your scan key — nobody else can see your balance."
          action={
            <Link href="/dashboard/withdraw">
              <Button>Withdraw privately</Button>
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            tone="subtle"
            label="Your shielded balance"
            value={`${fmt(vaultMineXlm)}`}
            hint={`${vaultMineCount} deposit${vaultMineCount === 1 ? '' : 's'} only you can see`}
          />
          <MetricCard
            tone="subtle"
            label="Credit weeks"
            value={credit && credit.tier !== 'None' ? credit.activeWeeks : '—'}
            hint={
              credit && credit.tier !== 'None'
                ? `Range: ${SAVINGS_RANGES.find((r) => r.key === credit.savingsRange)?.minXlm} XLM/wk`
                : 'Earn weeks by making weekly deposits'
            }
          />
        </div>
        {vaultMineCount === 0 && !loading && (
          <EmptyState
            icon="⬡"
            title="Vault is empty"
            description="Share a Zava payment link with a client to receive your first private deposit."
            action={
              <Link href="/dashboard/deposit">
                <Button size="sm">Create payment link</Button>
              </Link>
            }
          />
        )}
      </section>

      {/* ───── Public wallet & network ───── */}
      <section className="space-y-5">
        <SectionHeader
          eyebrow="Public"
          title="Wallet balance"
          description="Funds held in your Stellar account that are visible on the public blockchain."
        />

        {loading && balances.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-6">
                <p className="text-sm text-muted">Loading…</p>
              </div>
            ))}
          </div>
        ) : balances.length === 0 ? (
          <EmptyState
            icon="◇"
            title={`Account not found on ${network ?? 'testnet'}`}
            description="Fund it with Friendbot to start using Zava on Stellar Testnet."
            action={
              <a
                href="https://laboratory.stellar.org/#account-creator?network=test"
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" variant="secondary">Fund with Friendbot ↗</Button>
              </a>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {xlm && (
              <MetricCard
                label="XLM"
                value={fmt(xlm.balance)}
                hint="Stellar Lumens · public"
              />
            )}
            {otherAssets.map((b) => (
              <MetricCard
                key={b.asset}
                label={b.asset}
                value={fmt(b.balance)}
                hint="On Stellar · public"
              />
            ))}
            <MetricCard
              label="Credit tier"
              value={credit && credit.tier !== 'None' ? TIER_LABEL[credit.tier] : 'None'}
              hint={
                credit && credit.tier !== 'None'
                  ? `Loan eligible: ${fmt(loanXlm)} XLM`
                  : 'Generate a proof to unlock'
              }
            />
          </div>
        )}

        {error && (
          <Card>
            <CardContent>
              <p className="text-sm text-danger">{error}</p>
            </CardContent>
          </Card>
        )}
      </section>

    </div>
  );
}

function FactorBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label} <span className="text-foreground/60">({weight})</span></span>
        <span className="font-mono font-semibold">{pct}/100</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SignalChip({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={
      'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ' +
      (on
        ? 'border-success/30 bg-success/5 text-foreground'
        : 'border-border bg-subtle text-muted')
    }>
      <span className={on ? 'text-success' : 'text-muted'}>{on ? '●' : '○'}</span>
      <span className="text-[11px]">{label}</span>
    </div>
  );
}
