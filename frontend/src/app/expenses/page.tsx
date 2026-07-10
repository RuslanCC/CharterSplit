'use client';

import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { useTrip } from '../providers';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney, formatDate, SPLIT_LABELS } from '@/lib/format';
import type { Expense } from '@/lib/types';
import { Card, CardRow } from '@/components/ui/card';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

export default function ExpensesPage() {
  const { trip } = useTrip();
  const { data, loading, error, reload } = useAsync<Expense[]>(
    () => api.get(`/trips/${trip.id}/expenses`),
    [trip.id],
  );

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
        {data && data.length > 0 && (
          <Card>
            {data.map((e) => (
              <CardRow key={e.id}>
                <div className="min-w-0">
                  <div className="font-medium">{e.description}</div>
                  <div className="text-xs text-hint">
                    {formatDate(e.spentAt)} · {e.paidByMember?.displayName}
                    {e.fromFund
                      ? ' · из кассы'
                      : ` · ${SPLIT_LABELS[e.splitType]}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">
                    {formatMoney(e.amount, trip.currency)}
                  </span>
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
        )}
      </div>
    </div>
  );
}
