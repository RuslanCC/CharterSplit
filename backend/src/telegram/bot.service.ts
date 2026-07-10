import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard } from 'grammy';

/**
 * Телеграм-бот в режиме webhook. Устанавливает вебхук при старте и обрабатывает апдейты.
 * Единственная внешняя зависимость проекта — Telegram.
 */
@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  private get token(): string {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  private get webhookSecret(): string {
    return this.config.get<string>('TELEGRAM_WEBHOOK_SECRET', '');
  }

  private get publicUrl(): string {
    return this.config.get<string>('PUBLIC_URL', '');
  }

  private tokenLooksValid(): boolean {
    return /^\d+:[\w-]{20,}$/.test(this.token);
  }

  async onModuleInit(): Promise<void> {
    if (!this.tokenLooksValid()) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set/invalid — bot disabled');
      return;
    }
    this.bot = new Bot(this.token);
    this.registerHandlers(this.bot);

    try {
      await this.bot.init();
      this.ready = true;
    } catch (e) {
      this.logger.error(`bot.init failed: ${(e as Error).message}`);
      return;
    }

    if (this.publicUrl) {
      const url = `${this.publicUrl.replace(/\/$/, '')}/api/telegram/webhook/${this.webhookSecret}`;
      try {
        await this.bot.api.setWebhook(url, {
          secret_token: this.webhookSecret || undefined,
          allowed_updates: ['message', 'callback_query'],
        });
        this.logger.log(`webhook set to ${url}`);
      } catch (e) {
        this.logger.error(`setWebhook failed: ${(e as Error).message}`);
      }
    } else {
      this.logger.warn('PUBLIC_URL not set — webhook not registered');
    }
  }

  private registerHandlers(bot: Bot): void {
    const appUrl = this.publicUrl;
    bot.command('start', async (ctx) => {
      const keyboard = appUrl
        ? new InlineKeyboard().webApp('🧾 Открыть CharterSplit', appUrl)
        : undefined;
      await ctx.reply(
        'CharterSplit — деление общих расходов в поездке.\n' +
          'Откройте приложение, чтобы вести расходы, судовую кассу и взаиморасчёты.',
        keyboard ? { reply_markup: keyboard } : undefined,
      );
    });

    bot.on('message', async (ctx) => {
      if (appUrl && ctx.chat?.type === 'private') {
        await ctx.reply('Откройте приложение через кнопку меню или команду /start.');
      }
    });
  }

  /** Обрабатывает входящий апдейт (из webhook-контроллера). */
  async handleUpdate(update: unknown): Promise<void> {
    if (!this.bot || !this.ready) {
      this.logger.warn('update received but bot is not ready');
      return;
    }
    await this.bot.handleUpdate(update as any);
  }
}
