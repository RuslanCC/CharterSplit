'use client';

import { useState } from 'react';
import { ArrowRight, Check, Trash2 } from 'lucide-react';
import { useTrip } from '../providers';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney, formatDate, parseMoney } from '@/lib/format';
import { confirmDialog, haptic } from '@/lib/telegram';
import type { Balances, Transfer, TripSummary } from '@/lib/types';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/input';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';
import { MemberStatsCard } from '@/components/member-stats';
import { MemberPie, type PieGroup } from '@/components/member-pie';

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
  const [actionError, setActionError] = useState<string | null>(null);

  const activeMembers = trip.members.filter((m) => m.isActive);

  async function settleTransfer(t: Transfer) {
    if (busy) return;
    if (
      !(await confirmDialog(
        `Отметить оплаченным: ${t.fromName} → ${t.toName} ${formatMoney(t.amount, trip.currency)}?`,
      ))
    )
      return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/trips/${trip.id}/settlements`, {
        fromMemberId: t.fromMemberId,
        toMemberId: t.toMemberId,
        amount: t.amount,
      });
      haptic('success');
      reload();
    } catch (e) {
      haptic('error');
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeSettlement(id: string) {
    if (busy) return;
    if (!(await confirmDialog('Удалить перевод? Сумма вернётся в расчёты.'))) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.delete(`/trips/${trip.id}/settlements/${id}`);
      haptic('success');
      reload();
    } catch (e) {
      haptic('error');
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitManual() {
    setFormError(null);
    const amount = parseMoney(amountInput);
    if (!fromMemberId || !toMemberId) {
      setFormError('Выберите, кто отдал и кто получил деньги');
      return;
    }
    if (fromMemberId === toMemberId) {
      setFormError('Отдал и получил один и тот же участник');
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
      haptic('success');
      reload();
    } catch (e) {
      haptic('error');
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const myMember = trip.members.find((m) => m.userId === userId);
  const my = myMember ? data?.members.find((b) => b.memberId === myMember.id) : undefined;
  const myCovererName =
    my && my.effectiveMemberId !== my.memberId
      ? data?.members.find((b) => b.memberId === my.effectiveMemberId)?.displayName
      : undefined;

  // Погашения по участнику — как в балансе: на конечного покрывающего.
  const effectiveOf = (memberId: string) =>
    data?.members.find((b) => b.memberId === memberId)?.effectiveMemberId ?? memberId;
  const settled = (memberId: string) => {
    let received = 0;
    let given = 0;
    for (const s of data?.settlements ?? []) {
      if (effectiveOf(s.toMemberId) === memberId) received += s.amount;
      if (effectiveOf(s.fromMemberId) === memberId) given += s.amount;
    }
    return { received, given };
  };
  const hasSettled = (memberId: string) => {
    const { received, given } = settled(memberId);
    return received + given > 0;
  };
  const settledText = (memberId: string, received: string, given: string) => {
    const { received: r, given: g } = settled(memberId);
    return [
      r > 0 && `${received} ${formatMoney(r, trip.currency)}`,
      g > 0 && `${given} ${formatMoney(g, trip.currency)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  // Диаграмма: траты участника вместе с теми, чьи расходы он оплачивает.
  // Цвет закреплён за участником (порядок вступления), а не за местом в рейтинге.
  const pieGroups: PieGroup[] = [];
  if (data && summary.data) {
    const consumed = new Map(
      summary.data.memberStats.map((s) => [s.memberId, s.consumed]),
    );
    const leads = trip.members.filter((m) => effectiveOf(m.id) === m.id);
    leads.forEach((lead, slot) => {
      const family = trip.members.filter((m) => effectiveOf(m.id) === lead.id);
      pieGroups.push({
        key: lead.id,
        label: family.map((m) => m.displayName).join(' + '),
        amount: family.reduce((sum, m) => sum + (consumed.get(m.id) ?? 0), 0),
        slot,
      });
    });
  }

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
                  ваши расходы оплачивает {myCovererName}
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
              {!myCovererName && my.balance !== 0 && (
                <div className="text-sm text-hint">
                  {my.balance > 0 ? 'вам должны вернуть' : 'вы должны'}
                </div>
              )}
              <div className="mt-2 text-xs text-hint">
                вы оплатили {formatMoney(my.paid, trip.currency)} · ваши траты{' '}
                {formatMoney(my.owed, trip.currency)}
              </div>
              {!myCovererName && hasSettled(my.memberId) && (
                <div className="text-xs text-hint">
                  переводы: {settledText(my.memberId, 'вы получили', 'вы отдали')}
                </div>
              )}
            </Card>
          )}

          <SectionTitle>Кто кому платит</SectionTitle>
          {actionError && (
            <div className="mb-2 px-1 text-sm text-destructive">{actionError}</div>
          )}
          <Card>
            {data.transfers.length === 0 && <EmptyState>Все рассчитались 🎉</EmptyState>}
            {data.transfers.map((t) => (
              <CardRow key={`${t.fromMemberId}-${t.toMemberId}`} className="gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[15px]">
                    <span className="truncate font-medium text-destructive">
                      {t.fromName}
                    </span>
                    <ArrowRight size={15} className="shrink-0 text-hint" />
                    <span className="truncate font-medium text-positive">{t.toName}</span>
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-positive active:opacity-60 disabled:opacity-50"
                >
                  <Check size={18} />
                </button>
              </CardRow>
            ))}
          </Card>

          <div className="mt-3">
            {formOpen ? (
              <Card className="p-4">
                <div className="text-sm font-medium">Записать перевод денег</div>
                <div className="mt-0.5 mb-3 text-xs text-hint">
                  Вернули долг или дали денег в долг — запишите, кто кому передал деньги.
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Кто отдал деньги</Label>
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
                    <Label>Кто получил деньги</Label>
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
              <Button variant="secondary" block onClick={() => setFormOpen(true)}>
                Записать перевод денег (долг или возврат)
              </Button>
            )}
          </div>

          {data.settlements.length > 0 && (
            <>
              <SectionTitle>Переводы денег</SectionTitle>
              <Card>
                {data.settlements.map((s) => (
                  <CardRow key={s.id}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{s.fromName}</span>
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
              // Те, за кого платит этот участник: их траты входят в его баланс.
              const dependents = data.members.filter(
                (x) => x.effectiveMemberId === m.memberId && x.memberId !== m.memberId,
              );
              return (
                <CardRow key={m.memberId} className="gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{m.displayName}</div>
                    <div className="text-xs text-hint">
                      оплачено {formatMoney(m.paid, trip.currency)} · траты{' '}
                      {formatMoney(m.owed, trip.currency)}
                    </div>
                    {dependents.length > 0 && (
                      <div className="text-xs text-hint">
                        + траты {dependents.map((d) => d.displayName).join(', ')}:{' '}
                        {formatMoney(
                          dependents.reduce((sum, d) => sum + d.owed, 0),
                          trip.currency,
                        )}
                      </div>
                    )}
                    {!covered && hasSettled(m.memberId) && (
                      <div className="text-xs text-hint">
                        переводы: {settledText(m.memberId, 'получено', 'отдано')}
                      </div>
                    )}
                  </div>
                  {covered ? (
                    <span className="shrink-0 text-right text-xs text-hint">
                      расходы оплачивает
                      <br />
                      {covererName ?? '?'}
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
          <div className="mt-1.5 px-1 text-xs leading-relaxed text-hint">
            «Оплачено» — сколько участник оплатил чеков за всех. «Траты» — доли участника
            во всех расходах. «Переводы» — деньги, переданные напрямую: возврат долга или
            заём. Баланс = оплачено − траты (свои и тех, чьи расходы участник оплачивает)
            − получено + отдано. Плюс — участнику должны вернуть, минус — участник должен.
          </div>

          {summary.data && summary.data.memberStats.length > 0 && (
            <>
              <SectionTitle>Сколько потрачено на каждого</SectionTitle>
              <Card className="mb-3">
                <MemberPie groups={pieGroups} currency={trip.currency} />
              </Card>
              <MemberStatsCard
                stats={summary.data.memberStats}
                currency={trip.currency}
                coveredBy={Object.fromEntries(
                  data.members
                    .filter((x) => x.effectiveMemberId !== x.memberId)
                    .map((x) => [
                      x.memberId,
                      data.members.find((y) => y.memberId === x.effectiveMemberId)
                        ?.displayName ?? '?',
                    ]),
                )}
              />
              {summary.data.spentFromFund > 0 && (
                <div className="mt-1.5 px-1 text-xs text-hint">
                  Без расходов из кассы:{' '}
                  {formatMoney(summary.data.spentFromFund, trip.currency)}
                </div>
              )}
              <div className="mt-1.5 px-1 text-xs leading-relaxed text-hint">
                Крупная сумма — доли участника во всех расходах (с чаевыми), по
                категориям. Переводы денег сюда не входят.
              </div>
            </>
          )}

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
