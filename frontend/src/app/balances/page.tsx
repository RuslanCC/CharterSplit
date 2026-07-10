'use client';

import { ArrowRight } from 'lucide-react';
import { useTrip } from '../providers';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney } from '@/lib/format';
import type { Balances } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

export default function BalancesPage() {
  const { trip } = useTrip();
  const { data, loading, error } = useAsync<Balances>(
    () => api.get(`/trips/${trip.id}/balances`),
    [trip.id],
  );

  return (
    <div>
      <PageHeader title="Взаиморасчёты" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {data && (
        <div className="px-4 pb-4">
          <SectionTitle>Кто кому платит</SectionTitle>
          <Card>
            {data.transfers.length === 0 && (
              <EmptyState>Все рассчитались 🎉</EmptyState>
            )}
            {data.transfers.map((t, i) => (
              <CardRow key={i}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.fromName}</span>
                  <ArrowRight size={16} className="text-hint" />
                  <span className="font-medium">{t.toName}</span>
                </div>
                <span className="font-semibold text-link">
                  {formatMoney(t.amount, trip.currency)}
                </span>
              </CardRow>
            ))}
          </Card>

          <SectionTitle>Балансы участников</SectionTitle>
          <Card>
            {data.members.map((m) => {
              const covered = m.effectiveMemberId !== m.memberId;
              const covererName = covered
                ? data.members.find((x) => x.memberId === m.effectiveMemberId)
                    ?.displayName
                : undefined;
              return (
                <CardRow key={m.memberId}>
                  <div>
                    <div className="font-medium">{m.displayName}</div>
                    <div className="text-xs text-hint">
                      внёс {formatMoney(m.paid, trip.currency)} · доля{' '}
                      {formatMoney(m.owed, trip.currency)}
                    </div>
                  </div>
                  {covered ? (
                    <span className="text-xs text-hint">
                      покрывает {covererName ?? '?'}
                    </span>
                  ) : (
                    <span
                      className={
                        'font-semibold ' +
                        (m.balance < 0
                          ? 'text-destructive'
                          : m.balance > 0
                            ? 'text-positive'
                            : 'text-hint')
                      }
                    >
                      {m.balance > 0 ? '+' : ''}
                      {formatMoney(m.balance, trip.currency)}
                    </span>
                  )}
                </CardRow>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
