"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/Badge";
import { useWallet } from "@/components/WalletProvider";
import * as freighter from "@/lib/freighter";
import {
  buildAddUsdcTrustlineTx,
  getCommitmentCount,
  hasUsdcTrustline,
  submitSignedXdr,
  vaultDeposit,
} from "@/lib/stellar";
import {
  deriveCommitment,
  deriveNullifier,
  randomFieldHex,
} from "@/lib/crypto";
import { saveDeposit } from "@/lib/savingsStore";
import { encryptNote } from "@/lib/noteEncryption";
import { api, SavingsPlan } from "@/lib/api";

type Currency = "XLM" | "USDC";

const CURRENCIES: Currency[] = ["XLM", "USDC"];

export default function DepositPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPlanId = searchParams.get("plan");
  const { address, secret, scanKey, connect, connecting } = useWallet();
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [amount, setAmount] = useState("40");
  const [weekNumber, setWeekNumber] = useState(0);
  const [memo, setMemo] = useState("");
  const [plans, setPlans] = useState<SavingsPlan[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [trustlineReady, setTrustlineReady] = useState<boolean | null>(null);
  const [establishingTrustline, setEstablishingTrustline] = useState(false);

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
    if (!address) return;
    if (currency === "XLM") {
      setTrustlineReady(true);
      return;
    }
    setTrustlineReady(null);
    void hasUsdcTrustline(address)
      .then((ok) => setTrustlineReady(ok))
      .catch(() => setTrustlineReady(false));
  }, [address, currency]);

  async function establishTrustline() {
    if (!address) return;
    setError(null);
    setEstablishingTrustline(true);
    try {
      const xdr = await buildAddUsdcTrustlineTx(address);
      const signed = await freighter.signTransaction(xdr, {
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
        accountToSign: address,
      });
      await submitSignedXdr(signed);
      const ok = await hasUsdcTrustline(address);
      setTrustlineReady(ok);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstablishingTrustline(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address || !secret || !scanKey) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const amountStroops = BigInt(Math.floor(Number(amount) * 10_000_000));
      if (amountStroops <= 0n)
        throw new Error(`Enter a positive amount in ${currency}.`);

      const nonce = randomFieldHex();
      const commitment = await deriveCommitment(nonce, Number(amountStroops));
      const nullifier = await deriveNullifier(nonce, weekNumber);

      const encryptedNote = await encryptNote(
        {
          amount: Number(amountStroops),
          nonce,
          week: weekNumber,
          asset: currency,
          planId: planId || undefined,
          memo: memo.trim() || undefined,
        },
        scanKey,
      );

      const { hash, leafIndex } = await vaultDeposit({
        depositor: address,
        asset: currency,
        commitment,
        nullifier,
        amountStroops,
        encryptedNote,
      });

      saveDeposit(address, {
        week: weekNumber,
        timestamp: Math.floor(Date.now() / 1000),
        asset: currency,
        txHash: hash,
      });
      setSuccess(
        `Deposited into vault · leaf #${leafIndex} · tx ${hash.slice(0, 10)}…`,
      );
      const returnTo = planId ? `/dashboard/plans/${planId}` : "/dashboard";
      setTimeout(() => router.push(returnTo), 1800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const notConnected = !address;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-muted">Deposit</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Deposit from your wallet
        </h1>
        <p className="mt-2 text-sm text-muted">
          Transfer {currency} from your connected wallet into the Zava shielded
          vault. Only you can withdraw it later.
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
            You have no plans yet. Deposits will be recorded but won&apos;t roll
            up under a plan.{" "}
            <Link
              href="/dashboard/plans/new"
              className="text-foreground underline"
            >
              Create a plan first
            </Link>{" "}
            to get streak tracking.
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
          <CardTitle>Deposit to your shielded vault</CardTitle>
          <CardDescription>
            Your {currency} moves into the ZavaVault under a hidden commitment.
            The amount is encrypted on-chain; only your wallet can withdraw it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Input
              label={`Amount (${currency})`}
              type="number"
              min={0.0000001}
              step={0.0000001}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint={`Locked into the ${currency} vault as a hidden commitment you own.`}
              required
              disabled={busy || notConnected}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Private note (optional)
              </label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value.slice(0, 256))}
                placeholder="e.g. March emergency fund top-up"
                rows={2}
                maxLength={256}
                disabled={busy || notConnected}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
              />
              <p className="text-xs text-muted">
                {memo.length}/256 — encrypted with your scan key. Only you can
                read it.
              </p>
            </div>

            {currency === "USDC" &&
              trustlineReady === false &&
              !notConnected && (
                <div className="rounded-md border border-warning/40 bg-subtle p-3 space-y-2">
                  <p className="text-sm font-medium">USDC trustline required</p>
                  <p className="text-xs text-muted">
                    Your wallet needs a one-time USDC trustline before it can
                    deposit. Costs ≈ 0.5 XLM in reserves (refundable later).
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={establishTrustline}
                    disabled={establishingTrustline}
                  >
                    {establishingTrustline
                      ? "Establishing…"
                      : "Add USDC trustline"}
                  </Button>
                </div>
              )}

            <PrivacyNote currency={currency} />
            {error && <p className="text-sm text-danger">{error}</p>}
            {success && (
              <div className="flex items-center gap-2">
                <Badge tone="success">Success</Badge>
                <span className="text-sm">{success}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  notConnected ||
                  (currency === "USDC" && trustlineReady !== true)
                }
              >
                {busy
                  ? "Signing in Freighter…"
                  : `Deposit ${amount || "?"} ${currency}`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/dashboard")}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PrivacyNote({ currency }: { currency: "XLM" | "USDC" }) {
  return (
    <div className="rounded-md border border-border bg-subtle px-4 py-3 text-xs text-muted space-y-2">
      <p className="font-medium text-foreground">What actually happens:</p>
      <ul className="list-inside list-disc space-y-1">
        <li>
          Your {currency}{" "}
          <strong className="text-foreground">locks into the ZavaVault</strong>{" "}
          contract under a hidden commitment
        </li>
        <li>
          On-chain anyone can see a deposit happened — but{" "}
          <strong className="text-foreground">not the amount</strong> and not
          that it&apos;s yours
        </li>
        <li>
          An encrypted note (only your scan key can read) is stored so you can
          find this deposit later
        </li>
        <li>
          Withdraw any time from{" "}
          <strong className="text-foreground">/dashboard/withdraw</strong> using
          a ZK proof
        </li>
      </ul>
    </div>
  );
}
