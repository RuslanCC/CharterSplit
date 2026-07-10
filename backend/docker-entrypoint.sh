#!/bin/sh
# Применяем миграции (идемпотентно, только закоммиченные) и стартуем backend.
# migrate deploy никогда не удаляет данные и не пересоздаёт схему.
set -e

echo "[entrypoint] prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] starting NestJS..."
exec node dist/main.js
