import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trail?: ReactNode;
  /** Visual emphasis. `accent` = inverted dark surface for headline metric. */
  tone?: 'default' | 'accent' | 'subtle';
}

export function MetricCard({ label, value, hint, trail, tone = 'default' }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-6 flex flex-col gap-3',
        tone === 'accent' && 'border-accent bg-accent text-accent-foreground',
        tone === 'subtle' && 'border-border bg-subtle',
        tone === 'default' && 'border-border bg-surface',
      )}
    >
      <p
        className={cn(
          'text-xs font-semibold uppercase tracking-[0.18em]',
          tone === 'accent' ? 'text-white/55' : 'text-muted',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'font-mono text-3xl font-bold tracking-tight leading-none break-all',
          tone === 'accent' && 'text-white',
        )}
      >
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            'text-xs leading-relaxed',
            tone === 'accent' ? 'text-white/55' : 'text-muted',
          )}
        >
          {hint}
        </p>
      )}
      {trail && <div className="pt-1">{trail}</div>}
    </div>
  );
}
