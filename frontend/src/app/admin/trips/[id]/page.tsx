'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { useAsync } from '@/lib/hooks';
import { adminGet } from '@/lib/admin';
import { actionLabel, formatDate, formatMoney, plural } from '@/lib/format';
import type { AdminTripReport } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

/** Отчёт по чужой поездке — только чтение. */
export default function AdminTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data, loading, error } = useAsync<AdminTripReport>(
    () => adminGet(`/trips/${id}`),
    [id],
  );

  return (
    <div>
      <PageHeader title={data?.trip.title ?? 'Поездка'} />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {data && <Report r={data} />}
    </div>
  );
}

function Report({ r }: { r: AdminTripReport }) {
  const cur = r.trip.currency;
  const money = (v: number) => formatMoney(v, cur);
  const s = r.summary;
  const active = r.members.filter((m) => m.isActive);

  return (
    <div className="px-4">
      <div className="px-1 text-xs text-hint">
        создана {formatDate(r.trip.createdAt)} · {cur}
        {r.trip.telegramChatId ? ` · чат ${r.trip.telegramChatId}` : ''}
      </div>

      <Card className="mt-2 p-4">
        <div className="text-xs text-hint">Потрачено</div>
        <div className="mt-1 text-3xl font-bold">{money(s.totalSpent)}</div>
        <div className="mt-1 text-xs text-hint">
          {s.expenseCount} {plural(s.expenseCount, ['расход', 'расхода', 'расходов'])} ·{' '}
          {s.days} {plural(s.days, ['день', 'дня', 'дней'])} · в среднем{' '}
          {money(s.avgPerDay)}
          /день
        </div>
        {(s.spentFromFund > 0 || r.fund.balance !== 0) && (
          <div className="mt-1 text-xs text-hint">
            из кассы {money(s.spentFromFund)} · остаток кассы {money(r.fund.balance)}
          </div>
        )}
      </Card>

      {s.perMember.length > 0 && (
        <>
          <SectionTitle>Кто сколько заплатил</SectionTitle>
          <Card>
            {s.perMember.map((p) => (
              <CardRow key={p.memberId}>
                <span className="truncate">{p.displayName}</span>
                <span className="font-medium">{money(p.paid)}</span>
              </CardRow>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Кто кому должен</SectionTitle>
      <Card>
        {r.transfers.length === 0 && <EmptyState>Все рассчитались</EmptyState>}
        {r.transfers.map((t) => (
          <CardRow key={`${t.fromMemberId}-${t.toMemberId}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[15px]">
                <span className="truncate text-destructive">{t.fromName}</span>
                <ArrowRight size={15} className="shrink-0 text-hint" />
                <span className="truncate text-positive">{t.toName}</span>
              </div>
              <div className="mt-0.5 font-semibold">{money(t.amount)}</div>
            </div>
          </CardRow>
        ))}
      </Card>

      <SectionTitle>
        Участники · {active.length}
        {active.length !== r.members.length
          ? ` (+${r.members.length - active.length} вышли)`
          : ''}
      </SectionTitle>
      <Card>
        {r.members.map((m) => (
          <CardRow key={m.id} className={m.isActive ? '' : 'opacity-50'}>
            <div className="min-w-0">
              <div className="truncate">
                {m.displayName}
                {m.role === 'OWNER' && (
                  <span className="ml-1.5 text-xs text-link">владелец</span>
                )}
              </div>
              <div className="truncate text-xs text-hint">
                {m.username
                  ? `@${m.username}`
                  : m.telegramUserId
                    ? `id ${m.telegramUserId}`
                    : 'гость'}
                {' · '}с {formatDate(m.joinedAt)}
              </div>
            </div>
            <span
              className={
                'shrink-0 text-sm font-medium ' +
                (m.balance < 0
                  ? 'text-destructive'
                  : m.balance > 0
                    ? 'text-positive'
                    : 'text-hint')
              }
            >
              {m.balance > 0 ? '+' : ''}
              {money(m.balance)}
            </span>
          </CardRow>
        ))}
      </Card>

      <SectionTitle>Последние расходы</SectionTitle>
      <Card>
        {r.expenses.length === 0 && <EmptyState>Расходов нет</EmptyState>}
        {r.expenses.map((e) => (
          <CardRow key={e.id} className="gap-3">
            <div className="min-w-0">
              <div className="truncate">{e.description}</div>
              <div className="truncate text-xs text-hint">
                {e.fromFund ? 'из кассы' : e.paidBy}
                {e.category ? ` · ${e.category}` : ''} · {formatDate(e.spentAt)}
              </div>
            </div>
            <span className="shrink-0 font-medium">{money(e.amount)}</span>
          </CardRow>
        ))}
      </Card>

      <SectionTitle>Последние действия</SectionTitle>
      <Card>
        {r.history.length === 0 && <EmptyState>Истории нет</EmptyState>}
        {r.history.map((h) => (
          <CardRow key={h.id} className="gap-3">
            <div className="min-w-0">
              <div className="truncate">
                {actionLabel(h.action)}
                {h.payload?.description ? `: ${h.payload.description}` : ''}
              </div>
              <div className="truncate text-xs text-hint">
                {actorName(h.actor)} · {formatDate(h.createdAt)}
              </div>
            </div>
            {typeof h.payload?.amount === 'number' && (
              <span className="shrink-0 text-sm">{money(h.payload.amount)}</span>
            )}
          </CardRow>
        ))}
      </Card>
    </div>
  );
}

function actorName(a: AdminTripReport['history'][number]['actor']): string {
  if (!a) return 'система';
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ');
  return name || (a.username ? `@${a.username}` : 'пользователь');
}
