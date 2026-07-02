'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useWallet } from './WalletProvider';
import { ZavaLogo } from './ZavaLogo';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  match?: (pathname: string) => boolean;
}

const iconClass = 'h-4 w-4 shrink-0';

const PRIMARY_NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    match: (p) => p === '/dashboard',
  },
  {
    href: '/dashboard/plans',
    label: 'Savings Plans',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="0.8" fill="currentColor" />
      </svg>
    ),
    match: (p) => p.startsWith('/dashboard/plan'),
  },
  {
    href: '/dashboard/deposit',
    label: 'Receive',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <path d="M10 3.5v10m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 16.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/send',
    label: 'Send',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <path d="M4.5 15.5 15.5 4.5m0 0H7m8.5 0V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/withdraw',
    label: 'Withdraw',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <path d="M10 16.5v-10m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 3.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/credit',
    label: 'Credit Proofs',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <path d="M10 2.5 3.5 5.5v4c0 4 2.8 6.9 6.5 8 3.7-1.1 6.5-4 6.5-8v-4L10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m7.5 9.7 1.8 1.8 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const SECONDARY_NAV: NavItem[] = [
  {
    href: '/dashboard/savings',
    label: 'Vault',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <rect x="2.5" y="4.5" width="15" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 8v-.5M10 13v.5M12.5 10.5H13M7 10.5h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/faq',
    label: 'Help & FAQ',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className={iconClass} aria-hidden>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.2 8.2c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8c0 1.6-1.8 1.4-1.8 3M10 13.4v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function DashboardSidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { address, displayName, network, disconnect } = useWallet();

  return (
    <>
      {/* Mobile overlay */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!open}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link href="/dashboard" onClick={onClose} className="flex items-center">
            <ZavaLogo size={30} />
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-foreground lg:hidden"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
              <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
          <NavSection label="Main" items={PRIMARY_NAV} pathname={pathname} onNavigate={onClose} />
          <NavSection label="More" items={SECONDARY_NAV} pathname={pathname} onNavigate={onClose} />
        </nav>

        {/* Wallet footer */}
        <div className="border-t border-border p-3">
          <div className="rounded-lg border border-border bg-subtle/60 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                {(displayName ?? address ?? '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">
                  {displayName ?? 'Unnamed'}
                </p>
                <p className="truncate font-mono text-[11px] text-muted">
                  {address ? `${address.slice(0, 5)}…${address.slice(-4)}` : '—'}
                </p>
              </div>
              <span className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
                {network ?? 'net'}
              </span>
            </div>
            <div className="mt-3 flex gap-1.5">
              <Link
                href="/"
                onClick={onClose}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-subtle hover:text-foreground"
                title="Back to landing"
              >
                <span aria-hidden>←</span> Home
              </Link>
              <button
                onClick={disconnect}
                className="flex flex-1 items-center justify-center rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

interface NavSectionProps {
  label: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}

function NavSection({ label, items, pathname, onNavigate }: NavSectionProps) {
  return (
    <div>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted hover:bg-subtle hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'transition-colors',
                    active ? 'text-accent-foreground' : 'text-muted group-hover:text-foreground',
                  )}
                >
                  {item.icon}
                </span>
                <span className={cn('font-medium', active && 'font-semibold')}>{item.label}</span>
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
