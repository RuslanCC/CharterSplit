import { escapeHtml, formatMoney } from '../common/format';

// Тексты и чистые рендеры сообщений бота. Без зависимостей от grammy/Nest —
// легко тестировать и править копирайт в одном месте.

export const OPEN_APP_BUTTON = '🧾 Открыть CharterSplit';
export const ADD_TO_GROUP_BUTTON = '➕ Добавить в группу поездки';
export const BOARD_FOOTER = '<i>🔄 Табло обновляется автоматически</i>';

export const BOT_COMMANDS = [
  { command: 'start', description: 'Открыть CharterSplit' },
  { command: 'balance', description: 'Баланс поездки и взаиморасчёты' },
  { command: 'board', description: 'Закрепляемое табло баланса (бот обновляет)' },
  { command: 'summary', description: 'Итоги поездки' },
  { command: 'export', description: 'Выгрузить расходы в CSV' },
  { command: 'help', description: 'Справка о функционале и контакты' },
];

/** Команда админ-раздела: видна в меню только администраторам (chat-scope). */
export const ADMIN_COMMAND = { command: 'admin', description: 'Статистика бота (админ)' };
export const ADMIN_OPEN_BUTTON = '📊 Открыть статистику';
export const ADMIN_TEXT = 'Статистика использования бота и отчёты по всем поездкам.';

/** Строка «По всем вопросам…» или пустой массив, если контакт не задан. */
function supportLines(supportContact?: string): string[] {
  const contact = supportContact?.trim();
  return contact ? ['', `❓ По всем вопросам пишите ${contact}`] : [];
}

export function startPrivateText(supportContact?: string): string {
  return [
    '⛵️ CharterSplit — деление общих расходов в поездке.',
    '',
    'Приложение работает в групповом чате поездки, а не в личке.',
    '',
    'Как начать:',
    '1️⃣ Добавьте меня в группу вашей поездки — кнопкой ниже.',
    `2️⃣ В группе я пришлю кнопку «${OPEN_APP_BUTTON}» — открывайте приложение через неё.`,
    '3️⃣ Все, кто пишет в чат или открывает приложение, попадают в эту поездку автоматически.',
    ...supportLines(supportContact),
  ].join('\n');
}

/** Ответ на групповую команду, вызванную в личке. */
export const GROUP_ONLY_TEXTS: Record<string, string> = {
  balance:
    'Команда /balance работает в групповом чате поездки. ' +
    'Добавьте меня в группу и откройте приложение кнопкой оттуда.',
  board:
    'Команда /board работает в групповом чате поездки: бот пришлёт табло баланса ' +
    'и будет само обновлять его при каждом изменении. Закрепите это сообщение в чате.',
  summary:
    'Команда /summary работает в групповом чате поездки. ' +
    'Добавьте меня в группу и откройте приложение кнопкой оттуда.',
  export:
    'Команда /export работает в групповом чате поездки — файл придёт туда же. ' +
    'Добавьте меня в группу поездки.',
};

export const PRIVATE_MESSAGE_TEXT =
  'CharterSplit работает в групповом чате поездки. ' +
  'Добавьте меня в группу и открывайте приложение кнопкой оттуда — подробнее в /start.';

export const PIN_MANUALLY_TEXT =
  '📌 Закрепите сообщение выше — бот будет держать его актуальным. ' +
  'Чтобы бот закреплял сам, дайте ему право «Закреплять сообщения».';

export function groupTripReadyText(tripTitle: string): string {
  return (
    `⛵️ Поездка «<b>${escapeHtml(tripTitle)}</b>» готова!\n` +
    'Нажмите кнопку, чтобы открыть общие расходы, судовую кассу и взаиморасчёты. ' +
    'Каждый, кто напишет в чат или откроет приложение, попадёт в эту же поездку; ' +
    'остальных можно добавить по @username на экране «Участники».'
  );
}

export function helpText(isPrivate: boolean, supportContact?: string): string {
  return [
    '⛵️ CharterSplit — деление общих расходов в поездке.',
    '',
    'Что умеет бот:',
    '• Ведёт общие расходы, судовую кассу и взаиморасчёты поездки',
    '• Автоматически добавляет участников группы в поездку',
    '• Присылает балансы, итоги и выгрузку — прямо в чат',
    '',
    'Команды в групповом чате поездки:',
    '• /balance — баланс и кто кому должен',
    '• /board — закрепляемое табло баланса (бот сам его обновляет)',
    '• /summary — итоги поездки',
    '• /export — выгрузка расходов в CSV',
    '• /help или #справка — эта справка',
    '',
    isPrivate
      ? 'Приложение работает в групповом чате поездки. Добавьте меня в группу — ' +
        `там появится кнопка «${OPEN_APP_BUTTON}».`
      : `Приложение открывается кнопкой «${OPEN_APP_BUTTON}».`,
    ...supportLines(supportContact),
  ].join('\n');
}

export interface BalanceTextData {
  trip: { title: string; currency: string };
  members: { displayName: string; balance: number }[];
  transfers: { fromName: string; toName: string; amount: number }[];
  fund: { balance: number };
  totalSpent: number;
}

/** HTML-сводка балансов: расходы, касса, балансы, взаиморасчёты. */
export function renderBalanceText(data: BalanceTextData): string {
  const { trip, members, transfers, fund, totalSpent } = data;
  const fmt = (minor: number) => formatMoney(minor, trip.currency);

  const lines: string[] = [
    `⛵️ <b>${escapeHtml(trip.title)}</b>`,
    '',
    `💰 Всего расходов: <b>${fmt(totalSpent)}</b>`,
    `🏦 Касса: <b>${fmt(fund.balance)}</b>`,
  ];

  const nonZero = members.filter((m) => m.balance !== 0);
  if (nonZero.length > 0) {
    lines.push('', '<b>Балансы</b>');
    for (const m of nonZero) {
      const dot = m.balance > 0 ? '🟢' : '🔴';
      const sign = m.balance > 0 ? '+' : '';
      lines.push(`${dot} ${escapeHtml(m.displayName)}: <b>${sign}${fmt(m.balance)}</b>`);
    }
  }

  lines.push('', '<b>Взаиморасчёты</b>');
  if (transfers.length === 0) {
    lines.push('Все рассчитаны, долгов нет 🎉');
  } else {
    for (const t of transfers) {
      lines.push(
        `• ${escapeHtml(t.fromName)} → ${escapeHtml(t.toName)}: <b>${fmt(t.amount)}</b>`,
      );
    }
  }

  return lines.join('\n');
}

export interface SummaryTextData {
  trip: { title: string; currency: string };
  summary: {
    totalSpent: number;
    spentPersonal: number;
    spentFromFund: number;
    expenseCount: number;
    days: number;
    avgPerDay: number;
    perMember: { displayName: string; paid: number }[];
  };
}

/** HTML-итоги поездки: суммы, число расходов, дни, кто сколько платил. */
export function renderSummaryText({ trip, summary }: SummaryTextData): string {
  const fmt = (minor: number) => formatMoney(minor, trip.currency);

  const lines: string[] = [
    `📊 <b>Итоги «${escapeHtml(trip.title)}»</b>`,
    '',
    `💰 Всего потрачено: <b>${fmt(summary.totalSpent)}</b>`,
    `👤 Лично: ${fmt(summary.spentPersonal)}`,
    `🏦 Из кассы: ${fmt(summary.spentFromFund)}`,
    `🧾 Расходов: ${summary.expenseCount} за ${summary.days} дн.`,
    `📈 В среднем: ${fmt(summary.avgPerDay)} в день`,
  ];

  if (summary.perMember.length > 0) {
    lines.push('', '<b>Кто сколько платил</b>');
    for (const m of summary.perMember) {
      lines.push(`• ${escapeHtml(m.displayName)}: <b>${fmt(m.paid)}</b>`);
    }
  }

  return lines.join('\n');
}
