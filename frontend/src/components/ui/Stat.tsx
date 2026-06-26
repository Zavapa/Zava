import { ReactNode } from 'react';
import { Card } from './Card';

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

export function Stat({ label, value, hint }: StatProps) {
  return (
    <Card className="px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
