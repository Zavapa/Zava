'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { useWallet } from '@/components/WalletProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { address, displayName } = useWallet();

  useEffect(() => {
    // Wait 1.5s for Freighter to hydrate before deciding to bounce.
    const t = setTimeout(() => {
      if (!address || !displayName) router.replace('/');
    }, 1500);
    return () => clearTimeout(t);
  }, [address, displayName, router]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
