'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, errorMessage } from '@/lib/api';
import { applyTelegramTheme, getWebApp, getInitDataRaw } from '@/lib/telegram';
import { useBackButton } from '@/lib/hooks';
import { BottomNav } from '@/components/nav';
import type { Session, Trip } from '@/lib/types';

interface TripContextValue {
  trip: Trip;
  userId: string;
  /** Текущий пользователь — владелец поездки (может менять trip-level настройки). */
  isOwner: boolean;
  reloadTrip: () => Promise<void>;
}

const TripCtx = React.createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const ctx = React.useContext(TripCtx);
  if (!ctx) throw new Error('useTrip must be used within AppProvider');
  return ctx;
}

type State =
  | { phase: 'loading' }
  | { phase: 'no-telegram' }
  | { phase: 'error'; message: string }
  | { phase: 'no-trip'; message: string }
  | { phase: 'ready'; trip: Trip; userId: string };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const started = React.useRef(false);

  const bootstrap = React.useCallback(async () => {
    const wa = getWebApp();
    if (!getInitDataRaw()) {
      setState({ phase: 'no-telegram' });
      return;
    }

    try {
      const session = await api.post<Session>('/auth/session');
      // Ключ поездки бэкенд берёт из подписанного initData; название чата —
      // только как имя для новой поездки.
      const chatTitle = wa?.initDataUnsafe?.chat?.title;
      const trip = await api.post<Trip>('/trips/resolve', {
        title: typeof chatTitle === 'string' && chatTitle ? chatTitle : undefined,
      });
      setState({ phase: 'ready', trip, userId: session.user.id });
    } catch (e) {
      const message = errorMessage(e);
      // 409 — запуск без привязки к поездке (не через кнопку из группы).
      // Не показываем это как ошибку и не создаём пустую поездку.
      if (e instanceof ApiError && e.status === 409) {
        setState({ phase: 'no-trip', message });
        return;
      }
      setState({ phase: 'error', message });
    }
  }, []);

  React.useEffect(() => {
    const wa = getWebApp();
    if (!wa) return;
    wa.ready();
    wa.expand();
    applyTelegramTheme();
    const onTheme = () => applyTelegramTheme();
    wa.onEvent('themeChanged', onTheme);
    return () => wa.offEvent('themeChanged', onTheme);
  }, []);

  React.useEffect(() => {
    // StrictMode в dev вызывает эффект дважды — не резолвим поездку параллельно.
    if (started.current) return;
    started.current = true;
    void bootstrap();
  }, [bootstrap]);

  const tripId = state.phase === 'ready' ? state.trip.id : null;
  const reloadTrip = React.useCallback(async () => {
    if (!tripId) return;
    const trip = await api.get<Trip>(`/trips/${tripId}`);
    setState((s) => (s.phase === 'ready' ? { ...s, trip } : s));
  }, [tripId]);

  if (state.phase === 'loading') {
    return <CenterMessage title="Загрузка…" />;
  }
  if (state.phase === 'no-telegram') {
    return (
      <CenterMessage
        title="Откройте в Telegram"
        subtitle="CharterSplit работает только как Telegram Mini App. Откройте приложение через бота."
      />
    );
  }
  if (state.phase === 'no-trip') {
    return <CenterMessage title="Откройте поездку из чата" subtitle={state.message} />;
  }
  if (state.phase === 'error') {
    return <CenterMessage title="Не удалось загрузить" subtitle={state.message} />;
  }

  const isOwner =
    state.trip.members.find((m) => m.userId === state.userId)?.role === 'OWNER';

  return (
    <TripCtx.Provider
      value={{ trip: state.trip, userId: state.userId, isOwner, reloadTrip }}
    >
      <BackButtonManager />
      <div className="mx-auto flex min-h-screen max-w-lg flex-col">
        <main className="flex-1 pb-4">{children}</main>
        <BottomNav />
      </div>
    </TripCtx.Provider>
  );
}

/**
 * Нативная кнопка «назад» Telegram на всех экранах, кроме корневого «Обзора»
 * (там нижняя навигация — точка входа, а системная «назад» закрыла бы приложение).
 */
function BackButtonManager() {
  const pathname = usePathname();
  const router = useRouter();
  const isRoot = pathname === '/';
  useBackButton(() => router.back());

  React.useEffect(() => {
    const bb = getWebApp()?.BackButton;
    if (!bb) return;
    if (isRoot) bb.hide();
    else bb.show();
  }, [isRoot]);

  return null;
}

function CenterMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-8 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {subtitle && <div className="mt-2 text-sm text-hint">{subtitle}</div>}
    </div>
  );
}
