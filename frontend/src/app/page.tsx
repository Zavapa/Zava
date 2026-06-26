'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useWallet } from '@/components/WalletProvider';
import { api, ApiError } from '@/lib/api';

export default function LandingPage() {
  const router = useRouter();
  const {
    installed,
    address,
    network,
    connect,
    connecting,
    error: walletError,
    displayName,
    setDisplayName,
  } = useWallet();
  const [name, setName] = useState('');
  const [savingError, setSavingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (displayName) setName(displayName);
  }, [displayName]);

  useEffect(() => {
    if (address && displayName) {
      router.replace('/dashboard');
    }
  }, [address, displayName, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingError(null);
    setSaving(true);
    try {
      try {
        await api.registerUser({ wallet: address, displayName: trimmed });
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err;
      }
      setDisplayName(trimmed);
      router.replace('/dashboard');
    } catch (err) {
      setSavingError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            zava · stellar testnet
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Save privately. Prove discipline. Unlock credit.
          </h1>
          <p className="text-sm text-muted">
            A zero-knowledge savings and credit reputation system for freelancers.
          </p>
        </div>

        {!address ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect your Stellar wallet</CardTitle>
              <CardDescription>
                Zava uses Freighter to sign every transaction. Your keys never leave the
                extension.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button size="lg" className="w-full" onClick={connect} disabled={connecting}>
                {connecting ? 'Waiting for Freighter…' : 'Connect with Freighter'}
              </Button>
              {walletError && (
                <p className="text-sm text-danger">{walletError}</p>
              )}
              {!installed && (
                <p className="text-xs text-muted">
                  Don&apos;t have Freighter?{' '}
                  <a
                    href="https://freighter.app"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Install it here
                  </a>
                  .
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>One more thing</CardTitle>
              <CardDescription>
                Connected as{' '}
                <span className="font-mono text-xs">
                  {address.slice(0, 6)}…{address.slice(-6)}
                </span>{' '}
                on {network ?? 'unknown network'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <Input
                  label="Display name"
                  placeholder="e.g. Ibrahim"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  disabled={saving}
                />
                {savingError && <p className="text-sm text-danger">{savingError}</p>}
                <Button type="submit" size="lg" disabled={saving || !name.trim()}>
                  {saving ? 'Saving…' : 'Continue'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted">
          Built for Stellar Hacks · Real-World ZK
          {' · '}
          <a href="/lender" className="underline hover:text-foreground">
            Lender portal
          </a>
        </p>
      </div>
    </main>
  );
}
