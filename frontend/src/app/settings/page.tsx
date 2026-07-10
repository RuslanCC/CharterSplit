'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTrip } from '../providers';
import { api, ApiError } from '@/lib/api';
import type { SplitType, TripSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/page';
import { SPLIT_LABELS } from '@/lib/format';

export default function SettingsPage() {
  const { trip, reloadTrip } = useTrip();
  const [title, setTitle] = React.useState(trip.title);
  const [currency, setCurrency] = React.useState(trip.currency);
  const [defaultSplit, setDefaultSplit] = React.useState<SplitType>(
    trip.settings?.defaultSplit ?? 'EQUAL',
  );
  const [allowGuests, setAllowGuests] = React.useState(
    trip.settings?.allowGuestMembers ?? true,
  );
  const [notifyChat, setNotifyChat] = React.useState(
    trip.settings?.notifyChat ?? true,
  );
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setError(null);
    setMsg(null);
    setSaving(true);
    try {
      await api.patch(`/trips/${trip.id}`, { title: title.trim(), currency });
      await api.patch<TripSettings>(`/trips/${trip.id}/settings`, {
        defaultSplit,
        allowGuestMembers: allowGuests,
        notifyChat,
      });
      await reloadTrip();
      setMsg('Сохранено');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Настройки" />
      <div className="px-4 pb-8">
        <SectionTitle>Поездка</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Валюта</Label>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {['RUB', 'USD', 'EUR', 'GBP', 'TRY', 'THB'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <SectionTitle>По умолчанию</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Способ деления</Label>
            <Select
              value={defaultSplit}
              onChange={(e) => setDefaultSplit(e.target.value as SplitType)}
            >
              {(['EQUAL', 'SHARES', 'EXACT'] as SplitType[]).map((t) => (
                <option key={t} value={t}>
                  {SPLIT_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-card px-4 py-3">
            <span>Разрешить гостей</span>
            <input
              type="checkbox"
              checked={allowGuests}
              onChange={(e) => setAllowGuests(e.target.checked)}
              className="h-5 w-5"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-card px-4 py-3">
            <span>Уведомления в чат поездки</span>
            <input
              type="checkbox"
              checked={notifyChat}
              onChange={(e) => setNotifyChat(e.target.checked)}
              className="h-5 w-5"
            />
          </label>
        </div>

        <SectionTitle>Управление</SectionTitle>
        <Card>
          <Link href="/members">
            <CardRow>
              <span>Участники</span>
              <ChevronRight size={18} className="text-hint" />
            </CardRow>
          </Link>
          <Link href="/import">
            <CardRow>
              <span>Импорт из Splitwise</span>
              <ChevronRight size={18} className="text-hint" />
            </CardRow>
          </Link>
        </Card>

        {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        {msg && <div className="mt-3 text-sm text-positive">{msg}</div>}

        <Button block className="mt-4" onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}
