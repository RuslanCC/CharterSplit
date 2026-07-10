// Доступ к Telegram Mini Apps SDK (telegram-web-app.js, подключается в layout).
// Единственная внешняя зависимость проекта — Telegram.

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  destructive_text_color?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: any;
  themeParams: TelegramThemeParams;
  colorScheme: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, cb: () => void) => void;
  offEvent: (event: string, cb: () => void) => void;
  MainButton: any;
  BackButton: any;
  HapticFeedback?: { impactOccurred: (style: string) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

/** Сырой initData для отправки на бэкенд (проверяется по HMAC). */
export function getInitDataRaw(): string {
  return getWebApp()?.initData ?? '';
}

/** Переносит тему Telegram в CSS-переменные. */
export function applyTelegramTheme(): void {
  const wa = getWebApp();
  if (!wa) return;
  const t = wa.themeParams || {};
  const root = document.documentElement.style;
  const map: [string, string | undefined][] = [
    ['--tg-bg', t.bg_color],
    ['--tg-text', t.text_color],
    ['--tg-hint', t.hint_color],
    ['--tg-link', t.link_color],
    ['--tg-button', t.button_color],
    ['--tg-button-text', t.button_text_color],
    ['--tg-secondary-bg', t.secondary_bg_color],
    ['--tg-section-bg', t.section_bg_color || t.bg_color],
    ['--tg-destructive', t.destructive_text_color],
  ];
  for (const [key, value] of map) {
    if (value) root.setProperty(key, value);
  }
}
