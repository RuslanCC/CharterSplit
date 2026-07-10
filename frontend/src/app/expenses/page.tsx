'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTrip } from '../providers';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import {
  formatMoney,
  formatDayLabel,
  formatTime,
  SPLIT_LABELS,
} from '@/lib/format';
import type { Expense } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { CategoryBadge } from '@/components/category-badge';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

export default function ExpensesPage() {
  const { trip } = useTrip();
  const { data, loading, error, reload } = useAsync<Expense[]>(
    () => api.get(`/trips/${trip.id}/expenses`),
    [trip.id],
  );

  // Список уже отсортирован по spentAt desc — сворачиваем в группы по дням.
  const dayGroups = useMemo(() => {
    if (!data) return [];
    const groups: { key: string; label: string; subtotal: number; items: Expense[] }[] = [];
    for (const e of data) {
      const d = new Date(e.spentAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(e);
        last.subtotal += e.amount;
      } else {
        groups.push({
          key,
          label: formatDayLabel(e.spentAt),
          subtotal: e.amount,
          items: [e],
        });
      }
    }
    return groups;
  }, [data]);

  async function remove(id: string) {
    if (!confirm('Удалить расход?')) return;
    await api.delete(`/trips/${trip.id}/expenses/${id}`);
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Расходы"
        action={
          <Link href="/expenses/new" className="text-link">
            <Plus size={24} />
          </Link>
        }
      />
      <div className="px-4 pb-4">
        {loading && <Loading />}
        {error && <ErrorState message={error} />}
        {data && data.length === 0 && (
          <EmptyState>Пока нет расходов. Добавьте первый.</EmptyState>
        )}
        {dayGroups.map((g) => (
          <div key={g.key}>
            <SectionTitle className="flex items-center justify-between">
              <span>{g.label}</span>
              <span className="normal-case tracking-normal">
                {formatMoney(g.subtotal, trip.currency)}
              </span>
            </SectionTitle>
            <Card>
              {g.items.map((e) => (
                <CardRow key={e.id}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {e.description}
                      </span>
                      {e.category && <CategoryBadge category={e.category} />}
                    </div>
                    <div className="text-xs text-hint">
                      {formatTime(e.spentAt)} · {e.paidByMember?.displayName}
                      {e.fromFund
                        ? ' · из кассы'
                        : ` · ${SPLIT_LABELS[e.splitType]}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">
                      {formatMoney(e.amount, trip.currency)}
                    </span>
                    <Link
                      href={`/expenses/${e.id}/edit`}
                      className="text-hint active:text-link"
                    >
                      <Pencil size={16} />
                    </Link>
                    <button
                      onClick={() => remove(e.id)}
                      className="text-hint active:text-destructive"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </CardRow>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
