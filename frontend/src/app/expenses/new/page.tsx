'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTrip } from '../../providers';
import { api, ApiError } from '@/lib/api';
import { parseMoney, formatMoney, SPLIT_LABELS } from '@/lib/format';
import type { SplitType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/page';
import { cn } from '@/lib/utils';

export default function NewExpensePage() {
  const { trip } = useTrip();
  const router = useRouter();
  const active = trip.members.filter((m) => m.isActive);

  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [payer, setPayer] = React.useState(active[0]?.id ?? '');
  const [fromFund, setFromFund] = React.useState(false);
  const [splitType, setSplitType] = React.useState<SplitType>(
    trip.settings?.defaultSplit ?? 'EQUAL',
  );
  const [selected, setSelected] = React.useState<Record<string, boolean>>(
    Object.fromEntries(active.map((m) => [m.id, true])),
  );
  const [units, setUnits] = React.useState<Record<string, string>>({});
  const [exact, setExact] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const amountMinor = parseMoney(amount);
  const exactSum = active
    .filter((m) => selected[m.id])
    .reduce((s, m) => s + (parseMoney(exact[m.id] ?? '') || 0), 0);

  async function submit() {
    setError(null);
    if (!description.trim()) return setError('Введите описание');
    if (!Number.isFinite(amountMinor) || amountMinor <= 0)
      return setError('Введите сумму');
    if (!payer) return setError('Выберите плательщика');

    const chosen = active.filter((m) => selected[m.id]);
    let participants: any[] | undefined;
    if (!fromFund) {
      if (chosen.length === 0) return setError('Выберите участников');
      if (splitType === 'EQUAL')
        participants = chosen.map((m) => ({ memberId: m.id }));
      else if (splitType === 'SHARES')
        participants = chosen.map((m) => ({
          memberId: m.id,
          shareUnits: Math.max(1, Number(units[m.id] ?? '1') || 1),
        }));
      else {
        participants = chosen.map((m) => ({
          memberId: m.id,
          amount: parseMoney(exact[m.id] ?? '') || 0,
        }));
        if (exactSum !== amountMinor)
          return setError('Сумма точных долей не равна сумме расхода');
      }
    }

    setSaving(true);
    try {
      await api.post(`/trips/${trip.id}/expenses`, {
        description: description.trim(),
        amount: amountMinor,
        category: category.trim() || undefined,
        paidByMemberId: payer,
        fromFund,
        splitType,
        participants,
      });
      router.push('/expenses');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Новый расход" />
      <div className="space-y-4 px-4 pb-8">
        <div>
          <Label>Описание</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Например, ужин в порту"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Сумма ({trip.currency})</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Категория</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="необязательно"
            />
          </div>
        </div>

        <div>
          <Label>Кто платил</Label>
          <Select value={payer} onChange={(e) => setPayer(e.target.value)}>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
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
                        : 'bg-card text-text border border-black/10',
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
                {active.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5 last:border-b-0"
                  >
                    <label className="flex items-center gap-3">
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
                        className="w-16 rounded-lg border border-black/10 bg-bg px-2 py-1 text-center text-sm"
                      />
                    )}
                    {selected[m.id] && splitType === 'EXACT' && (
                      <input
                        value={exact[m.id] ?? ''}
                        onChange={(e) =>
                          setExact((x) => ({ ...x, [m.id]: e.target.value }))
                        }
                        inputMode="decimal"
                        placeholder="0.00"
                        className="w-24 rounded-lg border border-black/10 bg-bg px-2 py-1 text-right text-sm"
                      />
                    )}
                  </div>
                ))}
              </Card>
              {splitType === 'EXACT' && (
                <div
                  className={cn(
                    'mt-1.5 text-xs',
                    exactSum === amountMinor ? 'text-positive' : 'text-hint',
                  )}
                >
                  Сумма долей: {formatMoney(exactSum, trip.currency)} из{' '}
                  {formatMoney(
                    Number.isFinite(amountMinor) ? amountMinor : 0,
                    trip.currency,
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}

        <Button block onClick={submit} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить расход'}
        </Button>
      </div>
    </div>
  );
}
