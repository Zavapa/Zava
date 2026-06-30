import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'outline-light';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-foreground hover:bg-accent/90 disabled:bg-accent/40',
  secondary:
    'bg-surface text-foreground border border-border hover:bg-subtle disabled:opacity-50',
  ghost:
    'bg-transparent text-foreground hover:bg-subtle disabled:opacity-50',
  danger:
    'bg-danger text-white hover:bg-danger/90 disabled:opacity-50',
  light:
    'bg-white text-[#0f172a] hover:bg-white/90 disabled:bg-white/40',
  'outline-light':
    'border-2 border-white bg-transparent text-white hover:bg-white/15 disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
});
