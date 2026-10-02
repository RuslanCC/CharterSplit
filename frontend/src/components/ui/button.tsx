import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground active:opacity-80',
  secondary: 'bg-card text-text border border-line active:opacity-80',
  ghost: 'bg-transparent text-link active:opacity-60',
  destructive: 'bg-destructive text-white active:opacity-80',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', block, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-medium transition disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
