'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Plus, X } from 'lucide-react';
import { useTrip } from '../../../providers';
import { api, errorMessage } from '@/lib/api';
import { useAsync, useIsTelegram, useMainButton } from '@/lib/hooks';
import { formatMoney, moneyToInput, parseMoney } from '@/lib/format';
import { haptic } from '@/lib/telegram';
import type { Expense, Member } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { PageHeader, Loading, ErrorState } from '@/components/page';
import { cn } from '@/lib/utils';

// «Открытый счёт» (SELF): участник вносит, сколько вышло у него (можно по
// позициям), а остаток чека делится поровну. Сюда ведёт кнопка «Внести свою
// часть» из карточки расхода в чате.
export default function ClaimSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { trip } = useTrip();
  const { data, loading, error, reload } = useAsync<Expense>(
    () => api.get(`/trips/${trip.id}/expenses/${id}`),
    [trip.id, id],
  );
  // Живёт выше формы: после сохранения форма перемонтируется с новыми данными.
  const [saved, setSaved] = React.useState(false);

  return (
    <div>
      <PageHeader title="Моя часть счёта" />
      {loading && !data && <Loading />}
      {error && <ErrorState message={error} />}
      {data &&
        (data.splitType === 'SELF' && !data.fromFund ? (
          // key: после сохранения поля заново заполняются с сервера.
          <ClaimForm
            key={data.shares.map((s) => `${s.memberId}:${s.claimed}`).join()}
            expense={data}
            reload={reload}
            saved={saved}
            setSaved={setSaved}
          />
        ) : (
          <div className="px-4 text-sm text-hint">
            В этом расходе части не вносятся по отдельности.{' '}
            <Link href={`/expenses/${id}/edit`} className="text-link">
              Открыть расход
            </Link>
          </div>
        ))}
    </div>
  );
}

/** Равная доля чаевых — тот же детерминированный остаток, что на сервере. */
function tipShares(tip: number, memberIds: string[]): Record<string, number> {
  if (tip <= 0 || memberIds.length === 0) return {};
  const base = Math.floor(tip / memberIds.length);
  const rest = tip - base * memberIds.length;
  return Object.fromEntries(memberIds.map((m, i) => [m, base + (i < rest ? 1 : 0)]));
}

function ClaimForm({
  expense,
  reload,
  saved,
  setSaved,
}: {
  expense: Expense;
  reload: () => void;
  saved: boolean;
  setSaved: (v: boolean) => void;
}) {
  const { trip, userId } = useTrip();
  const inTelegram = useIsTelegram();
  const cur = trip.currency;
  const open = expense.closedAt === null;

  const me = trip.members.find((m) => m.userId === userId);
  // Свою часть вношу за себя и за тех, чьи расходы покрываю (семейная связь).
  const editable: Member[] = me
    ? [me, ...trip.members.filter((m) => m.isActive && m.coveredByMemberId === me.id)]
    : [];
  const shareOf = (memberId: string) =>
    expense.shares.find((s) => s.memberId === memberId);

  const [items, setItems] = React.useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      editable.map((m) => {
        const c = shareOf(m.id)?.claimed;
        return [m.id, [c == null ? '' : moneyToInput(c)]];
      }),
    ),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const base = expense.amount - expense.tipAmount;
  const entered = (memberId: string): number | null => {
    const list = (items[memberId] ?? []).filter((v) => v.trim());
    if (list.length === 0) return null;
    return list.reduce((s, v) => s + (parseMoney(v) || 0), 0);
  };
  const othersClaimed = expense.shares
    .filter((s) => !editable.some((m) => m.id === s.memberId))
    .reduce((s, x) => s + (x.claimed ?? 0), 0);
  const mineClaimed = editable.reduce((s, m) => s + (entered(m.id) ?? 0), 0);
  const unclaimed = base - othersClaimed - mineClaimed;
  const claimedCount = expense.shares.filter((s) => s.claimed !== null).length;
  const tips = tipShares(
    expense.tipAmount,
    expense.shares.map((s) => s.memberId),
  );

  const changed = editable.filter(
    (m) => entered(m.id) !== (shareOf(m.id)?.claimed ?? null),
  );

  async function save() {
    setError(null);
    setSaved(false);
    if (saving) return;
    const bad = editable.some((m) =>
      (items[m.id] ?? []).some((v) => v.trim() && !(parseMoney(v) >= 0)),
    );
    if (bad) return setError('Проверьте суммы');
    if (unclaimed < 0)
      return setError(`Больше суммы чека на ${formatMoney(-unclaimed, cur)}`);
    if (changed.length === 0) return setError('Введите сумму');
    setSaving(true);
    try {
      for (const m of changed) {
        await api.put(`/trips/${trip.id}/expenses/${expense.id}/claims/${m.id}`, {
          amount: entered(m.id),
        });
      }
      haptic('success');
      setSaved(true);
      reload();
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function setClosed(closed: boolean) {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/trips/${trip.id}/expenses/${expense.id}`, { closed });
      haptic('success');
      reload();
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  useMainButton({
    text: saving ? 'Сохранение…' : 'Сохранить мою часть',
    onClick: save,
    loading: saving,
    disabled: saving,
    visible: inTelegram && open && editable.length > 0,
  });

  return (
    <div className="px-4 pb-8">
      <Card className="p-4">
        <div className="text-lg font-semibold">{expense.description}</div>
        <div className="mt-0.5 text-sm text-hint">
          Чек {formatMoney(expense.amount, cur)}
          {expense.tipAmount > 0 &&
            ` (вкл. чаевые ${formatMoney(expense.tipAmount, cur)})`}
          {' · '}оплата: {expense.paidByMember?.displayName}
        </div>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span>
            Внесли {claimedCount} из {expense.shares.length}
          </span>
          <span className={cn(unclaimed < 0 ? 'text-destructive' : 'text-hint')}>
            не распределено {formatMoney(Math.max(unclaimed, 0), cur)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-separator">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{
              width: `${base > 0 ? Math.min(100, ((base - Math.max(unclaimed, 0)) / base) * 100) : 0}%`,
            }}
          />
        </div>
        {!open && (
          <div className="mt-3 rounded-lg bg-separator/50 px-3 py-2 text-sm">
            Счёт закрыт — части больше не вносятся.
          </div>
        )}
      </Card>

      {open && editable.length === 0 && (
        <div className="mt-3 text-sm text-hint">
          Вы не участник поездки — внести часть нельзя.
        </div>
      )}

      {open &&
        editable.map((m) => {
          const list = items[m.id] ?? [''];
          const total = entered(m.id);
          const inBill = !!shareOf(m.id);
          return (
            <div key={m.id} className="mt-4">
              <Label>
                {m.id === me?.id ? 'Сколько вышло у меня' : `За ${m.displayName}`}
              </Label>
              <Card className="p-3">
                <div className="space-y-2">
                  {list.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={v}
                        onChange={(e) =>
                          setItems((x) => {
                            const next = [...(x[m.id] ?? [''])];
                            next[i] = e.target.value;
                            return { ...x, [m.id]: next };
                          })
                        }
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={list.length > 1 ? `Позиция ${i + 1}` : 'Сумма'}
                        className={cn(
                          'min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none',
                          i === 0 ? 'text-2xl font-semibold' : 'text-base',
                        )}
                      />
                      {list.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((x) => ({
                              ...x,
                              [m.id]: (x[m.id] ?? []).filter((_, j) => j !== i),
                            }))
                          }
                          aria-label="Убрать позицию"
                          className="p-1 text-hint active:text-destructive"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setItems((x) => ({ ...x, [m.id]: [...list, ''] }))}
                    className="flex items-center gap-1 text-link"
                  >
                    <Plus size={15} /> позиция
                  </button>
                  {list.length > 1 && total !== null && (
                    <span className="text-hint">= {formatMoney(total, cur)}</span>
                  )}
                </div>
              </Card>
              {!inBill && (
                <div className="mt-1.5 text-xs text-hint">
                  {m.id === me?.id ? 'Вас' : m.displayName} нет в этом счёте — после
                  сохранения добавим.
                </div>
              )}
            </div>
          );
        })}

      {open && editable.length > 0 && (
        <div className="mt-1.5 text-xs text-hint">
          Общее (вино, хлеб) не вписывайте: нераспределённый остаток и чаевые делятся
          поровну между всеми.
        </div>
      )}

      {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
      {saved && !error && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-positive">
          <Check size={16} /> Сохранено
        </div>
      )}

      {open && editable.length > 0 && !inTelegram && (
        <Button block className="mt-4" onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить мою часть'}
        </Button>
      )}

      <SectionTitle>Участники счёта</SectionTitle>
      <Card>
        {expense.shares.map((s) => {
          const name =
            trip.members.find((m) => m.id === s.memberId)?.displayName ??
            s.member?.displayName ??
            '?';
          return (
            <CardRow key={s.memberId}>
              <div className="min-w-0">
                <div className="truncate font-medium">{name}</div>
                <div className="text-xs text-hint">
                  {s.claimed === null
                    ? 'ещё не внесено'
                    : `внесено ${formatMoney(s.claimed, cur)}`}
                </div>
              </div>
              <span className={cn('font-semibold', s.claimed === null && 'text-hint')}>
                {formatMoney(s.amount + (tips[s.memberId] ?? 0), cur)}
              </span>
            </CardRow>
          );
        })}
      </Card>

      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          block
          onClick={() => setClosed(open)}
          disabled={saving}
        >
          {open ? 'Закрыть счёт' : 'Открыть счёт снова'}
        </Button>
        <Link
          href={`/expenses/${expense.id}/edit`}
          className="flex items-center rounded-xl border border-line px-4 text-sm font-medium text-link"
        >
          Изменить
        </Link>
      </div>
    </div>
  );
}
