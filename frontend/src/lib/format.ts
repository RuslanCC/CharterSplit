// Деньги хранятся в минорных единицах (копейки/центы). Конвертация для отображения/ввода.

export function formatMoney(minor: number, currency = 'RUB'): string {
  const value = minor / 100;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** 12345 → '123.45'; 10000 → '100' (для префилла инпутов, обратное к parseMoney). */
export function moneyToInput(minor: number): string {
  return (minor / 100)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

/** '123.45' | '123,45' | '1 000,5' | '1,000.50' → минорные единицы; NaN при ошибке. */
export function parseMoney(input: string): number {
  let normalized = input.replace(/\s/g, '');
  // Есть и точка, и запятая — запятые считаем разделителями тысяч.
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(',', '.');
  }
  if (normalized === '') return NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value * 100);
}

/**
 * Русская форма множественного числа: plural(1,…)='участник',
 * plural(2,…)='участника', plural(5,…)='участников'.
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d > 1 && d < 5) return forms[1];
  if (d === 1) return forms[0];
  return forms[2];
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Заголовок дня для группировки списков: «Сегодня», «Вчера» или «8 июля, вт». */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
      ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

const ACTION_LABELS: Record<string, string> = {
  TRIP_CREATED: 'Поездка создана',
  TRIP_UPDATED: 'Поездка изменена',
  MEMBER_ADDED: 'Участник добавлен',
  MEMBER_UPDATED: 'Участник изменён',
  MEMBER_DEACTIVATED: 'Участник деактивирован',
  EXPENSE_CREATED: 'Расход добавлен',
  EXPENSES_IMPORTED: 'Импорт из Splitwise',
  EXPENSE_UPDATED: 'Расход изменён',
  EXPENSE_DELETED: 'Расход удалён',
  SETTLEMENT_RECORDED: 'Долг погашен',
  SETTLEMENT_DELETED: 'Погашение удалено',
  FUND_CONTRIBUTED: 'Взнос в кассу',
  FUND_PAID_OUT: 'Выплата из кассы',
  FUND_ADJUSTED: 'Корректировка кассы',
  SETTINGS_UPDATED: 'Настройки изменены',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export const SPLIT_LABELS: Record<string, string> = {
  EQUAL: 'Поровну',
  SHARES: 'По долям',
  EXACT: 'Точные суммы',
};
