import type { User } from '@prisma/client';

/** Сумма в минорных единицах → строка с валютой (для сообщений бота, экспорта). */
export function formatMoney(minor: number, currency: string): string {
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

/** Отображаемое имя пользователя Telegram. */
export function displayNameOf(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.username || `user_${user.telegramUserId}`;
}

/** Экранирует спецсимволы для parse_mode: 'HTML' в сообщениях Telegram. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
