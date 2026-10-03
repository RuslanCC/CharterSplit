import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { TelegramAuthGuard } from './auth/telegram-auth.guard';
import { UsersModule } from './users/users.module';
import { TripsModule } from './trips/trips.module';
import { ParticipantsModule } from './participants/participants.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ImportModule } from './import/import.module';
import { FundModule } from './fund/fund.module';
import { SettlementsModule } from './settlements/settlements.module';
import { SettingsModule } from './settings/settings.module';
import { HistoryModule } from './history/history.module';
import { TelegramModule } from './telegram/telegram.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';

const isProd = process.env.NODE_ENV === 'production';

/** Путь вебхука содержит секрет — маскируем его в логах запросов. */
const maskWebhookSecret = (url: string) =>
  url.replace(/(\/telegram\/webhook\/)[^/?#]+/, '$1***');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: isProd
          ? undefined
          : { target: 'pino-pretty', options: { singleLine: true } },
        // Не логируем секреты: initData, cookie, секрет вебхука (заголовок и путь).
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-telegram-bot-api-secret-token"]',
        ],
        serializers: {
          // params дублируют url (и секрет в нём) — не пишем их вовсе.
          req(req: { url?: string; params?: unknown }) {
            if (req.url) req.url = maskWebhookSecret(req.url);
            delete req.params;
            return req;
          },
        },
        autoLogging: true,
      },
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    TripsModule,
    ParticipantsModule,
    ExpensesModule,
    ImportModule,
    FundModule,
    SettlementsModule,
    SettingsModule,
    HistoryModule,
    TelegramModule,
    HealthModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TelegramAuthGuard,
    },
  ],
})
export class AppModule {}
