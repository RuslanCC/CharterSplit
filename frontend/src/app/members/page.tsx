'use client';

import * as React from 'react';
import { UserX, UserCheck } from 'lucide-react';
import { useTrip } from '../providers';
import { api, ApiError } from '@/lib/api';
import type { Member } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page';

export default function MembersPage() {
  const { trip, reloadTrip } = useTrip();
  const [members, setMembers] = React.useState<Member[]>(trip.members);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const list = await api.get<Member[]>(`/trips/${trip.id}/members`);
    setMembers(list);
    void reloadTrip();
  }, [trip.id, reloadTrip]);

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addGuest() {
    setError(null);
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    try {
      // Ввод с @ — добавление по нику Telegram, иначе — гость по имени.
      const body = value.startsWith('@')
        ? { telegramUsername: value }
        : { displayName: value };
      await api.post(`/trips/${trip.id}/members`, body);
      setName('');
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(m: Member) {
    if (m.isActive) {
      await api.delete(`/trips/${trip.id}/members/${m.id}`);
    } else {
      await api.patch(`/trips/${trip.id}/members/${m.id}`, { isActive: true });
    }
    await refresh();
  }

  async function setCoveredBy(m: Member, coveredByMemberId: string | null) {
    setError(null);
    try {
      await api.patch(`/trips/${trip.id}/members/${m.id}`, { coveredByMemberId });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="Участники" />
      <div className="px-4 pb-4">
        <Card>
          {members.map((m) => (
            <div
              key={m.id}
              className="border-b border-black/[0.06] px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <div className={m.isActive ? '' : 'opacity-50'}>
                  <div className="font-medium">{m.displayName}</div>
                  <div className="text-xs text-hint">
                    {m.userId
                      ? `Telegram${m.user?.username ? ` · @${m.user.username}` : ''}`
                      : m.telegramUsername
                        ? `@${m.telegramUsername} · ещё не открыл приложение`
                        : 'гость'}
                    {m.role === 'OWNER' ? ' · владелец' : ''}
                    {m.isActive ? '' : ' · деактивирован'}
                  </div>
                </div>
                <button
                  onClick={() => toggle(m)}
                  className="text-hint active:opacity-60"
                >
                  {m.isActive ? <UserX size={18} /> : <UserCheck size={18} />}
                </button>
              </div>
              {m.isActive && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-hint">Расходы покрывает:</span>
                  <select
                    value={m.coveredByMemberId ?? ''}
                    onChange={(e) => setCoveredBy(m, e.target.value || null)}
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-bg px-2 py-1 text-xs text-text outline-none"
                  >
                    <option value="">— сам(а)</option>
                    {members
                      .filter((x) => x.isActive && x.id !== m.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.displayName}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </Card>
        <div className="mt-1.5 px-1 text-xs text-hint">
          Семейная связь: доли и платежи участника записываются на покрывающего
          (учитывается при импорте из Splitwise).
        </div>

        <SectionTitle className="px-0">Добавить участника</SectionTitle>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя гостя или @username"
          />
          <Button onClick={addGuest} disabled={busy}>
            Добавить
          </Button>
        </div>
        <div className="mt-1.5 px-1 text-xs text-hint">
          С @ — участник по нику Telegram: когда он откроет приложение,
          запись привяжется к его аккаунту автоматически.
        </div>
        {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
      </div>
    </div>
  );
}
