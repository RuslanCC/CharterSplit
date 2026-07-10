'use client';

import * as React from 'react';
import { api, ApiError } from '@/lib/api';
import {
  applyTelegramTheme,
  getWebApp,
  getInitDataRaw,
} from '@/lib/telegram';
import { BottomNav } from '@/components/nav';
import type { Session, Trip } from '@/lib/types';

interface TripContextValue {
  trip: Trip;
  userId: string;
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
  | { phase: 'ready'; trip: Trip; userId: string };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const bootstrap = React.useCallback(async () => {
    const wa = getWebApp();
    if (wa) {
      wa.ready();
      wa.expand();
      applyTelegramTheme();
      const onTheme = () => applyTelegramTheme();
      wa.onEvent('themeChanged', onTheme);
    }

    if (!getInitDataRaw()) {
      setState({ phase: 'no-telegram' });
      return;
    }

    try {
      const session = await api.post<Session>('/auth/session');
      const { context } = session;
      const chatTitle = wa?.initDataUnsafe?.chat?.title as string | undefined;
      const trip = await api.post<Trip>('/trips/resolve', {
        telegramChatId: context.telegramChatId ?? undefined,
        chatInstance: context.chatInstance ?? undefined,
        startParam: context.startParam ?? undefined,
        title: chatTitle,
      });
      setState({ phase: 'ready', trip, userId: session.user.id });
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : (e as Error).message;
      setState({ phase: 'error', message });
    }
  }, []);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const reloadTrip = React.useCallback(async () => {
    setState((s) => {
      if (s.phase !== 'ready') return s;
      return s;
    });
    if (state.phase === 'ready') {
      const trip = await api.get<Trip>(`/trips/${state.trip.id}`);
      setState({ phase: 'ready', trip, userId: state.userId });
    }
  }, [state]);

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
  if (state.phase === 'error') {
    return (
      <CenterMessage title="Не удалось загрузить" subtitle={state.message} />
    );
  }

  return (
    <TripCtx.Provider
      value={{ trip: state.trip, userId: state.userId, reloadTrip }}
    >
      <div className="mx-auto flex min-h-screen max-w-lg flex-col">
        <main className="flex-1 pb-4">{children}</main>
        <BottomNav />
      </div>
    </TripCtx.Provider>
  );
}

function CenterMessage({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-8 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {subtitle && (
        <div className="mt-2 text-sm text-hint">{subtitle}</div>
      )}
    </div>
  );
}
