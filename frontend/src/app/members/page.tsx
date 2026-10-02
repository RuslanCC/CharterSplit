'use client';

import * as React from 'react';
import { UserX, UserCheck, Pencil, Check, X } from 'lucide-react';
import { useTrip } from '../providers';
import { api, errorMessage } from '@/lib/api';
import type { Member } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page';

export default function MembersPage() {
  const { trip, reloadTrip, isOwner } = useTrip();
  const [members, setMembers] = React.useState<Member[]>(trip.members);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');

  const refresh = React.useCallback(async () => {
    const list = await api.get<Member[]>(`/trips/${trip.id}/members`);
    setMembers(list);
    void reloadTrip();
  }, [trip.id, reloadTrip]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- первичная загрузка списка
    void refresh();
  }, [refresh]);

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
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(m: Member) {
    setError(null);
    try {
      if (m.isActive) {
        await api.delete(`/trips/${trip.id}/members/${m.id}`);
      } else {
        await api.patch(`/trips/${trip.id}/members/${m.id}`, { isActive: true });
      }
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function startEdit(m: Member) {
    setError(null);
    setEditingId(m.id);
    setEditName(m.displayName);
  }

  async function saveEdit(m: Member) {
    const value = editName.trim();
    if (!value || value === m.displayName) {
      setEditingId(null);
      return;
    }
    setError(null);
    try {
      // Меняем только displayName — привязка к Telegram (userId/telegramUsername) не трогается.
      await api.patch(`/trips/${trip.id}/members/${m.id}`, { displayName: value });
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function setCoveredBy(m: Member, coveredByMemberId: string | null) {
    setError(null);
    try {
      await api.patch(`/trips/${trip.id}/members/${m.id}`, { coveredByMemberId });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
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
              className="border-b border-separator px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                {editingId === m.id ? (
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(m);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    maxLength={80}
                    placeholder="Имя участника"
                    className="py-1.5"
                  />
                ) : (
                  <div className={`min-w-0 ${m.isActive ? '' : 'opacity-50'}`}>
                    <div className="truncate font-medium">{m.displayName}</div>
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
                )}
                <div className="flex shrink-0 items-center gap-3 text-hint">
                  {editingId === m.id ? (
                    <>
                      <button
                        onClick={() => void saveEdit(m)}
                        className="active:opacity-60"
                        aria-label="Сохранить имя"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="active:opacity-60"
                        aria-label="Отменить"
                      >
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(m)}
                        className="active:opacity-60"
                        aria-label="Переименовать"
                      >
                        <Pencil size={16} />
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => toggle(m)}
                          className="active:opacity-60"
                          aria-label={m.isActive ? 'Деактивировать' : 'Активировать'}
                        >
                          {m.isActive ? <UserX size={18} /> : <UserCheck size={18} />}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {m.isActive && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-hint">Расходы покрывает:</span>
                  <select
                    value={m.coveredByMemberId ?? ''}
                    onChange={(e) => setCoveredBy(m, e.target.value || null)}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1 text-xs text-text outline-none"
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
          С @ — участник по нику Telegram: когда он откроет приложение, запись привяжется
          к его аккаунту автоматически.
        </div>
        {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
      </div>
    </div>
  );
}
