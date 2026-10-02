import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api } from 'grammy';
import { isValidBotToken } from './telegram-token';

/**
 * Проверяет через Bot API, состоит ли пользователь в групповом чате.
 * Нужна, чтобы по ссылке с чужим `start_param` (c<chatId>) нельзя было
 * вступить в поездку группы, в которой пользователя нет.
 */
@Injectable()
export class ChatMembershipService {
  private readonly logger = new Logger(ChatMembershipService.name);
  private readonly api?: Api;

  constructor(config: ConfigService) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    if (isValidBotToken(token)) this.api = new Api(token);
  }

  /**
   * true — состоит в чате; false — не состоит, или бот не в чате;
   * null — проверка недоступна (бот отключён: dev-режим без настоящего токена).
   */
  async isMember(chatId: number, userId: number): Promise<boolean | null> {
    if (!this.api) {
      this.logger.warn('bot disabled — chat membership check skipped');
      return null;
    }
    try {
      const m = await this.api.getChatMember(chatId, userId);
      switch (m.status) {
        case 'creator':
        case 'administrator':
        case 'member':
          return true;
        case 'restricted':
          return m.is_member;
        default:
          return false;
      }
    } catch (e) {
      this.logger.warn(
        `getChatMember(${chatId}, ${userId}) failed: ${(e as Error).message}`,
      );
      return false;
    }
  }
}
