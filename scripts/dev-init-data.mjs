#!/usr/bin/env node
// Открыть Mini App в обычном браузере при локальной разработке.
//
// Генерирует initData, подписанный тем же TELEGRAM_BOT_TOKEN, что и у локального
// backend, и печатает URL с ним в hash (#tgWebAppData=…) — так его передаёт сам
// Telegram, и telegram-web-app.js подхватывает его как настоящий запуск.
//
//   TELEGRAM_BOT_TOKEN=123:dev node scripts/dev-init-data.mjs [--dark] [--url http://localhost:3000]
//
// По умолчанию — владелец и чат демо-поездки из `npm run seed:demo`.
// Переопределить: DEV_USER_ID, DEV_CHAT_ID, DEV_FIRST_NAME.
// Только для разработки: с настоящим токеном такой URL — рабочий вход в приложение.
import { createHmac } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Задайте TELEGRAM_BOT_TOKEN — тот же, что у локального backend.');
  process.exit(1);
}

const userId = Number(process.env.DEV_USER_ID ?? 100001);
const chatId = process.env.DEV_CHAT_ID ?? '-1001234567890';
const appUrl = option('--url', 'http://localhost:3000').replace(/\/$/, '');

const fields = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  chat_instance: '-8000000000000000001',
  chat_type: 'supergroup',
  start_param: `c${chatId}`,
  user: JSON.stringify({
    id: userId,
    first_name: process.env.DEV_FIRST_NAME ?? 'Алексей',
    last_name: 'Морской',
    username: 'captain_alex',
    language_code: 'ru',
  }),
};

// Алгоритм проверки Telegram: secret = HMAC_SHA256("WebAppData", token),
// hash = HMAC_SHA256(secret, отсортированные "key=value", соединённые "\n").
const dataCheckString = Object.keys(fields)
  .sort()
  .map((k) => `${k}=${fields[k]}`)
  .join('\n');
const secret = createHmac('sha256', 'WebAppData').update(token).digest();
const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
const initData = new URLSearchParams({ ...fields, hash }).toString();

const light = {
  bg_color: '#ffffff',
  secondary_bg_color: '#efeff4',
  section_bg_color: '#ffffff',
  text_color: '#000000',
  hint_color: '#8e8e93',
  link_color: '#007aff',
  button_color: '#007aff',
  button_text_color: '#ffffff',
  destructive_text_color: '#ff3b30',
};
const dark = {
  bg_color: '#17212b',
  secondary_bg_color: '#0e1621',
  section_bg_color: '#17212b',
  text_color: '#f5f5f5',
  hint_color: '#708499',
  link_color: '#6ab3f3',
  button_color: '#5288c1',
  button_text_color: '#ffffff',
  destructive_text_color: '#ec3942',
};

const hashParams = new URLSearchParams({
  tgWebAppData: initData,
  tgWebAppVersion: '8.0',
  // `unknown` — как обычный браузер: страницы показывают свои кнопки вместо
  // нативной MainButton, которой вне Telegram нет.
  tgWebAppPlatform: 'unknown',
  tgWebAppThemeParams: JSON.stringify(flag('--dark') ? dark : light),
});

console.log(`${appUrl}/#${hashParams.toString()}`);
