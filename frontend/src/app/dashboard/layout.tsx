'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { DashboardTopBar } from '@/components/DashboardTopBar';
import { useWallet } from '@/components/WalletProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { address, displayName } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Wait 1.5s for Freighter to hydrate before deciding to bounce.
    const t = setTimeout(() => {
      if (!address || !displayName) router.replace('/connect');
    }, 1500);
    return () => clearTimeout(t);
  }, [address, displayName, router]);

  // Close mobile drawer on route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-64">
        <DashboardTopBar onMenuClick={() => setMenuOpen(true)} />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
