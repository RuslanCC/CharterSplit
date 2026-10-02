'use client';

import * as React from 'react';
import { errorMessage } from './api';
import { getWebApp } from './telegram';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- перезагрузка данных при смене deps
    setLoading(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

/**
 * Есть ли под нами реальный клиент Telegram (для выбора нативного UI).
 * Скрипт telegram-web-app.js создаёт `window.Telegram.WebApp` всегда, поэтому
 * смотрим на платформу: в обычном браузере она `unknown`.
 */
export function useIsTelegram(): boolean {
  return React.useSyncExternalStore(noopSubscribe, isTelegramClient, () => false);
}

const noopSubscribe = () => () => {};

function isTelegramClient(): boolean {
  const platform = getWebApp()?.platform;
  return !!platform && platform !== 'unknown';
}

interface MainButtonOptions {
  text: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  visible?: boolean;
}

/**
 * Управляет нативной MainButton Telegram: показывает её как первичное действие
 * экрана, отражает состояния loading/disabled и снимает обработчик при размонтировании.
 * Вне Telegram — no-op (страница показывает свою обычную кнопку).
 */
export function useMainButton(opts: MainButtonOptions): void {
  const onClick = React.useEffectEvent(opts.onClick);

  React.useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    const handler = () => onClick();
    mb.onClick(handler);
    return () => {
      mb.offClick(handler);
      mb.hideProgress();
      mb.hide();
    };
  }, []);

  React.useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    mb.setText(opts.text);
    if (opts.visible === false) mb.hide();
    else mb.show();
    if (opts.disabled) mb.disable();
    else mb.enable();
    if (opts.loading) mb.showProgress();
    else mb.hideProgress();
  }, [opts.text, opts.visible, opts.disabled, opts.loading]);
}

/**
 * Показывает нативную BackButton Telegram и вызывает `onBack` при нажатии.
 * Скрывается при размонтировании. Вне Telegram — no-op.
 */
export function useBackButton(onBack: () => void): void {
  const handleBack = React.useEffectEvent(onBack);

  React.useEffect(() => {
    const bb = getWebApp()?.BackButton;
    if (!bb) return;
    const handler = () => handleBack();
    bb.onClick(handler);
    bb.show();
    return () => {
      bb.offClick(handler);
      bb.hide();
    };
  }, []);
}
