import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// BigInt (Telegram User/Chat ID) не сериализуется в JSON по умолчанию — приводим к строке.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

/** Origin фронтенда из PUBLIC_URL (фронт и API живут на одном origin за прокси). */
function allowedOrigin(): string | false {
  try {
    return process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : false;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Импорт Splitwise присылает до 2000 строк — дефолтных 100 КБ не хватает.
  app.useBodyParser('json', { limit: '2mb' });

  // Глобального префикса нет: reverse-proxy срезает `<BASE_PATH>/api`,
  // поэтому backend видит /trips, /health, /telegram/webhook/… .
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  app.enableCors({ origin: allowedOrigin() });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
