import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl bg-card overflow-hidden', className)}
      {...props}
    />
  );
}

export function CardRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-separator last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

export function SectionTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-4 pt-4 pb-1.5 text-xs font-medium uppercase tracking-wide text-hint',
        className,
      )}
      {...props}
    />
  );
}
