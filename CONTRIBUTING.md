# Участие в разработке

Спасибо, что хотите помочь CharterSplit! Короткие правила, чтобы pull request'ы проходили быстро.

## Подготовка окружения

Как поднять backend, frontend и демо-данные локально — в разделе
[«Локальная разработка»](README.md#локальная-разработка) README. Коротко:

```bash
npm install
npm run prisma:generate
npm run seed:demo
npm run dev:backend
DEV_API_URL=http://localhost:3001 npm run dev:frontend
TELEGRAM_BOT_TOKEN=123:dev npm run dev:init-data   # ссылка для открытия Mini App в браузере
```

## Перед pull request'ом

```bash
npm run check   # typecheck + lint + format:check + test
npm run build
```

- Форматирование — Prettier (`npm run format`), линтер — ESLint.
- Логику без побочных эффектов (деньги, парсеры, тексты бота) покрывайте тестами Vitest:
  backend — `*.spec.ts` рядом с кодом, frontend — `*.test.ts`.
- Изменили схему БД — добавьте миграцию: `npm run prisma:migrate:dev --workspace backend`.
  Уже опубликованные миграции не редактируйте.
- Деньги — только целые минорные единицы; сумма долей должна сходиться до копейки.
- Комментарии в коде и тексты интерфейса — на русском, как в остальном проекте.

## Коммиты и PR

- Сообщения коммитов в стиле [Conventional Commits](https://www.conventionalcommits.org/ru/):
  `feat: …`, `fix: …`, `docs: …`, `refactor: …`.
- Один PR — одна задача. Опишите, что и зачем меняется; для UI приложите скриншот.

## Ошибки и идеи

Заводите issue: шаги воспроизведения, ожидаемое и фактическое поведение, версия/коммит.
Об уязвимостях не пишите публично — см. [SECURITY.md](SECURITY.md).
