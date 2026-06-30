import { ReactNode } from 'react';

interface ActivityRowProps {
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}

export function ActivityRow({ primary, secondary, meta, trailing }: ActivityRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4 last:border-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-mono text-xs text-foreground">{primary}</p>
        {secondary && (
          <p className="truncate text-xs text-muted">{secondary}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
        {meta}
        {trailing}
      </div>
    </div>
  );
}
