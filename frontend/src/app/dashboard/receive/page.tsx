"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useWallet } from "@/components/WalletProvider";
import { getCommitmentCount } from "@/lib/stellar";
import { randomFieldHex } from "@/lib/crypto";
import { api, SavingsPlan } from "@/lib/api";

type Currency = "XLM" | "USDC";

const CURRENCIES: Currency[] = ["XLM", "USDC"];

const generateNonce = randomFieldHex;

function savePaymentNonce(weekNumber: number, nonce: string) {
  localStorage.setItem(`zava.payreq.v1.week.${weekNumber}`, nonce);
}

export default function ReceivePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <ReceivePageInner />
    </Suspense>
  );
}

function ReceivePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPlanId = searchParams.get("plan");
  const { address, zavaId, scanKey, connect, connecting } = useWallet();
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [suggestedAmount, setSuggestedAmount] = useState("");
  const [weekNumber, setWeekNumber] = useState(0);
  const [plans, setPlans] = useState<SavingsPlan[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    void getCommitmentCount()
      .then(setWeekNumber)
      .catch(() => {});
  }, [address]);

  useEffect(() => {
    if (!address) return;
    void api
      .listPlans(address, false)
      .then(({ plans: list }) => {
        setPlans(list);
        setPlansLoaded(true);
        const preferred =
          (preselectedPlanId &&
            list.find((p) => p.id === preselectedPlanId)?.id) ||
          list[0]?.id ||
          "";
        setPlanId(preferred);
      })
      .catch(() => setPlansLoaded(true));
  }, [address, preselectedPlanId]);

  useEffect(() => {
    setPayLink(null);
  }, [currency]);

  async function onGenerateLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address || !zavaId || !scanKey) return;
    setError(null);
    setPayLink(null);
    setBusy(true);
    try {
      const nonce = generateNonce();
      savePaymentNonce(weekNumber, nonce);
      const params = new URLSearchParams({
        zavaId,
        scanKey,
        w: String(weekNumber),
        nonce,
        asset: currency,
      });
      if (suggestedAmount && Number(suggestedAmount) > 0) {
        params.set("a", suggestedAmount);
      }
      if (planId) {
        params.set("p", planId);
      }
      setPayLink(`${window.location.origin}/pay?${params.toString()}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!payLink) return;
    await navigator.clipboard.writeText(payLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const notConnected = !address;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-muted">Receive</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Get paid privately
        </h1>
        <p className="mt-2 text-sm text-muted">
          Generate a payment link to share with clients or friends. They choose
          the amount, and it goes directly into your shielded vault.
        </p>
      </div>

      {notConnected && (
        <Card>
          <CardContent className="pt-5 pb-5 flex items-center justify-between gap-4">
            <p className="text-sm text-muted">
              Connect your Freighter wallet to continue.
            </p>
            <Button onClick={connect} disabled={connecting} size="sm">
              {connecting ? "Connecting…" : "Connect Freighter"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted">Asset</p>
        <div className="flex gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={
                "rounded-md border px-4 py-1.5 text-sm font-medium transition-colors " +
                (currency === c
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface text-muted hover:bg-subtle")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted">Plan (optional)</p>
          <Link
            href="/dashboard/plans/new"
            className="text-xs text-muted hover:text-foreground underline"
          >
            + new plan
          </Link>
        </div>
        {!plansLoaded ? (
          <p className="text-xs text-muted">Loading plans…</p>
        ) : plans.length === 0 ? (
          <div className="rounded-md border border-border bg-subtle p-3 text-xs text-muted">
            No plans yet. Incoming payments will be recorded but won&apos;t roll
            up under a plan.{" "}
            <Link
              href="/dashboard/plans/new"
              className="text-foreground underline"
            >
              Create a plan
            </Link>{" "}
            to track streaks.
          </div>
        ) : (
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            disabled={busy || notConnected}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label ?? "Untitled"} · {p.cadence} · {p.targetRange}
              </option>
            ))}
            <option value="">— No plan (unassigned) —</option>
          </select>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate a payment link</CardTitle>
          <CardDescription>
            Share this link with anyone. They pay in <strong>{currency}</strong>{" "}
            and choose the amount — including tips. Payment goes directly into
            your vault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onGenerateLink} className="flex flex-col gap-5">
            <Input
              label={`Suggested amount (${currency}) — optional`}
              type="number"
              min={0.0000001}
              step={0.0000001}
              value={suggestedAmount}
              onChange={(e) => setSuggestedAmount(e.target.value)}
              hint="Leave blank and the payer decides the amount freely."
              disabled={busy || notConnected}
            />
            <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-1">
              <p className="font-medium text-foreground">How this works:</p>
              <p>
                A one-time payment key is generated. The payer uses it to commit
                the {currency} amount they send — your main secret stays
                private.
              </p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={busy || notConnected}>
              {busy ? "Generating…" : "Generate payment link"}
            </Button>
          </form>

          {payLink && (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium">
                Share this link with your payer:
              </p>
              <div className="rounded-md border border-border bg-subtle p-3">
                <p className="break-all font-mono text-xs text-muted">
                  {payLink}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={copyLink}>
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPayLink(null);
                    setSuggestedAmount("");
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-1">
                <p className="font-medium text-foreground">
                  The payer will see:
                </p>
                <p>
                  → Your Stellar address to send <strong>{currency}</strong> to
                </p>
                <p>
                  → An amount field
                  {suggestedAmount
                    ? ` pre-filled as ${suggestedAmount} ${currency}`
                    : ` they set freely`}
                </p>
                <p>→ A button to record the hidden commitment on-chain</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
