# CharterSplit

Telegram Mini App для деления общих расходов в поездках и на яхтенных чартерах: поездки,
участники, расходы с разными способами деления, **судовая касса**, взаиморасчёты, история
операций и настройки.

Проект полностью автономен: единственная внешняя зависимость — **Telegram**. Все данные
хранятся в собственном PostgreSQL. Никаких BaaS/сторонних сервисов аутентификации,
хранения или синхронизации (Firebase, Supabase, Auth0, Clerk, OAuth и т.п.) не используется.

- **Авторизация** — только через Telegram Mini Apps (проверка `initData` по HMAC).
- **Пользователь** идентифицируется по Telegram **User ID**.
- **Поездка** привязана к Telegram **Chat ID** (+ запасные ключи `chat_instance` / `start_param`).

## Стек

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Telegram Mini Apps SDK |
| Backend | NestJS 11, Prisma 6, PostgreSQL |
| Инфраструктура | Docker, Docker Compose, PostgreSQL. HTTPS: Caddy (на этом VPS) **или** Nginx + Let's Encrypt (standalone) |

## Структура

```
CharterSplit/
├── docker-compose.yml            # основной режим: db + backend + frontend (за общим Caddy)
├── docker-compose.standalone.yml # переносимость: + nginx + certbot (свой HTTPS на чистом сервере)
├── nginx/                        # конфиг и cold-start скрипт для standalone-режима
├── certbot/                      # скрипт выпуска/продления Let's Encrypt (standalone)
├── .env.example                  # шаблон конфигурации
├── backend/                      # NestJS + Prisma (schema, миграции, модули)
└── frontend/                     # Next.js 16 (App Router, Mini App)
```

## Развёртывание на этом VPS (`vps.ruslan.cc/chartersplit`)

На `vps.ruslan.cc` уже работает единый edge-прокси **Caddy** (`aisecretary-caddy-1`), который
держит порты 80/443 и делает автоматический HTTPS. CharterSplit подключается к нему как ещё
один сайт под-путём `/chartersplit` (аналогично `/ai`, `/mostehos`). Свой nginx/certbot в этом
режиме не поднимается.

### 1. Предусловия
- Существует внешняя docker-сеть `proxy` (Caddy к ней подключён): `docker network ls | grep proxy`.
- Бот создан в @BotFather, токен под рукой.

### 2. Клонирование и конфигурация
```bash
ssh vps
git clone <repo-url> /root/Vibe/CharterSplit
cd /root/Vibe/CharterSplit
cp .env.example .env
# отредактируйте .env: POSTGRES_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
# DOMAIN/LETSENCRYPT_EMAIL нужны только для standalone-режима — здесь можно не трогать.
```
Значения `PUBLIC_URL`, `BASE_PATH`, `NEXT_PUBLIC_*` в `.env.example` уже настроены на
`https://vps.ruslan.cc/chartersplit`.

### 3. Запуск (одна команда)
```bash
docker compose up -d
```
Поднимутся `db` → `backend` (применит миграции Prisma `migrate deploy`, затем стартует Nest)
→ `frontend`. Контейнеры `chartersplit-backend` и `chartersplit-frontend` подключаются к сети
`proxy`.

### 4. Маршрут в общем Caddy
Добавьте блок в `/root/Vibe/AISecretary/Caddyfile` внутри `vps.ruslan.cc { … }`, **перед**
финальным `handle { reverse_proxy app:8000 }`:
```caddy
    handle_path /chartersplit/api/* {
        reverse_proxy chartersplit-backend:3000
    }
    handle /chartersplit* {
        reverse_proxy chartersplit-frontend:3000
    }
```
Примените без даунтайма:
```bash
docker exec aisecretary-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

### 5. Настройка бота
- В @BotFather задайте URL Mini App = `https://vps.ruslan.cc/chartersplit`
  (`/newapp` или кнопка меню `/setmenubutton`).
- **Отключите privacy mode** (`/setprivacy` → **Disable**) — иначе бот не видит
  обычные сообщения в группе и участники не будут добавляться в поездку
  автоматически «по факту переписки» (сработает только заход в приложение и
  события вступления/выхода). Альтернатива — выдать боту права администратора
  в группе.
- Webhook регистрируется автоматически при старте backend на
  `https://vps.ruslan.cc/chartersplit/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`.
  Ручной вариant:
  ```bash
  curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://vps.ruslan.cc/chartersplit/api/telegram/webhook/$TELEGRAM_WEBHOOK_SECRET&secret_token=$TELEGRAM_WEBHOOK_SECRET"
  ```

### 6. Проверка
```bash
docker compose ps                # все сервисы healthy
curl -sI https://vps.ruslan.cc/chartersplit/           # 200 (Next)
curl -s  https://vps.ruslan.cc/chartersplit/api/health # {"status":"ok","db":"up"}
docker compose logs -f backend   # структурные JSON-логи
```
Откройте Mini App из бота в групповом чате — поездка создастся автоматически по Chat ID.

## Standalone-режим (чистый сервер, свой HTTPS)

Для развёртывания без внешнего Caddy — со своим Nginx и автоматическим Let's Encrypt:

Предусловия: DNS A-запись `DOMAIN` → IP сервера; открыты порты 80/443.
```bash
cp .env.example .env
# заполните DOMAIN, LETSENCRYPT_EMAIL, а также POSTGRES_*/TELEGRAM_*
# первый выпуск сертификата рекомендуется в тестовом режиме:
echo "CERTBOT_STAGING=1" >> .env
docker compose -f docker-compose.standalone.yml up -d
# убедитесь, что сертификат выпустился (docker compose -f docker-compose.standalone.yml logs certbot),
# затем переключите на прод и перевыпустите:
sed -i 's/^CERTBOT_STAGING=1/CERTBOT_STAGING=0/' .env
docker compose -f docker-compose.standalone.yml up -d
```
Nginx стартует с временным самоподписанным сертификатом (решение cold-start), certbot получает
реальный по HTTP-01 и продлевает его каждые 12 часов; nginx перечитывает конфиг каждые 6 часов.
В этом режиме Mini App отдаётся в корне домена (`https://$DOMAIN`), URL для BotFather — `https://$DOMAIN`.

## Обновление без потери данных

```bash
git pull
docker compose up -d --build
```
Named volume `pgdata` сохраняется; `prisma migrate deploy` применяет только новые миграции
идемпотентно. **Никогда** не используйте `docker compose down -v` (это удалит тома с данными).

## Возможности

- **Расходы** — три способа деления: поровну, по долям (весам), точными суммами; оплата из кассы.
- **Судовая касса** — взносы, выплаты, корректировки, баланс, оплата расходов из кассы.
- **Взаиморасчёты** — балансы участников и минимальный набор переводов «кто кому платит».
- **Участники** — из Telegram и гости; деактивация с сохранением истории; семейные связи
  (расходы участника покрывает другой участник). Покрытие применяется динамически при
  расчёте балансов/взаиморасчётов: доли хранятся на фактическом участнике, а его чистый
  эффект переносится покрывающему — связь можно менять задним числом.
- **Импорт из Splitwise** — загрузка CSV-экспорта группы, сопоставление участников файла
  с участниками поездки (Telegram-юзернеймы), восстановление точных долей; семейные связи
  применяются и при импорте (доли и платежи записываются на покрывающего).
- **История операций** — аудит всех действий с фильтрами (тип, участник, период) и пагинацией.
- **Настройки** — валюта, способ деления по умолчанию, локаль, разрешение гостей.

## Логирование

- Backend: структурные JSON-логи (nestjs-pino) в stdout, уровень через `LOG_LEVEL`.
- Docker: драйвер `json-file` (ротация 10 МБ × 5) на всех сервисах.
- Аудит операций хранится в БД (`OperationHistory`) и просматривается в экране «История».

## Локальная разработка

```bash
npm install                     # workspaces: backend + frontend
# backend:
cd backend && npm run prisma:generate && npm run start:dev
# frontend:
cd frontend && NEXT_PUBLIC_BASE_PATH=/chartersplit npm run dev
```
Вне Telegram приложение покажет экран «Откройте в Telegram» (нет валидного `initData`).
