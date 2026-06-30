import Link from 'next/link';
import { ReactNode } from 'react';

interface ActionCardProps {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}

export function ActionCard({ href, icon, title, description }: ActionCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-subtle"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-lg group-hover:bg-surface">
        {icon}
      </span>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted leading-relaxed">{description}</p>
      </div>
      <span className="text-muted transition-transform group-hover:translate-x-1">→</span>
    </Link>
  );
}
