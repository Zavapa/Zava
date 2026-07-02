'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from './WalletProvider';

const TITLES: Array<{ match: (p: string) => boolean; eyebrow: string; title: string }> = [
  { match: (p) => p === '/dashboard', eyebrow: 'Dashboard', title: 'Overview' },
  { match: (p) => p.startsWith('/dashboard/plans/new'), eyebrow: 'Dashboard', title: 'New savings plan' },
  { match: (p) => p.startsWith('/dashboard/plans/'), eyebrow: 'Dashboard', title: 'Plan detail' },
  { match: (p) => p.startsWith('/dashboard/plans'), eyebrow: 'Dashboard', title: 'Savings plans' },
  { match: (p) => p.startsWith('/dashboard/plan'), eyebrow: 'Dashboard', title: 'Plan' },
  { match: (p) => p.startsWith('/dashboard/deposit'), eyebrow: 'Dashboard', title: 'Receive payment' },
  { match: (p) => p.startsWith('/dashboard/send'), eyebrow: 'Dashboard', title: 'Send payment' },
  { match: (p) => p.startsWith('/dashboard/withdraw'), eyebrow: 'Dashboard', title: 'Withdraw' },
  { match: (p) => p.startsWith('/dashboard/credit'), eyebrow: 'Dashboard', title: 'Credit proofs' },
  { match: (p) => p.startsWith('/dashboard/savings'), eyebrow: 'Dashboard', title: 'Vault' },
];

function resolveTitle(pathname: string) {
  const hit = TITLES.find((t) => t.match(pathname));
  return hit ?? { eyebrow: 'Dashboard', title: 'Zava' };
}

interface TopBarProps {
  onMenuClick: () => void;
}

export function DashboardTopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const { network } = useWallet();
  const { eyebrow, title } = resolveTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted transition-colors hover:bg-subtle hover:text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <path
            d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {eyebrow}
        </p>
        <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          Stellar {network ?? 'testnet'}
        </span>
        <Link
          href="/"
          className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-foreground sm:inline-flex"
        >
          <span aria-hidden>←</span> Landing
        </Link>
      </div>
    </header>
  );
}
