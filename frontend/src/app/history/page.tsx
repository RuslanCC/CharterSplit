'use client';

import * as React from 'react';
import { useTrip } from '../providers';
import { api, errorMessage } from '@/lib/api';
import { actionLabel, formatDate, formatMoney } from '@/lib/format';
import type { HistoryItem, HistoryPage } from '@/lib/types';
import { Card, CardRow } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

const ACTIONS = [
  'EXPENSE_CREATED',
  'EXPENSE_UPDATED',
  'EXPENSE_DELETED',
  'SETTLEMENT_RECORDED',
  'SETTLEMENT_DELETED',
  'FUND_CONTRIBUTED',
  'FUND_PAID_OUT',
  'FUND_ADJUSTED',
  'MEMBER_ADDED',
  'MEMBER_UPDATED',
  'MEMBER_DEACTIVATED',
  'EXPENSES_IMPORTED',
  'TRIP_CREATED',
  'TRIP_UPDATED',
  'SETTINGS_UPDATED',
];

export default function HistoryPage() {
  const { trip } = useTrip();
  const [action, setAction] = React.useState('');
  const [memberId, setMemberId] = React.useState('');
  const [items, setItems] = React.useState<HistoryItem[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Номер последнего запроса: ответы устаревших запросов (смена фильтра во
  // время «Показать ещё») отбрасываются.
  const requestId = React.useRef(0);

  const load = React.useCallback(
    async (fromCursor: string | null) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      if (memberId) params.set('memberId', memberId);
      if (fromCursor) params.set('cursor', fromCursor);
      try {
        const page = await api.get<HistoryPage>(
          `/trips/${trip.id}/history?${params.toString()}`,
        );
        if (id !== requestId.current) return;
        setItems((prev) => (fromCursor ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setHasMore(!!page.nextCursor);
      } catch (e) {
        if (id === requestId.current) setError(errorMessage(e));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [trip.id, action, memberId],
  );

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка при смене фильтров
    void load(null);
  }, [load]);

  return (
    <div>
      <PageHeader title="История операций" />
      <div className="grid grid-cols-2 gap-2 px-4 pb-2">
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Все действия</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </Select>
        <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Все участники</option>
          {trip.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </div>

      <div className="px-4 pb-4">
        {error && <ErrorState message={error} />}
        {!error && items.length === 0 && !loading && <EmptyState>Записей нет</EmptyState>}
        {items.length > 0 && (
          <Card>
            {items.map((h) => (
              <CardRow key={h.id}>
                <div className="min-w-0">
                  <div className="font-medium">{actionLabel(h.action)}</div>
                  <div className="text-xs text-hint">
                    {formatDate(h.createdAt)}
                    {(h.actorName ?? h.actor?.firstName)
                      ? ` · ${h.actorName ?? h.actor?.firstName}`
                      : ''}
                    {h.payload?.description ? ` · ${h.payload.description}` : ''}
                  </div>
                </div>
                {typeof h.payload?.amount === 'number' && (
                  <span className="text-sm font-medium text-hint">
                    {formatMoney(h.payload.amount, trip.currency)}
                  </span>
                )}
              </CardRow>
            ))}
          </Card>
        )}
        {loading && <Loading />}
        {hasMore && !loading && (
          <Button variant="secondary" block className="mt-3" onClick={() => load(cursor)}>
            Показать ещё
          </Button>
        )}
      </div>
    </div>
  );
}
