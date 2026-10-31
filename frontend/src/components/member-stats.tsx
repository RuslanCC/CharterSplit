'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { categoryColor, categoryIcon } from '@/lib/categories';
import { formatMoney } from '@/lib/format';
import type { MemberStats } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const NO_CATEGORY = 'Без категории';

// Траты по участникам: сколько потрачено на каждого (доли + чаевые) с полосой
// по категориям; по тапу — раскладка по категориям с суммами и долей в %.
export function MemberStatsCard({
  stats,
  currency,
  coveredBy,
}: {
  stats: MemberStats[];
  currency: string;
  /** memberId → имя того, кто платит за участника (семейная связь). */
  coveredBy: Record<string, string>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card>
      {stats.map((m) => {
        const expanded = open === m.memberId;
        return (
          <div key={m.memberId} className="border-b border-separator last:border-b-0">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : m.memberId)}
              aria-expanded={expanded}
              className="w-full px-4 py-3 text-left active:opacity-60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn('truncate font-medium', !m.isActive && 'text-hint')}>
                    {m.displayName}
                  </div>
                  <div className="text-xs text-hint">
                    заплатил за всех {formatMoney(m.paid, currency)}
                    {coveredBy[m.memberId] &&
                      ` · за него платит ${coveredBy[m.memberId]}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="font-semibold">
                    {formatMoney(m.consumed, currency)}
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      'text-hint transition-transform duration-200',
                      expanded && 'rotate-180',
                    )}
                  />
                </div>
              </div>
              {m.consumed > 0 && (
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-separator">
                  {m.categories.map((c) => (
                    <div
                      key={c.category ?? ''}
                      style={{
                        width: `${(c.amount / m.consumed) * 100}%`,
                        backgroundColor: categoryColor(c.category),
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
            {expanded && (
              <div className="space-y-1.5 px-4 pb-3">
                {m.categories.length === 0 && (
                  <div className="text-sm text-hint">Нет трат на участника</div>
                )}
                {m.categories.map((c) => {
                  const Icon = categoryIcon(c.category ?? '');
                  return (
                    <div
                      key={c.category ?? ''}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon
                          size={14}
                          className="shrink-0"
                          style={{ color: categoryColor(c.category) }}
                        />
                        <span className="truncate">{c.category ?? NO_CATEGORY}</span>
                      </span>
                      <span className="shrink-0">
                        {formatMoney(c.amount, currency)}
                        <span className="ml-1.5 inline-block w-9 text-right text-xs text-hint">
                          {Math.round((c.amount / m.consumed) * 100)}%
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
