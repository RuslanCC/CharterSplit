'use client';

import * as React from 'react';
import { ApiError } from './api';
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
    setLoading(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) =>
        alive &&
        setError(e instanceof ApiError ? e.message : (e as Error).message),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

/** Есть ли под нами реальный клиент Telegram (для выбора нативного UI). */
export function useIsTelegram(): boolean {
  const [inTg, setInTg] = React.useState(false);
  React.useEffect(() => setInTg(!!getWebApp()), []);
  return inTg;
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
  const cbRef = React.useRef(opts.onClick);
  cbRef.current = opts.onClick;

  React.useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    const handler = () => cbRef.current();
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
  const cbRef = React.useRef(onBack);
  cbRef.current = onBack;

  React.useEffect(() => {
    const bb = getWebApp()?.BackButton;
    if (!bb) return;
    const handler = () => cbRef.current();
    bb.onClick(handler);
    bb.show();
    return () => {
      bb.offClick(handler);
      bb.hide();
    };
  }, []);
}
