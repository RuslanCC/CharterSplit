'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { useTrip } from '@/app/providers';
import { errorMessage } from '@/lib/api';
import { parseMoney, formatMoney, moneyToInput, SPLIT_LABELS } from '@/lib/format';
import type { Expense, SplitType } from '@/lib/types';
import { useIsTelegram, useMainButton } from '@/lib/hooks';
import { haptic } from '@/lib/telegram';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EXPENSE_CATEGORIES, categoryIcon } from '@/lib/categories';
import { cn } from '@/lib/utils';

export interface ExpensePayload {
  description: string;
  amount: number; // база (без чаевых), минорные единицы
  tipAmount?: number; // чаевые, минорные единицы
  category?: string | null;
  paidByMemberId: string;
  fromFund: boolean;
  splitType: SplitType;
  participants?: { memberId: string; shareUnits?: number; amount?: number }[];
}

interface ExpenseFormProps {
  /** Существующий расход — режим редактирования (префилл всех полей). */
  initial?: Expense;
  /** Начальное описание (например, из ?desc= при создании). */
  initialDescription?: string;
  /** Категория из кнопки быстрого добавления; вручную не выбирается. */
  initialCategory?: string;
  submitLabel?: string;
  onSubmit: (payload: ExpensePayload) => Promise<void>;
}

export function ExpenseForm({
  initial,
  initialDescription,
  initialCategory,
  submitLabel = 'Сохранить расход',
  onSubmit,
}: ExpenseFormProps) {
  const { trip, userId } = useTrip();
  // Неактивные участники показываются, если на них ссылается редактируемый расход.
  const referenced = new Set(
    initial ? [initial.paidByMemberId, ...initial.shares.map((s) => s.memberId)] : [],
  );
  const members = trip.members.filter((m) => m.isActive || referenced.has(m.id));

  // Категорию можно сменить: префилл из расхода (правка) или из кнопки (создание).
  const [category, setCategory] = React.useState<string | null>(
    initial ? initial.category : (initialCategory ?? null),
  );

  // Список для выбора: стандартные категории + текущая нестандартная (импорт).
  const categoryOptions = React.useMemo(() => {
    const opts = EXPENSE_CATEGORIES.map((c) => ({ label: c.label, Icon: c.icon }));
    if (category && !opts.some((o) => o.label === category)) {
      opts.push({ label: category, Icon: categoryIcon(category) });
    }
    return opts;
  }, [category]);

  const [description, setDescription] = React.useState(
    initial?.description ?? initialDescription ?? '',
  );
  // В форме «Сумма» — база (без чаевых): у сохранённого расхода amount = итог.
  const [amount, setAmount] = React.useState(
    initial ? moneyToInput(initial.amount - initial.tipAmount) : '',
  );
  const [tip, setTip] = React.useState(initial ? moneyToInput(initial.tipAmount) : '');
  // При создании плательщик по умолчанию — сам добавляющий (его участник),
  // а не первый по joinedAt (обычно владелец). При правке — как в расходе.
  const [payer, setPayer] = React.useState(
    initial?.paidByMemberId ??
      members.find((m) => m.userId === userId)?.id ??
      members[0]?.id ??
      '',
  );
  const [fromFund, setFromFund] = React.useState(initial?.fromFund ?? false);
  const [splitType, setSplitType] = React.useState<SplitType>(
    initial?.splitType ?? trip.settings?.defaultSplit ?? 'EQUAL',
  );
  const [selected, setSelected] = React.useState<Record<string, boolean>>(() =>
    initial && !initial.fromFund
      ? Object.fromEntries(
          members.map((m) => [m.id, initial.shares.some((s) => s.memberId === m.id)]),
        )
      : Object.fromEntries(members.map((m) => [m.id, m.isActive])),
  );
  const [units, setUnits] = React.useState<Record<string, string>>(() =>
    initial?.splitType === 'SHARES'
      ? Object.fromEntries(initial.shares.map((s) => [s.memberId, String(s.shareUnits)]))
      : {},
  );
  const [exact, setExact] = React.useState<Record<string, string[]>>(() =>
    initial?.splitType === 'EXACT'
      ? Object.fromEntries(
          initial.shares.map((s) => [s.memberId, [moneyToInput(s.amount)]]),
        )
      : {},
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const inTelegram = useIsTelegram();

  const exactAuto = splitType === 'EXACT' && !fromFund;

  const exactSubtotal = (memberId: string) =>
    (exact[memberId] ?? []).reduce((s, v) => s + (parseMoney(v) || 0), 0);
  const exactSum = members
    .filter((m) => selected[m.id])
    .reduce((s, m) => s + exactSubtotal(m.id), 0);

  const amountMinor = exactAuto ? exactSum : parseMoney(amount);
  const tipMinor = fromFund ? 0 : parseMoney(tip) || 0;

  async function submit() {
    setError(null);
    if (!description.trim()) return setError('Введите описание');
    if (!Number.isFinite(amountMinor) || amountMinor <= 0)
      return setError(exactAuto ? 'Введите суммы участников' : 'Введите сумму');
    if (!payer) return setError('Выберите плательщика');
    if (saving) return;

    const chosen = members.filter((m) => selected[m.id]);
    let participants: ExpensePayload['participants'];
    if (!fromFund) {
      if (chosen.length === 0) return setError('Выберите участников');
      if (splitType === 'EQUAL') participants = chosen.map((m) => ({ memberId: m.id }));
      else if (splitType === 'SHARES')
        participants = chosen.map((m) => ({
          memberId: m.id,
          shareUnits: Math.max(1, Number(units[m.id] ?? '1') || 1),
        }));
      else
        participants = chosen.map((m) => ({
          memberId: m.id,
          amount: exactSubtotal(m.id),
        }));
    }

    setSaving(true);
    try {
      await onSubmit({
        description: description.trim(),
        amount: amountMinor,
        tipAmount: tipMinor,
        category,
        paidByMemberId: payer,
        fromFund,
        splitType,
        participants,
      });
      haptic('success');
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  // Первичное действие — нативная MainButton Telegram (закреплена внизу экрана,
  // видна без прокрутки длинной формы). Вне Telegram показываем обычную кнопку.
  useMainButton({
    text: saving ? 'Сохранение…' : submitLabel,
    onClick: submit,
    loading: saving,
    disabled: saving,
    visible: inTelegram,
  });

  return (
    <div className="space-y-4 px-4 pb-8">
      <div>
        <Label>Категория</Label>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setCategory(label)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium',
                category === label
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-line bg-card text-text',
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium',
              category === null
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-line bg-card text-hint',
            )}
          >
            Без категории
          </button>
        </div>
      </div>
      <div>
        <Label>Описание</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например, ужин в порту"
        />
      </div>
      {exactAuto ? (
        <div>
          <Label>Сумма ({trip.currency})</Label>
          <div className="rounded-xl bg-card px-4 py-3">
            <span className="font-semibold">{formatMoney(exactSum, trip.currency)}</span>
            <span className="ml-2 text-xs text-hint">считается автоматически</span>
          </div>
        </div>
      ) : (
        <div>
          <Label>Сумма ({trip.currency})</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
      )}

      {!fromFund && (
        <div>
          <Label>Чаевые ({trip.currency})</Label>
          <Input
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
          {tipMinor > 0 && (
            <div className="mt-1.5 text-xs text-hint">
              Итого с чаевыми: {formatMoney(amountMinor + tipMinor, trip.currency)}
              {' · '}чаевые делятся поровну
            </div>
          )}
        </div>
      )}

      <div>
        <Label>Кто платил</Label>
        <Select value={payer} onChange={(e) => setPayer(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
              {m.isActive ? '' : ' · деактивирован'}
            </option>
          ))}
        </Select>
      </div>

      <label className="flex items-center gap-3 rounded-xl bg-card px-4 py-3">
        <input
          type="checkbox"
          checked={fromFund}
          onChange={(e) => setFromFund(e.target.checked)}
          className="h-5 w-5"
        />
        <span>Оплачено из судовой кассы</span>
      </label>

      {!fromFund && (
        <>
          <div>
            <Label>Способ деления</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['EQUAL', 'SHARES', 'EXACT'] as SplitType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setSplitType(t)}
                  className={cn(
                    'rounded-xl py-2 text-sm font-medium',
                    splitType === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-text border border-line',
                  )}
                >
                  {SPLIT_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Между кем делим</Label>
            <Card>
              {members.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex items-start justify-between border-b border-separator px-4 py-2.5 last:border-b-0',
                    !m.isActive && 'opacity-50',
                  )}
                >
                  <label className="flex items-center gap-3 py-1">
                    <input
                      type="checkbox"
                      checked={!!selected[m.id]}
                      onChange={(e) =>
                        setSelected((s) => ({
                          ...s,
                          [m.id]: e.target.checked,
                        }))
                      }
                      className="h-5 w-5"
                    />
                    <span>{m.displayName}</span>
                  </label>
                  {selected[m.id] && splitType === 'SHARES' && (
                    <input
                      value={units[m.id] ?? '1'}
                      onChange={(e) =>
                        setUnits((u) => ({ ...u, [m.id]: e.target.value }))
                      }
                      inputMode="numeric"
                      className="w-16 rounded-lg border border-line bg-bg px-2 py-1 text-center text-sm"
                    />
                  )}
                  {selected[m.id] && splitType === 'EXACT' && (
                    <div className="flex flex-col items-end gap-1">
                      {(exact[m.id]?.length ? exact[m.id] : ['']).map((v, i) => (
                        <input
                          key={i}
                          value={v}
                          onChange={(e) =>
                            setExact((x) => {
                              const list = [...(x[m.id]?.length ? x[m.id] : [''])];
                              list[i] = e.target.value;
                              return { ...x, [m.id]: list };
                            })
                          }
                          inputMode="decimal"
                          placeholder="0.00"
                          className="w-24 rounded-lg border border-line bg-bg px-2 py-1 text-right text-sm"
                        />
                      ))}
                      <button
                        onClick={() =>
                          setExact((x) => ({
                            ...x,
                            [m.id]: [...(x[m.id]?.length ? x[m.id] : ['']), ''],
                          }))
                        }
                        className="flex items-center gap-1 text-xs text-link"
                      >
                        <Plus size={14} /> добавить
                      </button>
                      {(exact[m.id]?.length ?? 0) > 1 && (
                        <div className="text-xs text-hint">
                          = {formatMoney(exactSubtotal(m.id), trip.currency)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </Card>
            {splitType === 'EXACT' && (
              <div className="mt-1.5 text-xs text-hint">
                Итого: {formatMoney(exactSum, trip.currency)}
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!inTelegram && (
        <Button block onClick={submit} disabled={saving}>
          {saving ? 'Сохранение…' : submitLabel}
        </Button>
      )}
    </div>
  );
}
