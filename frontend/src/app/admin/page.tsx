'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useAsync } from '@/lib/hooks';
import { adminGet } from '@/lib/admin';
import { formatDate, formatMoney, plural } from '@/lib/format';
import type { AdminNewCounts, AdminStats } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';
import { AdminActivityChart } from '@/components/admin-activity-chart';

export default function AdminStatsPage() {
  const { data, loading, error } = useAsync<AdminStats>(() => adminGet('/stats'), []);

  return (
    <div>
      <PageHeader title="Статистика" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {data && (
        <div className="px-4">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Пользователи" value={data.totals.users} />
            <Tile label="Поездки" value={data.totals.trips} />
            <Tile label="Расходы" value={data.totals.expenses} />
            <Tile label="Участия в поездках" value={data.totals.memberships} />
          </div>

          <Link href="/admin/trips" className="mt-3 block">
            <Card>
              <CardRow className="active:opacity-60">
                <span className="font-medium">Все поездки</span>
                <span className="flex items-center gap-1 text-hint">
                  {data.totals.trips}
                  <ChevronRight size={18} />
                </span>
              </CardRow>
            </Card>
          </Link>

          <SectionTitle>Новые</SectionTitle>
          <Card>
            <CardRow className="text-xs text-hint">
              <span className="flex-1" />
              <span className="w-14 text-right">24 ч</span>
              <span className="w-14 text-right">7 дн</span>
              <span className="w-14 text-right">30 дн</span>
            </CardRow>
            <NewRow label="Пользователи" c={data.new.users} />
            <NewRow label="Поездки" c={data.new.trips} />
            <NewRow label="Расходы" c={data.new.expenses} />
          </Card>

          <SectionTitle>Активность</SectionTitle>
          <Card>
            <CardRow className="text-xs text-hint">
              <span className="flex-1" />
              <span className="w-14 text-right">7 дн</span>
              <span className="w-14 text-right">30 дн</span>
            </CardRow>
            <CardRow>
              <span className="flex-1">Активные поездки</span>
              <span className="w-14 text-right font-medium">{data.active.d7.trips}</span>
              <span className="w-14 text-right font-medium">{data.active.d30.trips}</span>
            </CardRow>
            <CardRow>
              <span className="flex-1">Активные пользователи</span>
              <span className="w-14 text-right font-medium">{data.active.d7.users}</span>
              <span className="w-14 text-right font-medium">{data.active.d30.users}</span>
            </CardRow>
          </Card>
          <Card className="mt-2 p-4">
            <div className="mb-2 text-xs text-hint">
              Операции по дням за 30 дней (UTC)
            </div>
            <AdminActivityChart daily={data.daily} />
          </Card>

          <SectionTitle>Сумма расходов по валютам</SectionTitle>
          <Card>
            {data.spentByCurrency.length === 0 && (
              <EmptyState>Расходов пока нет</EmptyState>
            )}
            {data.spentByCurrency.map((c) => (
              <CardRow key={c.currency}>
                <div>
                  <div className="font-medium">{formatMoney(c.total, c.currency)}</div>
                  <div className="text-xs text-hint">
                    {c.expenses} {plural(c.expenses, ['расход', 'расхода', 'расходов'])} ·{' '}
                    {c.trips} {plural(c.trips, ['поездка', 'поездки', 'поездок'])}
                  </div>
                </div>
                <span className="text-sm text-hint">{c.currency}</span>
              </CardRow>
            ))}
          </Card>

          <div className="mt-4 text-center text-xs text-hint">
            Обновлено {formatDate(data.generatedAt)}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold">{value.toLocaleString('ru-RU')}</div>
      <div className="mt-0.5 text-xs text-hint">{label}</div>
    </Card>
  );
}

function NewRow({ label, c }: { label: string; c: AdminNewCounts }) {
  return (
    <CardRow>
      <span className="flex-1">{label}</span>
      <span className="w-14 text-right font-medium">{c.d1}</span>
      <span className="w-14 text-right font-medium">{c.d7}</span>
      <span className="w-14 text-right font-medium">{c.d30}</span>
    </CardRow>
  );
}
