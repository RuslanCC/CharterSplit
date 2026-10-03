'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { adminGet } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, plural } from '@/lib/format';
import type { AdminTripRow, AdminTripSort, AdminTripsPage } from '@/lib/types';
import { Card, CardRow } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

const PAGE = 50;

const SORTS: { value: AdminTripSort; label: string }[] = [
  { value: 'activity', label: 'По активности' },
  { value: 'created', label: 'По дате создания' },
  { value: 'spent', label: 'По сумме' },
];

export default function AdminTripsPage() {
  const [query, setQuery] = React.useState('');
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState<AdminTripSort>('activity');
  const [items, setItems] = React.useState<AdminTripRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Поиск — с небольшой задержкой, чтобы не дёргать API на каждую букву.
  React.useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = React.useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          sort,
          offset: String(offset),
          limit: String(PAGE),
        });
        if (q) params.set('q', q);
        const page = await adminGet<AdminTripsPage>(`/trips?${params}`);
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [q, sort],
  );

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка при смене поиска/сортировки
    void load(0);
  }, [load]);

  return (
    <div>
      <PageHeader title="Поездки" />
      <div className="space-y-2 px-4">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-hint"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию"
            className="pl-10"
          />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as AdminTripSort)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        {!loading && !error && (
          <div className="px-1 text-xs text-hint">
            {total} {plural(total, ['поездка', 'поездки', 'поездок'])}
          </div>
        )}
      </div>

      <div className="mt-2 px-4">
        {error && <ErrorState message={error} />}
        {items.length > 0 && (
          <Card>
            {items.map((t) => (
              <Link key={t.id} href={`/admin/trips/${t.id}`} className="block">
                <TripRow t={t} />
              </Link>
            ))}
          </Card>
        )}
        {!loading && !error && items.length === 0 && (
          <EmptyState>Поездок не найдено</EmptyState>
        )}
        {loading && <Loading />}
        {!loading && items.length < total && (
          <Button
            variant="ghost"
            block
            className="mt-2"
            onClick={() => load(items.length)}
          >
            Показать ещё
          </Button>
        )}
      </div>
    </div>
  );
}

function TripRow({ t }: { t: AdminTripRow }) {
  return (
    <CardRow className="items-start gap-3 active:opacity-60">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{t.title}</div>
        <div className="mt-0.5 truncate text-xs text-hint">
          {t.owner
            ? `${t.owner.displayName}${t.owner.username ? ` · @${t.owner.username}` : ''}`
            : 'без владельца'}
        </div>
        <div className="mt-0.5 text-xs text-hint">
          {t.members} {plural(t.members, ['участник', 'участника', 'участников'])} ·{' '}
          {t.expenseCount} {plural(t.expenseCount, ['расход', 'расхода', 'расходов'])}
        </div>
        <div className="mt-0.5 text-xs text-hint">
          создана {formatDate(t.createdAt)} · активность {formatDate(t.lastActivityAt)}
        </div>
      </div>
      <div className="shrink-0 text-right font-semibold">
        {formatMoney(t.totalSpent, t.currency)}
      </div>
    </CardRow>
  );
}
