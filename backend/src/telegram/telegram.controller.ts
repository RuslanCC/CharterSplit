import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators/public.decorator';
import type { Update } from 'grammy/types';
import { BotService } from './bot.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly bot: BotService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Webhook Telegram. Защита: секрет в пути + заголовок X-Telegram-Bot-Api-Secret-Token,
   * который Telegram присылает, потому что мы задали secret_token при setWebhook.
   */
  @Public()
  @Post('webhook/:secret')
  @HttpCode(200)
  async webhook(
    @Param('secret') secret: string,
    @Headers('x-telegram-bot-api-secret-token') headerSecret: string,
    @Body() update: Update,
  ) {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET', '');
    if (!expected || !safeEqual(secret, expected) || !safeEqual(headerSecret, expected)) {
      throw new ForbiddenException('invalid webhook secret');
    }
    await this.bot.handleUpdate(update);
    return { ok: true };
  }
}

/** Сравнение секретов за постоянное время. */
function safeEqual(actual: string | undefined, expected: string): boolean {
  const a = Buffer.from(actual ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
