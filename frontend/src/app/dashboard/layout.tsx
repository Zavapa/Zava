'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { useWallet } from '@/components/WalletProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { address, displayName } = useWallet();

  useEffect(() => {
    // Give the wallet provider a moment to hydrate from Freighter before redirecting.
    const t = setTimeout(() => {
      if (!address || !displayName) router.replace('/');
    }, 300);
    return () => clearTimeout(t);
  }, [address, displayName, router]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
