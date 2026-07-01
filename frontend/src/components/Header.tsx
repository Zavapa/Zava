'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useWallet } from './WalletProvider';
import { Button } from './ui/Button';
import { ZavaLogo } from './ZavaLogo';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/plans', label: 'Plans' },
  { href: '/dashboard/deposit', label: 'Deposit' },
  { href: '/dashboard/send', label: 'Send' },
  { href: '/dashboard/withdraw', label: 'Withdraw' },
  { href: '/dashboard/credit', label: 'Credit' },
];

export function Header() {
  const pathname = usePathname();
  const { address, displayName, network, disconnect } = useWallet();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link href="/">
            <ZavaLogo size={32} />
          </Link>
          {address && (
            <nav className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-subtle text-foreground'
                        : 'text-muted hover:bg-subtle hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {address && (
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-foreground sm:inline-flex"
              title="Back to landing page"
            >
              <span aria-hidden>←</span>
              <span>Home</span>
            </Link>
          )}
          {address ? (
            <>
              <div className="hidden flex-col items-end text-right sm:flex">
                <span className="text-sm font-medium leading-tight">
                  {displayName ?? 'Unnamed'}
                </span>
                <span className="font-mono text-xs text-muted">
                  {address.slice(0, 6)}…{address.slice(-4)} · {network ?? 'unknown'}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted">testnet</span>
          )}
        </div>
      </div>
    </header>
  );
}
