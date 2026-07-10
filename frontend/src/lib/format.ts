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
  return (minor / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** '123.45' | '123,45' → 12345 (минорные единицы). */
export function parseMoney(input: string): number {
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value * 100);
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
