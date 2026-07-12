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

export interface TelegramMainButton {
  setText: (text: string) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

export interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

export interface TelegramHapticFeedback {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged: () => void;
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
  showConfirm?: (message: string, cb: (ok: boolean) => void) => void;
  MainButton: TelegramMainButton;
  BackButton: TelegramBackButton;
  HapticFeedback?: TelegramHapticFeedback;
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

/**
 * Подтверждение действия. В Telegram — нативный `showConfirm`, вне Telegram
 * (или в старых клиентах без него) — браузерный `confirm` как fallback.
 */
export function confirmDialog(message: string): Promise<boolean> {
  const wa = getWebApp();
  if (wa?.showConfirm) {
    return new Promise((resolve) => wa.showConfirm!(message, resolve));
  }
  return Promise.resolve(
    typeof window !== 'undefined' ? window.confirm(message) : true,
  );
}

/** Тактильный отклик (если поддерживается клиентом Telegram). */
export function haptic(
  kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error',
): void {
  const hf = getWebApp()?.HapticFeedback;
  if (!hf) return;
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      hf.notificationOccurred(kind);
    } else {
      hf.impactOccurred(kind);
    }
  } catch {
    /* клиент без хаптика — молча игнорируем */
  }
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
