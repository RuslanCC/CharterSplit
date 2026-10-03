<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/hero-dark.png">
    <img src="docs/screenshots/hero-light.png" alt="CharterSplit — общие расходы поездки в Telegram">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/RuslanCC/CharterSplit/actions/workflows/ci.yml"><img src="https://github.com/RuslanCC/CharterSplit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white" alt="Telegram Mini App">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS 11">
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18">
</p>

<p align="center">
  <b>Попробовать без установки:</b> добавьте <a href="https://t.me/chartersplit_bot?startgroup=true">@chartersplit_bot</a> в групповой чат поездки
  · <a href="https://ruslancc.github.io/CharterSplit/">сайт проекта</a>
</p>

# CharterSplit

**CharterSplit** — Telegram Mini App и бот для деления общих расходов в поездках и на яхтенных
чартерах. Поездка — это групповой чат: добавляете бота в группу, открываете приложение кнопкой
из чата и ведёте расходы, судовую кассу и взаиморасчёты вместе со всеми участниками.

- **Без регистрации.** Вход только через Telegram: подпись `initData` проверяется на сервере.
- **Поездка = чат.** Участники попадают в поездку сами — когда пишут в чат или открывают приложение.
- **Self-hosted.** Все данные в вашем PostgreSQL. Единственная внешняя зависимость — Telegram:
  никаких Firebase, Supabase, Auth0 и прочих сторонних сервисов.

## Скриншоты

<table>
  <tr>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/overview-dark.png"><img src="docs/screenshots/overview-light.png" width="220" alt="Обзор поездки"></picture><br><sub>Обзор: баланс, касса, динамика трат</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/expenses-dark.png"><img src="docs/screenshots/expenses-light.png" width="220" alt="Список расходов"></picture><br><sub>Расходы по дням</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/new-expense-dark.png"><img src="docs/screenshots/new-expense-light.png" width="220" alt="Новый расход"></picture><br><sub>Новый расход: три способа деления</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/balances-dark.png"><img src="docs/screenshots/balances-light.png" width="220" alt="Взаиморасчёты"></picture><br><sub>Кто кому сколько платит</sub></td>
  </tr>
  <tr>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fund-dark.png"><img src="docs/screenshots/fund-light.png" width="220" alt="Судовая касса"></picture><br><sub>Судовая касса</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/members-dark.png"><img src="docs/screenshots/members-light.png" width="220" alt="Участники"></picture><br><sub>Участники и семейные связи</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/history-dark.png"><img src="docs/screenshots/history-light.png" width="220" alt="История операций"></picture><br><sub>История операций</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/settings-dark.png"><img src="docs/screenshots/settings-light.png" width="220" alt="Настройки"></picture><br><sub>Настройки поездки</sub></td>
  </tr>
</table>

Приложение подхватывает цвета темы Telegram — светлой и тёмной. Скриншоты сняты на демо-данных
из `npm run seed:demo`.

## Возможности

- **Расходы** — поровну, по долям (весам) или точными суммами; чаевые делятся поровну между
  участниками расхода; расход можно оплатить из судовой кассы.
- **Судовая касса** — взносы, выплаты, корректировки, баланс и расходы, оплаченные из кассы.
- **Взаиморасчёты** — балансы участников и короткий список переводов «кто кому платит»;
  погашения отмечаются в один тап.
- **Участники** — из Telegram (автоматически по переписке в чате), по `@username` или гости
  без аккаунта. Деактивация сохраняет историю.
- **Семейные связи** — расходы участника покрывает другой (например, родитель за ребёнка).
  Связь применяется при расчёте балансов, поэтому её можно поменять задним числом.
- **Бот в чате** — карточка каждого расхода, `/balance`, закрепляемое табло баланса `/board`,
  которое бот обновляет сам, итоги `/summary`, CSV-выгрузка `/export`, справка `/help`.
- **Импорт из Splitwise** — CSV-экспорт группы с сопоставлением участников и точными долями.
- **История операций** — аудит всех действий с фильтрами и пагинацией.
- **Настройки** — валюта, способ деления по умолчанию, гости, уведомления в чат. Trip-level
  настройки меняет только владелец поездки.
- **Админ-раздел владельца бота** — `/admin` в личке (для `ADMIN_TELEGRAM_IDS`): пользователи,
  поездки, расходы, активность по дням, суммы по валютам, список всех поездок и отчёт по любой
  из них только для чтения.

## Как это работает

```mermaid
sequenceDiagram
    actor U as Участник
    participant G as Групповой чат
    participant B as Бот (backend)
    participant M as Mini App

    U->>G: добавляет бота в группу
    G->>B: my_chat_member (webhook)
    B->>G: «Поездка готова» + кнопка t.me/<bot>?startapp=c<chatId>
    U->>M: открывает приложение кнопкой
    M->>B: initData (подписан Telegram)
    B->>B: проверка HMAC, членства в чате → поездка чата
    B-->>M: поездка, участники, балансы
    U->>M: добавляет расход
    M->>B: POST /trips/:id/expenses
    B->>G: карточка расхода, обновление табло баланса
```

## Архитектура

```mermaid
flowchart LR
    TG[Telegram] -- webhook --> P
    U[Клиент Telegram<br/>Mini App] -- HTTPS --> P[Reverse-proxy<br/>Caddy / nginx]
    P -- "/api/*" --> BE[backend<br/>NestJS + grammY]
    P -- "/*" --> FE[frontend<br/>Next.js]
    BE --> DB[(PostgreSQL)]
    BE -- Bot API --> TG
```

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16 (App Router, standalone), React 19, TypeScript, Tailwind CSS v4, `telegram-web-app.js` |
| Backend | NestJS 11, Prisma 6, grammY (webhook), nestjs-pino, class-validator |
| Данные | PostgreSQL 18, миграции Prisma |
| Инфраструктура | Docker Compose; HTTPS — ваш reverse-proxy **или** встроенный nginx + Let's Encrypt |
| Качество | ESLint, Prettier, Vitest, GitHub Actions |

## Быстрый старт

Понадобятся сервер с Docker Compose, домен с HTTPS и бот, созданный в [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/RuslanCC/CharterSplit.git
cd CharterSplit
cp .env.example .env
```

Заполните в `.env` как минимум `POSTGRES_PASSWORD` (и его же в `DATABASE_URL`),
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`) и `PUBLIC_URL`.
Дальше — один из двух вариантов.

### Вариант A: чистый сервер (свой nginx + Let's Encrypt)

Нужны DNS A-запись `DOMAIN` → IP сервера и открытые порты 80/443. В `.env` укажите `DOMAIN`,
`LETSENCRYPT_EMAIL`, `PUBLIC_URL=https://<DOMAIN>` и оставьте `NEXT_PUBLIC_BASE_PATH` пустым.

```bash
# первый выпуск сертификата — в тестовом режиме Let's Encrypt
echo "CERTBOT_STAGING=1" >> .env
docker compose -f docker-compose.standalone.yml up -d
docker compose -f docker-compose.standalone.yml logs -f certbot   # дождитесь сертификата
# переключитесь на боевой сертификат
sed -i 's/^CERTBOT_STAGING=1/CERTBOT_STAGING=0/' .env
docker compose -f docker-compose.standalone.yml up -d
```

nginx стартует с временным самоподписанным сертификатом (решение cold-start), certbot получает
настоящий по HTTP-01 и продлевает его каждые 12 часов, nginx перечитывает конфиг каждые 6 часов.

### Вариант B: за уже работающим reverse-proxy

`docker-compose.yml` не публикует портов: backend и frontend подключаются к внешней docker-сети
`PROXY_NETWORK` (по умолчанию `proxy`), где живёт ваш прокси, и он ходит к ним по имени контейнера.

```bash
docker network create proxy   # если сети ещё нет; к ней должен быть подключён прокси
docker compose up -d
```

Приложение можно держать и под под-путём: задайте `NEXT_PUBLIC_BASE_PATH=/chartersplit` и
`PUBLIC_URL=https://example.com/chartersplit`. Пример для Caddy:

```caddy
example.com {
    # API: префикс срезается — backend видит /trips, /health, /telegram/webhook/…
    handle_path /chartersplit/api/* {
        reverse_proxy chartersplit-backend:3000
    }
    # Next.js собран с basePath=/chartersplit — путь не срезается
    handle /chartersplit* {
        reverse_proxy chartersplit-frontend:3000
    }
}
```

Если приложение в корне домена — то же самое без `/chartersplit`.

### Проверка

```bash
docker compose ps                                  # все сервисы healthy
curl -s https://example.com/api/health             # {"status":"ok","db":"up",…}
docker compose logs -f backend                     # JSON-логи; ищите "webhook set"
```

При старте backend применяет миграции (`prisma migrate deploy`) и сам регистрирует вебхук
на `${PUBLIC_URL}/api/telegram/webhook/<секрет>`.

## Настройка бота в @BotFather

1. **Mini App.** `/mybots` → бот → *Bot Settings* → *Configure Mini App* → включите Main Mini App
   и укажите URL = `PUBLIC_URL`. Кнопки бота в группах — ссылки вида
   `https://t.me/<bot>?startapp=c<chatId>`, они открывают именно Main Mini App.
2. **Privacy mode.** `/setprivacy` → *Disable*. Иначе бот не видит обычные сообщения в группе,
   и участники не добавляются в поездку «по факту переписки» (останутся вход через приложение
   и события вступления/выхода). Альтернатива — сделать бота администратором группы.
3. **Закрепление табло.** Чтобы `/board` сам закреплял табло баланса, дайте боту право
   «Закреплять сообщения»; иначе бот попросит закрепить вручную.

Команды бота (`/balance`, `/board`, `/summary`, `/export`, `/help`) регистрируются автоматически.

**Админ-раздел.** Если задан `ADMIN_TELEGRAM_IDS`, перечисленным пользователям в личке с ботом
доступна команда `/admin`. Она открывает в Mini App статистику использования (пользователи,
поездки, расходы, активность) и отчёты по любой поездке инстанса только для чтения. Учтите:
владелец инстанса видит данные всех поездок, которые ведутся через его бота.

## Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | да | Учётные данные PostgreSQL в контейнере `db` |
| `DATABASE_URL` | да | Строка подключения Prisma (`…@db:5432/…` в compose) |
| `TELEGRAM_BOT_TOKEN` | да | Токен бота. Им же проверяется подпись `initData`; без него backend не стартует |
| `TELEGRAM_WEBHOOK_SECRET` | да | Секрет вебхука: часть пути и заголовок `X-Telegram-Bot-Api-Secret-Token` |
| `PUBLIC_URL` | да | Публичный URL Mini App (как в BotFather). Из него же берутся вебхук и разрешённый CORS-origin |
| `NEXT_PUBLIC_BASE_PATH` | нет | Под-путь приложения, например `/chartersplit`. Зашивается во фронтенд при сборке |
| `INIT_DATA_EXPIRES_IN` | нет | Срок жизни `initData`, сек (по умолчанию 3600) |
| `SUPPORT_CONTACT` | нет | Контакт для вопросов в `/start` и `/help`, например `@username`. Пусто — не показывается |
| `ADMIN_TELEGRAM_IDS` | нет | Telegram User ID владельцев бота через запятую. Им в личке доступна команда `/admin` — статистика и отчёты по всем поездкам. Пусто — раздел выключен |
| `LOG_LEVEL` | нет | Уровень логов pino (по умолчанию `info`) |
| `PROXY_NETWORK` | нет | Внешняя docker-сеть reverse-proxy для `docker-compose.yml` (по умолчанию `proxy`) |
| `DOMAIN`, `LETSENCRYPT_EMAIL`, `CERTBOT_STAGING` | для варианта A | Домен и почта для Let's Encrypt; `CERTBOT_STAGING=1` — тестовые сертификаты |

## Обновление без потери данных

```bash
git pull
docker compose up -d --build
```

Данные лежат в named volume `pgdata`; `prisma migrate deploy` применяет только новые миграции.
**Никогда** не запускайте `docker compose down -v` — это удалит том с базой. Бэкап:

```bash
docker compose exec db pg_dump -U chartersplit chartersplit > backup-$(date +%F).sql
```

## Локальная разработка

Нужны Node.js 22+ и PostgreSQL (локальный или в Docker).

```bash
npm install
docker run -d --name chartersplit-db -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:18-alpine

cat > backend/.env <<'ENV'
DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres?schema=public
TELEGRAM_BOT_TOKEN=123:dev
TELEGRAM_WEBHOOK_SECRET=dev
PORT=3001
ENV

npm run prisma:generate
npm run prisma:migrate          # применить миграции
npm run seed:demo               # демо-поездка «Хорватия · Sun Odyssey 519»
npm run dev:backend             # http://localhost:3001
DEV_API_URL=http://localhost:3001 npm run dev:frontend   # http://localhost:3000
```

Токен `123:dev` не похож на настоящий, поэтому бот отключён и в Telegram ничего не уходит, а
подпись `initData` проверяется этим же токеном. Чтобы открыть Mini App в обычном браузере,
сгенерируйте ссылку с подписанным `initData` владельца демо-поездки:

```bash
TELEGRAM_BOT_TOKEN=123:dev npm run dev:init-data            # светлая тема
TELEGRAM_BOT_TOKEN=123:dev npm run dev:init-data -- --dark  # тёмная тема
```

`DEV_API_URL` включает в Next.js проксирование `/api/*` на backend — в проде это делает
reverse-proxy. Для отладки внутри настоящего Telegram используйте туннель (например, cloudflared)
и тестового бота.

### Проверки

```bash
npm run check        # typecheck + lint + format:check + test
npm run build        # сборка backend и frontend
```

Те же шаги выполняет CI на каждый push и pull request.

## Структура проекта

```
CharterSplit/
├── backend/                     # NestJS + Prisma
│   ├── prisma/                  # schema.prisma, миграции, демо-сид
│   └── src/
│       ├── auth/                # проверка initData (глобальный guard)
│       ├── common/              # деньги, покрытие, доступ, форматирование
│       ├── trips/ expenses/ fund/ settlements/ participants/ settings/ history/
│       ├── import/ export/      # Splitwise CSV → расходы, расходы → CSV
│       └── telegram/            # бот (webhook), уведомления, тексты сообщений
├── frontend/                    # Next.js (App Router) — сам Mini App
│   └── src/{app,components,lib}
├── nginx/ certbot/              # свой HTTPS для docker-compose.standalone.yml
├── scripts/dev-init-data.mjs    # подписанный initData для локальной разработки
├── docker-compose.yml           # за внешним reverse-proxy
└── docker-compose.standalone.yml
```

## Как считаются деньги

- Все суммы — целые **минорные единицы** (центы/копейки), без чисел с плавающей точкой.
- **Поровну**: остаток от деления достаётся первым участникам по одной копейке.
- **По долям**: метод наибольшего остатка — сумма долей всегда сходится до копейки.
- **Чаевые** хранятся отдельно от долей и делятся поровну между участниками расхода.
- **Баланс** участника = заплатил − его доли ± погашения. Семейные связи переносят чистый
  эффект участника на покрывающего прямо при расчёте.
- **Переводы** строятся жадно: крупнейший должник платит крупнейшему кредитору — не больше
  n−1 перевода на n участников.
- **Касса** = взносы − выплаты ± корректировки − расходы, оплаченные из кассы.

## Безопасность

- Каждый запрос несёт `Authorization: tma <initData>`; backend проверяет HMAC-подпись токеном
  бота и срок `auth_date`. Ключ поездки (чат) берётся только из подписанных данных.
- Ссылку `startapp=c<chatId>` может собрать кто угодно, поэтому новичок вступает в поездку
  только после проверки через Bot API, что он состоит в этом чате.
- Вебхук защищён секретом в пути и заголовке; секрет, `initData` и cookie вырезаются из логов.
- Внутри поездки участники равноправны: любой может добавлять и править расходы, кассу и
  погашения. Название, валюту, настройки и активность участников меняет только владелец.

Нашли уязвимость — см. [SECURITY.md](SECURITY.md).

## Ограничения

- Интерфейс и бот — только на русском языке.
- Валюта у поездки одна; при импорте суммы в другой валюте не конвертируются.
- Приложение работает только из групповых чатов — в личке бот подскажет, как начать.

## Участие в разработке

Issues и pull request'ы приветствуются — начните с [CONTRIBUTING.md](CONTRIBUTING.md).
