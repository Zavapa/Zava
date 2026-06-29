'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { ScoreGauge } from '@/components/ScoreGauge';
import { useWallet } from '@/components/WalletProvider';
import {
  AssetBalance,
  CommitmentRow,
  CreditRecordOnChain,
  getAccountBalances,
  getAllVaultStats,
  getCommitmentCount,
  getCommitments,
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

  const [balances, setBalances]       = useState<AssetBalance[]>([]);
  const [poolCount, setPoolCount]     = useState<number | null>(null);
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [credit, setCredit]           = useState<CreditRecordOnChain | null>(null);
  const [vaultMineXlm, setVaultMineXlm]     = useState(0);
  const [vaultMineCount, setVaultMineCount] = useState(0);
  const [vaultTotalXlm, setVaultTotalXlm]   = useState(0);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Scan BOTH vaults' events, decrypt the ones belonging to this wallet, and
  // aggregate both pools' totals.
  const scanMyVault = useCallback(async () => {
    if (!scanKey) return;
    try {
      const [events, allStats] = await Promise.all([
        getVaultDepositEvents(),
        getAllVaultStats(),
      ]);
      let mineUsdStroops = 0n;
      let mineCount = 0;
      for (const ev of events) {
        const note = await decryptNote(ev.encryptedNote, scanKey);
        if (note) {
          mineCount += 1;
          mineUsdStroops += BigInt(toUsdStroops(note.amount, ev.asset));
        }
      }
      // Total pool is also in USD-equivalent so the comparison "your slice of pool" is fair.
      const totalUsdStroops = allStats.reduce(
        (sum, s) => sum + BigInt(toUsdStroops(Number(s.totalLocked), s.asset)),
        0n,
      );
      setVaultMineCount(mineCount);
      setVaultMineXlm(Number(mineUsdStroops) / 10_000_000);
      setVaultTotalXlm(Number(totalUsdStroops) / 10_000_000);
    } catch {
      // ignore — vault may not have events yet
    }
  }, [scanKey]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [bals, c, rows, record] = await Promise.all([
          getAccountBalances(address),
          getCommitmentCount(),
          getCommitments(0, 50),
          getCreditRecord(address),
        ]);
        if (cancelled) return;
        setBalances(bals);
        setPoolCount(c);
        setCommitments(rows);
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

  // Client-side ZCS computation — pulls plan + decrypted deposits and turns
  // them into a single 300–850 score with five factors.
  const zcs = useZcs();

  // Sharing-link state — borrower issues a one-time URL to give a lender.
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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName ?? 'You'}</h1>
          <p className="font-mono text-xs text-muted mt-0.5">
            {address.slice(0, 8)}…{address.slice(-8)} · {network ?? 'testnet'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/deposit"><Button>Receive payment</Button></Link>
          <Link href="/dashboard/withdraw"><Button variant="secondary">Withdraw</Button></Link>
        </div>
      </div>

      {/* ────────── Zava Credit Score ────────── */}
      <Card className="border-foreground/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Zava Credit Score</CardTitle>
              <CardDescription>
                A privacy-preserving FICO-like score (300–850) computed locally from your
                vault activity. Lenders only ever see this score, never your amounts.
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
            <p className="text-sm text-muted">No data yet.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
              {/* Gauge */}
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

              {/* Factor breakdown */}
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  <FactorBar label="Savings consistency"  value={zcs.report.factors.consistency}     weight="35%" />
                  <FactorBar label="Inflow capacity"       value={zcs.report.factors.inflow}          weight="25%" />
                  <FactorBar label="Withdrawal discipline" value={zcs.report.factors.withdrawal}      weight="20%" />
                  <FactorBar label="Vault tenure"          value={zcs.report.factors.tenure}          weight="10%" />
                  <FactorBar label="Diversification"       value={zcs.report.factors.diversification} weight="10%" />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
                  <SignalChip on={zcs.report.signals.meetsSavingsGoal}      label="Meets savings goal" />
                  <SignalChip on={zcs.report.signals.monthlyInflowAbove500} label="Inflow ≥ $500 / mo" />
                  <SignalChip on={zcs.report.signals.lowWithdrawalRatio}    label="Low withdrawal ratio" />
                  <SignalChip on={zcs.report.signals.tenureAbove90d}        label="Tenure > 90d" />
                  <SignalChip on={zcs.report.signals.diversifiedPayers}     label="Diversified income" />
                </div>

                {/* Sharing link */}
                <div className="rounded-md border border-border bg-subtle p-4 space-y-2">
                  <p className="text-sm font-medium">Generate a sharing link</p>
                  <p className="text-xs text-muted">
                    Send this link to a lender. It exposes your score + the five risk-factor
                    signals — nothing else. Expires after 7 days.
                  </p>
                  {shareUrl ? (
                    <div className="space-y-2">
                      <div className="rounded-md border border-border bg-surface p-2 text-xs font-mono break-all">
                        {shareUrl}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={copyShareLink}>
                          {linkCopied ? 'Copied!' : 'Copy link'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShareUrl(null)}>Clear</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" onClick={issueShareLink} disabled={issuingLink}>
                      {issuingLink ? 'Generating…' : 'Create sharing link'}
                    </Button>
                  )}
                  {shareError && <p className="text-sm text-danger">{shareError}</p>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ────────── Private Vault — your shielded funds ────────── */}
      <Card className="border-foreground/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Private vault
                <Badge tone="success">Shielded</Badge>
              </CardTitle>
              <CardDescription>
                Funds clients have paid you privately via Zava. Decrypted from on-chain
                events using your scan key — nobody else can see your balance.
              </CardDescription>
            </div>
            <Link href="/dashboard/withdraw">
              <Button>Withdraw privately</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Your shielded balance"
              value={`${fmt(vaultMineXlm)} XLM`}
              hint={`${vaultMineCount} deposit${vaultMineCount === 1 ? '' : 's'} only you can see`}
            />
            <Stat
              label="Total in vault pool"
              value={`${fmt(vaultTotalXlm)} XLM`}
              hint="Across all Zava users — provides anonymity"
            />
            <Stat
              label="Anonymity set"
              value={vaultMineCount > 0 && vaultTotalXlm > 0
                ? `1 of ${poolCount ?? '?'}`
                : '—'}
              hint="Deposits a withdrawal could be matched to"
            />
          </div>
          {vaultMineCount === 0 && (
            <p className="mt-4 text-xs text-muted">
              No private deposits yet. Share a{' '}
              <Link className="underline" href="/dashboard/deposit">payment link</Link> to receive funds privately.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ────────── Wallet balance ────────── */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Wallet balance (public)
        </p>
        {loading && balances.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted">Loading…</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : balances.length === 0 ? (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted">
                Account not found on {network ?? 'testnet'}.{' '}
                <a
                  href="https://laboratory.stellar.org/#account-creator?network=test"
                  target="_blank" rel="noreferrer" className="underline"
                >
                  Fund with Friendbot
                </a>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {xlm && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted mb-1">XLM</p>
                  <p className="text-3xl font-semibold tracking-tight">{fmt(xlm.balance)}</p>
                  <p className="text-xs text-muted mt-1">Stellar Lumens · Public</p>
                </CardContent>
              </Card>
            )}
            {otherAssets.map((b) => (
              <Card key={b.asset}>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted mb-1">{b.asset}</p>
                  <p className="text-3xl font-semibold tracking-tight">{fmt(b.balance)}</p>
                  <p className="text-xs text-muted mt-1">on Stellar · Public</p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium text-muted mb-1">Credit tier</p>
                <p className="text-3xl font-semibold tracking-tight">
                  {credit && credit.tier !== 'None' ? TIER_LABEL[credit.tier] : 'None'}
                </p>
                <p className="text-xs text-muted mt-1">
                  {credit && credit.tier !== 'None'
                    ? `Loan eligible: ${fmt(loanXlm)} XLM`
                    : 'Generate a proof to unlock'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {error && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-danger">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ────────── Network activity ────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Zava network deposits"
          value={poolCount ?? (loading ? '…' : '—')}
          hint="Total commitments recorded across all users"
        />
        <Stat
          label="Your credit"
          value={credit && credit.tier !== 'None' ? `${credit.activeWeeks} weeks` : '—'}
          hint={credit && credit.tier !== 'None'
            ? `Range: ${SAVINGS_RANGES.find((r) => r.key === credit.savingsRange)?.minXlm} XLM/wk`
            : 'Not yet claimed'}
        />
      </div>

      {/* ────────── Recent commitments (anonymous pool view) ────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Zava pool deposits</CardTitle>
          <CardDescription>
            Anonymous commitment hashes from all users — amounts hidden, identities hidden.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && commitments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Loading from Stellar…</p>
          ) : commitments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">No deposits in pool yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Commitment</th>
                  <th className="px-6 py-3 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {commitments.slice(-15).reverse().map((c, idx) => (
                  <tr key={`${c.hash}-${idx}`} className="border-b border-border/60 last:border-0">
                    <td className="px-6 py-3 font-mono text-xs text-muted">
                      {c.hash.slice(0, 20)}…{c.hash.slice(-8)}
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

function FactorBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label} <span className="text-foreground/60">({weight})</span></span>
        <span className="font-medium">{pct}/100</span>
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
      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 ' +
      (on ? 'border-border bg-surface text-foreground' : 'border-border bg-subtle text-muted')
    }>
      <span className={on ? 'text-foreground' : 'text-muted'}>{on ? '✓' : '○'}</span>
      <span className="text-[11px]">{label}</span>
    </div>
  );
}
