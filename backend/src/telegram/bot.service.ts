import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { TripsService } from '../trips/trips.service';
import { ExportService } from '../export/export.service';
import { formatMoney } from '../common/format';

/**
 * Телеграм-бот в режиме webhook. Устанавливает вебхук при старте и обрабатывает апдейты.
 * Единственная внешняя зависимость проекта — Telegram.
 */
@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly trips: TripsService,
    private readonly exporter: ExportService,
  ) {}

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

    try {
      await this.bot.api.setMyCommands([
        { command: 'start', description: 'Открыть CharterSplit' },
        { command: 'balance', description: 'Баланс поездки и взаиморасчёты' },
        { command: 'summary', description: 'Итоги поездки' },
        { command: 'export', description: 'Выгрузить расходы в CSV' },
      ]);
    } catch (e) {
      this.logger.warn(`setMyCommands failed: ${(e as Error).message}`);
    }

    if (this.publicUrl) {
      const url = `${this.publicUrl.replace(/\/$/, '')}/api/telegram/webhook/${this.webhookSecret}`;
      try {
        await this.bot.api.setWebhook(url, {
          secret_token: this.webhookSecret || undefined,
          allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        });
        this.logger.log(`webhook set to ${url}`);
      } catch (e) {
        this.logger.error(`setWebhook failed: ${(e as Error).message}`);
      }
    } else {
      this.logger.warn('PUBLIC_URL not set — webhook not registered');
    }
  }

  /**
   * Прямая ссылка на Mini App с ключом поездки (start_param = "c<chatId>").
   * Работает как URL-кнопка в группах, где web_app-кнопки запрещены.
   * Требует включённого Main Mini App в BotFather.
   */
  private miniAppLink(chatId: number): string {
    return `https://t.me/${this.bot!.botInfo.username}?startapp=c${chatId}`;
  }

  private registerHandlers(bot: Bot): void {
    const appUrl = this.publicUrl;

    bot.command('start', async (ctx) => {
      if (ctx.chat.type === 'private') {
        const keyboard = appUrl
          ? new InlineKeyboard().webApp('🧾 Открыть CharterSplit', appUrl)
          : undefined;
        await ctx.reply(
          'CharterSplit — деление общих расходов в поездке.\n' +
            'Откройте приложение, чтобы вести расходы, судовую кассу и взаиморасчёты.',
          keyboard ? { reply_markup: keyboard } : undefined,
        );
        return;
      }
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.sendGroupTripMessage(ctx.chat.id, ctx.chat.title);
      }
    });

    bot.command('balance', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.sendBalanceMessage(ctx.chat.id, ctx.chat.title);
        return;
      }
      const keyboard = appUrl
        ? new InlineKeyboard().webApp('🧾 Открыть CharterSplit', appUrl)
        : undefined;
      await ctx.reply(
        'Команда /balance работает в групповом чате поездки. ' +
          'Здесь откройте приложение, чтобы посмотреть балансы.',
        keyboard ? { reply_markup: keyboard } : undefined,
      );
    });

    bot.command('summary', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.sendSummaryMessage(ctx.chat.id, ctx.chat.title);
        return;
      }
      const keyboard = appUrl
        ? new InlineKeyboard().webApp('🧾 Открыть CharterSplit', appUrl)
        : undefined;
      await ctx.reply(
        'Команда /summary работает в групповом чате поездки. ' +
          'Здесь откройте приложение, чтобы посмотреть итоги.',
        keyboard ? { reply_markup: keyboard } : undefined,
      );
    });

    bot.command('export', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.sendExportDocument(ctx.chat.id, ctx.chat.title);
        return;
      }
      const keyboard = appUrl
        ? new InlineKeyboard().webApp('🧾 Открыть CharterSplit', appUrl)
        : undefined;
      await ctx.reply(
        'Команда /export работает в групповом чате поездки — файл придёт сюда же.',
        keyboard ? { reply_markup: keyboard } : undefined,
      );
    });

    // Бот добавлен в группу → создаём поездку чата и присылаем кнопку входа.
    bot.on('my_chat_member', async (ctx) => {
      const chat = ctx.chat;
      if (chat.type !== 'group' && chat.type !== 'supergroup') return;
      const now = ctx.myChatMember.new_chat_member.status;
      const before = ctx.myChatMember.old_chat_member.status;
      const joined =
        (now === 'member' || now === 'administrator') &&
        before !== 'member' &&
        before !== 'administrator';
      if (!joined) return;
      await this.registerSender(chat.id, chat.title, ctx.myChatMember.from);
      await this.sendGroupTripMessage(chat.id, chat.title);
    });

    // Сервисные сообщения о входе/выходе приходят даже при включённом privacy mode.
    bot.on('message:new_chat_members', async (ctx) => {
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
      for (const u of ctx.message.new_chat_members) {
        if (u.is_bot) continue;
        await this.registerSender(ctx.chat.id, ctx.chat.title, u);
      }
    });

    bot.on('message:left_chat_member', async (ctx) => {
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
      const u = ctx.message.left_chat_member;
      if (u.is_bot) return;
      try {
        await this.trips.deactivateChatMember(ctx.chat.id, u.id);
      } catch (e) {
        this.logger.error(
          `deactivate member failed for chat ${ctx.chat.id}: ${(e as Error).message}`,
        );
      }
    });

    bot.on('message', async (ctx) => {
      if (appUrl && ctx.chat?.type === 'private') {
        await ctx.reply('Откройте приложение через кнопку меню или команду /start.');
        return;
      }
      // Пассивный сбор участников: автор сообщения в группе попадает в поездку.
      // Обычные сообщения бот видит только с выключенным privacy mode
      // (BotFather → /setprivacy → Disable) или с правами администратора.
      if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
      }
    });
  }

  /** Регистрирует пользователя Telegram как участника поездки группы. */
  private async registerSender(
    chatId: number,
    chatTitle: string | undefined,
    from?: {
      id: number;
      is_bot: boolean;
      username?: string;
      first_name: string;
      last_name?: string;
    },
  ): Promise<void> {
    if (!from || from.is_bot) return;
    try {
      await this.trips.registerChatMember(chatId, chatTitle, {
        id: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });
    } catch (e) {
      this.logger.error(
        `register member failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Находит/создаёт поездку группы и отправляет в чат приветствие с кнопкой. */
  private async sendGroupTripMessage(
    chatId: number,
    chatTitle?: string,
  ): Promise<void> {
    try {
      const trip = await this.trips.ensureForGroupChat(chatId, chatTitle);
      await this.bot!.api.sendMessage(
        chatId,
        `⛵️ Поездка «${trip.title}» готова!\n` +
          'Нажмите кнопку, чтобы открыть общие расходы, судовую кассу и взаиморасчёты. ' +
          'Каждый, кто напишет в чат или откроет приложение, попадёт в эту же поездку; ' +
          'остальных можно добавить по @username на экране «Участники».',
        {
          reply_markup: new InlineKeyboard().url(
            '🧾 Открыть CharterSplit',
            this.miniAppLink(chatId),
          ),
        },
      );
    } catch (e) {
      this.logger.error(
        `group trip message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Отправляет в группу сводку балансов: расходы, касса, взаиморасчёты. */
  private async sendBalanceMessage(
    chatId: number,
    chatTitle?: string,
  ): Promise<void> {
    try {
      const { trip, members, transfers, fund, totalSpent } =
        await this.trips.balancesForGroupChat(chatId, chatTitle);
      const fmt = (minor: number) => formatMoney(minor, trip.currency);

      const lines: string[] = [
        `⛵️ «${trip.title}»`,
        '',
        `💰 Всего расходов: ${fmt(totalSpent)}`,
        `🏦 Касса: ${fmt(fund.balance)}`,
      ];

      const nonZero = members.filter((m) => m.balance !== 0);
      if (nonZero.length > 0) {
        lines.push('', 'Балансы:');
        for (const m of nonZero) {
          const sign = m.balance > 0 ? '+' : '';
          lines.push(`• ${m.displayName}: ${sign}${fmt(m.balance)}`);
        }
      }

      lines.push('', 'Взаиморасчёты:');
      if (transfers.length === 0) {
        lines.push('Все рассчитаны, долгов нет 🎉');
      } else {
        for (const t of transfers) {
          lines.push(`• ${t.fromName} → ${t.toName}: ${fmt(t.amount)}`);
        }
      }

      await this.bot!.api.sendMessage(chatId, lines.join('\n'), {
        reply_markup: new InlineKeyboard().url(
          '🧾 Открыть CharterSplit',
          this.miniAppLink(chatId),
        ),
      });
    } catch (e) {
      this.logger.error(
        `balance message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Отправляет в группу итоги поездки: суммы, число расходов, дни, топ плательщиков. */
  private async sendSummaryMessage(
    chatId: number,
    chatTitle?: string,
  ): Promise<void> {
    try {
      const { trip, summary } = await this.trips.summaryForGroupChat(
        chatId,
        chatTitle,
      );
      const fmt = (minor: number) => formatMoney(minor, trip.currency);

      const lines: string[] = [
        `📊 Итоги «${trip.title}»`,
        '',
        `💰 Всего потрачено: ${fmt(summary.totalSpent)}`,
        `👤 Лично: ${fmt(summary.spentPersonal)}`,
        `🏦 Из кассы: ${fmt(summary.spentFromFund)}`,
        `🧾 Расходов: ${summary.expenseCount} за ${summary.days} дн.`,
        `📈 В среднем: ${fmt(summary.avgPerDay)} в день`,
      ];

      if (summary.perMember.length > 0) {
        lines.push('', 'Кто сколько платил:');
        for (const m of summary.perMember) {
          lines.push(`• ${m.displayName}: ${fmt(m.paid)}`);
        }
      }

      await this.bot!.api.sendMessage(chatId, lines.join('\n'), {
        reply_markup: new InlineKeyboard().url(
          '🧾 Открыть CharterSplit',
          this.miniAppLink(chatId),
        ),
      });
    } catch (e) {
      this.logger.error(
        `summary message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Находит/создаёт поездку группы и присылает CSV-выгрузку расходов в чат. */
  private async sendExportDocument(
    chatId: number,
    chatTitle?: string,
  ): Promise<void> {
    try {
      const trip = await this.trips.ensureForGroupChat(chatId, chatTitle);
      const { filename, content } = await this.exporter.buildCsv(trip.id);
      await this.sendDocumentToChat(
        BigInt(chatId),
        filename,
        content,
        `📄 Расходы поездки «${trip.title}»`,
      );
    } catch (e) {
      this.logger.error(
        `export document failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Отправляет файл-документ в чат. Никогда не бросает.
   */
  async sendDocumentToChat(
    telegramChatId: bigint,
    filename: string,
    content: string,
    caption?: string,
  ): Promise<void> {
    if (!this.bot || !this.ready) {
      this.logger.warn('sendDocumentToChat skipped: bot is not ready');
      return;
    }
    try {
      await this.bot.api.sendDocument(
        Number(telegramChatId),
        new InputFile(Buffer.from(content, 'utf8'), filename),
        caption ? { caption } : undefined,
      );
    } catch (e) {
      this.logger.error(
        `sendDocumentToChat failed for chat ${telegramChatId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Отправляет текст в чат. Никогда не бросает: сбой Telegram не должен
   * ломать бизнес-операцию, из которой пришло уведомление.
   */
  async sendToChat(telegramChatId: bigint, text: string): Promise<void> {
    if (!this.bot || !this.ready) {
      this.logger.warn('sendToChat skipped: bot is not ready');
      return;
    }
    try {
      await this.bot.api.sendMessage(Number(telegramChatId), text);
    } catch (e) {
      this.logger.error(
        `sendToChat failed for chat ${telegramChatId}: ${(e as Error).message}`,
      );
    }
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
