'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Download } from 'lucide-react';
import { useTrip } from '../providers';
import { api, ApiError } from '@/lib/api';
import type { SplitType, TripSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/page';
import { SPLIT_LABELS } from '@/lib/format';
import { haptic } from '@/lib/telegram';

export default function SettingsPage() {
  const { trip, reloadTrip, isOwner } = useTrip();
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
  const [exporting, setExporting] = React.useState(false);
  const [exportMsg, setExportMsg] = React.useState<string | null>(null);

  async function exportCsv() {
    setExportMsg(null);
    setExporting(true);
    try {
      await api.post(`/trips/${trip.id}/export/send-to-chat`);
      setExportMsg('Файл отправлен в чат поездки');
    } catch (e) {
      setExportMsg(
        e instanceof ApiError ? e.message : (e as Error).message,
      );
    } finally {
      setExporting(false);
    }
  }

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
      haptic('success');
      setMsg('Сохранено');
    } catch (e) {
      haptic('error');
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Настройки" />
      <div className="px-4 pb-8">
        {!isOwner && (
          <div className="mt-2 rounded-xl bg-card px-4 py-3 text-sm text-hint">
            Настройки поездки может менять только владелец. Экспорт доступен всем.
          </div>
        )}
        <SectionTitle>Поездка</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Название</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isOwner}
            />
          </div>
          <div>
            <Label>Валюта</Label>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!isOwner}
            >
              {['RUB', 'USD', 'EUR', 'GBP', 'TRY', 'THB'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {currency !== trip.currency && (
              <div className="mt-1.5 text-xs text-destructive">
                Суммы уже внесённых расходов не пересчитываются — сменится
                только символ валюты.
              </div>
            )}
          </div>
        </div>

        <SectionTitle>По умолчанию</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Способ деления</Label>
            <Select
              value={defaultSplit}
              onChange={(e) => setDefaultSplit(e.target.value as SplitType)}
              disabled={!isOwner}
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
              disabled={!isOwner}
              className="h-5 w-5"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-card px-4 py-3">
            <span>Уведомления в чат поездки</span>
            <input
              type="checkbox"
              checked={notifyChat}
              onChange={(e) => setNotifyChat(e.target.checked)}
              disabled={!isOwner}
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
          <button onClick={exportCsv} disabled={exporting} className="w-full">
            <CardRow>
              <span>{exporting ? 'Отправка…' : 'Экспорт расходов (CSV в чат)'}</span>
              <Download size={18} className="text-hint" />
            </CardRow>
          </button>
        </Card>
        {exportMsg && <div className="mt-2 text-sm text-hint">{exportMsg}</div>}

        {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        {msg && <div className="mt-3 text-sm text-positive">{msg}</div>}

        {isOwner && (
          <Button block className="mt-4" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        )}
      </div>
    </div>
  );
}
