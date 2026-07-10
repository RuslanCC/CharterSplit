'use client';

import { useState } from 'react';
import { ArrowRight, Check, Trash2 } from 'lucide-react';
import { useTrip } from '../providers';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney, formatDate, parseMoney } from '@/lib/format';
import type { Balances, Transfer, TripSummary } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/input';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

export default function BalancesPage() {
  const { trip, userId } = useTrip();
  const { data, loading, error, reload } = useAsync<Balances>(
    () => api.get(`/trips/${trip.id}/balances`),
    [trip.id],
  );
  const summary = useAsync<TripSummary>(
    () => api.get(`/trips/${trip.id}/summary`),
    [trip.id],
  );

  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [fromMemberId, setFromMemberId] = useState('');
  const [toMemberId, setToMemberId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const activeMembers = trip.members.filter((m) => m.isActive);

  async function settleTransfer(t: Transfer) {
    if (
      !confirm(
        `Отметить оплаченным: ${t.fromName} → ${t.toName} ${formatMoney(t.amount, trip.currency)}?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.post(`/trips/${trip.id}/settlements`, {
        fromMemberId: t.fromMemberId,
        toMemberId: t.toMemberId,
        amount: t.amount,
      });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function removeSettlement(id: string) {
    if (!confirm('Удалить погашение? Долг вернётся в расчёты.')) return;
    setBusy(true);
    try {
      await api.delete(`/trips/${trip.id}/settlements/${id}`);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function submitManual() {
    setFormError(null);
    const amount = parseMoney(amountInput);
    if (!fromMemberId || !toMemberId) {
      setFormError('Выберите должника и получателя');
      return;
    }
    if (fromMemberId === toMemberId) {
      setFormError('Должник и получатель совпадают');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Введите сумму больше нуля');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/trips/${trip.id}/settlements`, {
        fromMemberId,
        toMemberId,
        amount,
      });
      setFormOpen(false);
      setFromMemberId('');
      setToMemberId('');
      setAmountInput('');
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  const myMember = trip.members.find((m) => m.userId === userId);
  const my = myMember
    ? data?.members.find((b) => b.memberId === myMember.id)
    : undefined;
  const myCovererName =
    my && my.effectiveMemberId !== my.memberId
      ? data?.members.find((b) => b.memberId === my.effectiveMemberId)
          ?.displayName
      : undefined;

  return (
    <div>
      <PageHeader title="Взаиморасчёты" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {data && (
        <div className="px-4 pb-4">
          {my && (
            <Card className="p-4 text-center">
              <div className="text-xs text-hint">Мой баланс</div>
              {myCovererName ? (
                <div className="mt-1 text-lg font-semibold">
                  покрывает {myCovererName}
                </div>
              ) : (
                <div
                  className={
                    'mt-1 text-3xl font-bold ' +
                    (my.balance < 0
                      ? 'text-destructive'
                      : my.balance > 0
                        ? 'text-positive'
                        : '')
                  }
                >
                  {my.balance > 0 ? '+' : ''}
                  {formatMoney(my.balance, trip.currency)}
                </div>
              )}
              <div className="mt-1 text-xs text-hint">
                внёс {formatMoney(my.paid, trip.currency)} · доля{' '}
                {formatMoney(my.owed, trip.currency)}
              </div>
            </Card>
          )}

          <SectionTitle>Кто кому платит</SectionTitle>
          <Card>
            {data.transfers.length === 0 && (
              <EmptyState>Все рассчитались 🎉</EmptyState>
            )}
            {data.transfers.map((t, i) => (
              <CardRow key={i} className="gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[15px]">
                    <span className="truncate font-medium text-destructive">
                      {t.fromName}
                    </span>
                    <ArrowRight size={15} className="shrink-0 text-hint" />
                    <span className="truncate font-medium text-positive">
                      {t.toName}
                    </span>
                  </div>
                  <div className="mt-0.5 font-semibold">
                    {formatMoney(t.amount, trip.currency)}
                  </div>
                </div>
                <button
                  onClick={() => settleTransfer(t)}
                  disabled={busy}
                  aria-label="Отметить оплаченным"
                  title="Отметить оплаченным"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-positive active:opacity-60 disabled:opacity-50"
                >
                  <Check size={18} />
                </button>
              </CardRow>
            ))}
          </Card>

          <div className="mt-3">
            {formOpen ? (
              <Card className="p-4">
                <div className="mb-3 text-sm font-medium">
                  Записать погашение
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Кто заплатил (должник)</Label>
                    <Select
                      value={fromMemberId}
                      onChange={(e) => setFromMemberId(e.target.value)}
                    >
                      <option value="">—</option>
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Кто получил</Label>
                    <Select
                      value={toMemberId}
                      onChange={(e) => setToMemberId(e.target.value)}
                    >
                      <option value="">—</option>
                      {activeMembers
                        .filter((m) => m.id !== fromMemberId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                          </option>
                        ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Сумма</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                    />
                  </div>
                  {formError && (
                    <div className="text-sm text-destructive">{formError}</div>
                  )}
                  <div className="flex gap-2">
                    <Button block onClick={submitManual} disabled={busy}>
                      Сохранить
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setFormOpen(false)}
                      disabled={busy}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Button
                variant="secondary"
                block
                onClick={() => setFormOpen(true)}
              >
                Записать погашение
              </Button>
            )}
          </div>

          {data.settlements.length > 0 && (
            <>
              <SectionTitle>Погашения</SectionTitle>
              <Card>
                {data.settlements.map((s) => (
                  <CardRow key={s.id}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {s.fromName}
                        </span>
                        <ArrowRight size={14} className="shrink-0 text-hint" />
                        <span className="truncate font-medium">{s.toName}</span>
                      </div>
                      <div className="text-xs text-hint">
                        {formatDate(s.createdAt)}
                        {s.note ? ` · ${s.note}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold">
                        {formatMoney(s.amount, trip.currency)}
                      </span>
                      <button
                        onClick={() => removeSettlement(s.id)}
                        disabled={busy}
                        className="text-hint active:text-destructive"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </CardRow>
                ))}
              </Card>
            </>
          )}

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

          {summary.data && summary.data.expenseCount > 0 && (
            <>
              <SectionTitle>Итоги поездки</SectionTitle>
              <Card>
                <CardRow>
                  <span className="text-hint">Всего потрачено</span>
                  <span className="font-semibold">
                    {formatMoney(summary.data.totalSpent, trip.currency)}
                  </span>
                </CardRow>
                <CardRow>
                  <span className="text-hint">Лично</span>
                  <span>{formatMoney(summary.data.spentPersonal, trip.currency)}</span>
                </CardRow>
                <CardRow>
                  <span className="text-hint">Из кассы</span>
                  <span>{formatMoney(summary.data.spentFromFund, trip.currency)}</span>
                </CardRow>
                <CardRow>
                  <span className="text-hint">Расходов</span>
                  <span>
                    {summary.data.expenseCount} за {summary.data.days} дн.
                  </span>
                </CardRow>
                <CardRow>
                  <span className="text-hint">В среднем в день</span>
                  <span>{formatMoney(summary.data.avgPerDay, trip.currency)}</span>
                </CardRow>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
