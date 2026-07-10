'use client';

import Link from 'next/link';
import {
  Settings,
  Users,
  ChevronRight,
  Anchor,
  UtensilsCrossed,
  Fuel,
  ShoppingCart,
  CarTaxiFront,
  Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTrip } from './providers';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney } from '@/lib/format';
import type { Balances, Expense } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { PageHeader, Loading, ErrorState } from '@/components/page';

const EXPENSE_PRESETS: { label: string; icon: LucideIcon; desc?: string }[] = [
  { label: 'Марина', icon: Anchor, desc: 'Марина' },
  { label: 'Ресторан', icon: UtensilsCrossed, desc: 'Ресторан' },
  { label: 'Топливо', icon: Fuel, desc: 'Топливо' },
  { label: 'Продукты', icon: ShoppingCart, desc: 'Продукты' },
  { label: 'Такси', icon: CarTaxiFront, desc: 'Такси' },
  { label: 'Другое', icon: Plus },
];

export default function OverviewPage() {
  const { trip, userId } = useTrip();
  const balances = useAsync<Balances>(
    () => api.get(`/trips/${trip.id}/balances`),
    [trip.id],
  );
  const expenses = useAsync<Expense[]>(
    () => api.get(`/trips/${trip.id}/expenses`),
    [trip.id],
  );

  const myMember = trip.members.find((m) => m.userId === userId);
  const myBalance = balances.data?.members.find(
    (m) => m.memberId === myMember?.id,
  )?.balance;

  return (
    <div>
      <PageHeader
        title={trip.title}
        action={
          <Link href="/settings" className="text-link">
            <Settings size={22} />
          </Link>
        }
      />

      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs text-hint">Ваш баланс</div>
            <div
              className={
                'mt-1 text-xl font-bold ' +
                ((myBalance ?? 0) < 0 ? 'text-destructive' : 'text-positive')
              }
            >
              {myBalance === undefined
                ? '—'
                : formatMoney(myBalance, trip.currency)}
            </div>
            <div className="mt-0.5 text-xs text-hint">
              {(myBalance ?? 0) < 0 ? 'вы должны' : 'вам должны'}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-hint">Судовая касса</div>
            <div className="mt-1 text-xl font-bold">
              {balances.data
                ? formatMoney(balances.data.fund.balance, trip.currency)
                : '—'}
            </div>
            <Link href="/fund" className="mt-0.5 block text-xs text-link">
              открыть →
            </Link>
          </Card>
        </div>
      </div>

      <SectionTitle>Добавить расход</SectionTitle>
      <div className="px-4">
        <div className="grid grid-cols-3 gap-2">
          {EXPENSE_PRESETS.map(({ label, icon: Icon, desc }) => (
            <Link
              key={label}
              href={
                desc
                  ? `/expenses/new?desc=${encodeURIComponent(desc)}`
                  : '/expenses/new'
              }
              className="flex flex-col items-center gap-1.5 rounded-xl bg-card py-3 text-sm font-medium active:opacity-70"
            >
              <Icon size={20} className="text-link" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <SectionTitle>Участники</SectionTitle>
      <div className="px-4">
        <Card>
          <Link href="/members">
            <CardRow>
              <div className="flex items-center gap-3">
                <Users size={20} className="text-hint" />
                <span>{trip.members.filter((m) => m.isActive).length} участников</span>
              </div>
              <ChevronRight size={18} className="text-hint" />
            </CardRow>
          </Link>
        </Card>
      </div>

      <SectionTitle>Последние расходы</SectionTitle>
      <div className="px-4 pb-4">
        <Card>
          {expenses.loading && <Loading />}
          {expenses.error && <ErrorState message={expenses.error} />}
          {expenses.data && expenses.data.length === 0 && (
            <CardRow>
              <span className="text-hint">Пока нет расходов</span>
            </CardRow>
          )}
          {expenses.data?.slice(0, 5).map((e) => (
            <Link key={e.id} href={`/expenses`}>
              <CardRow>
                <div>
                  <div className="font-medium">{e.description}</div>
                  <div className="text-xs text-hint">
                    {e.paidByMember?.displayName ?? ''}
                    {e.fromFund ? ' · из кассы' : ''}
                  </div>
                </div>
                <div className="font-semibold">
                  {formatMoney(e.amount, trip.currency)}
                </div>
              </CardRow>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}
