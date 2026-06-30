import { cn } from '@/lib/cn';

interface LogoProps {
  /** icon = mark only · default = mark + wordmark */
  variant?: 'icon' | 'default';
  size?: number;
  className?: string;
  /** Use on dark backgrounds — inverts the wordmark text */
  light?: boolean;
}

export function ZavaLogo({ variant = 'default', size = 36, className, light }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <ZavaMark size={size} />
      {variant === 'default' && (
        <span
          style={{ fontSize: size * 0.55, lineHeight: 1 }}
          className={cn(
            'font-bold tracking-tight select-none',
            light ? 'text-white' : 'text-foreground',
          )}
        >
          zava
        </span>
      )}
    </div>
  );
}

export function ZavaMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="Zava"
      role="img"
    >
      {/* Rounded square background */}
      <rect width="40" height="40" rx="9" fill="#0f172a" />

      {/* Bold geometric Z */}
      <path
        d="M10.5 13H29.5L10.5 27H29.5"
        stroke="white"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Accent dot at the ZK proof intersection */}
      <circle cx="20" cy="20" r="2.2" fill="#15803d" />
    </svg>
  );
}
