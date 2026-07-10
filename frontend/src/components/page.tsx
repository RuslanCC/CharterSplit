import * as React from 'react';

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <h1 className="text-[22px] font-bold">{title}</h1>
      {action}
    </div>
  );
}

export function Loading() {
  return <div className="px-4 py-10 text-center text-hint">Загрузка…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-4 py-10 text-center text-destructive">{message}</div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-hint">{children}</div>;
}
