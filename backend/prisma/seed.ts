// Опциональный сид. Данные создаются пользователями через Telegram Mini App,
// поэтому по умолчанию сид пустой (оставлен как точка расширения).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Пример: здесь можно создать демо-поездку для локальной разработки.
  // Оставляем пустым, чтобы прод-база не наполнялась тестовыми данными.
  console.log('seed: nothing to do');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
