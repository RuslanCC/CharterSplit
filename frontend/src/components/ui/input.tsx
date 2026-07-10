import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full rounded-xl bg-card px-4 py-2.5 text-[15px] text-text outline-none border border-black/10 placeholder:text-hint focus:border-link',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full rounded-xl bg-card px-4 py-2.5 text-[15px] text-text outline-none border border-black/10 focus:border-link appearance-none',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-[13px] font-medium text-hint mb-1.5', className)}
      {...props}
    />
  );
}
