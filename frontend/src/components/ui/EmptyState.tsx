import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-subtle/40 px-6 py-12 text-center">
      {icon && <div className="text-3xl text-muted">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-muted leading-relaxed">{description}</p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
