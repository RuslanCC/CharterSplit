'use client';

import * as React from 'react';
import { useTrip } from '../providers';
import { api, ApiError } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatMoney, formatDate, parseMoney } from '@/lib/format';
import type { FundState, FundTxnType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader, Loading, ErrorState, EmptyState } from '@/components/page';

const TXN_LABEL: Record<FundTxnType, string> = {
  CONTRIBUTION: 'Взнос',
  PAYOUT: 'Выплата',
  ADJUSTMENT: 'Корректировка',
};

export default function FundPage() {
  const { trip } = useTrip();
  const active = trip.members.filter((m) => m.isActive);
  const { data, loading, error, reload } = useAsync<FundState>(
    () => api.get(`/trips/${trip.id}/fund`),
    [trip.id],
  );

  const [mode, setMode] = React.useState<'contribute' | 'payout'>('contribute');
  const [member, setMember] = React.useState(active[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  async function submit() {
    setFormError(null);
    const minor = parseMoney(amount);
    if (!Number.isFinite(minor) || minor <= 0)
      return setFormError('Введите сумму');
    setBusy(true);
    try {
      await api.post(`/trips/${trip.id}/fund/${mode}`, {
        memberId: member || undefined,
        amount: minor,
        note: note.trim() || undefined,
      });
      setAmount('');
      setNote('');
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Судовая касса" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {data && (
        <div className="px-4 pb-4">
          <Card className="p-4 text-center">
            <div className="text-xs text-hint">Баланс кассы</div>
            <div className="mt-1 text-3xl font-bold">
              {formatMoney(data.balance, trip.currency)}
            </div>
            <div className="mt-1 text-xs text-hint">
              взносы {formatMoney(data.totals.contributions, trip.currency)} ·
              выплаты {formatMoney(data.totals.payouts, trip.currency)} · расходы{' '}
              {formatMoney(data.totals.spentFromFund, trip.currency)}
            </div>
          </Card>

          <SectionTitle>Операция</SectionTitle>
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === 'contribute' ? 'primary' : 'secondary'}
                onClick={() => setMode('contribute')}
              >
                Взнос
              </Button>
              <Button
                variant={mode === 'payout' ? 'primary' : 'secondary'}
                onClick={() => setMode('payout')}
              >
                Выплата
              </Button>
            </div>
            <div>
              <Label>Участник</Label>
              <Select value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="">— не указан —</option>
                {active.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Сумма</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Заметка</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="необязательно"
                />
              </div>
            </div>
            {formError && (
              <div className="text-sm text-destructive">{formError}</div>
            )}
            <Button block onClick={submit} disabled={busy}>
              {busy ? '…' : mode === 'contribute' ? 'Внести' : 'Выплатить'}
            </Button>
          </Card>

          <SectionTitle>Движения кассы</SectionTitle>
          <Card>
            {data.transactions.length === 0 && (
              <EmptyState>Движений пока нет</EmptyState>
            )}
            {data.transactions.map((t) => (
              <CardRow key={t.id}>
                <div>
                  <div className="font-medium">
                    {TXN_LABEL[t.type]}
                    {t.member ? ` · ${t.member.displayName}` : ''}
                  </div>
                  <div className="text-xs text-hint">
                    {formatDate(t.createdAt)}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <span
                  className={
                    'font-semibold ' +
                    (t.type === 'PAYOUT' ? 'text-destructive' : 'text-positive')
                  }
                >
                  {t.type === 'PAYOUT' ? '−' : '+'}
                  {formatMoney(t.amount, trip.currency)}
                </span>
              </CardRow>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
