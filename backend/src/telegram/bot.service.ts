import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, type Context, InlineKeyboard, InputFile } from 'grammy';
import type { Update, User as TgUser } from 'grammy/types';
import { TripsService } from '../trips/trips.service';
import { ExportService } from '../export/export.service';
import { isValidBotToken } from '../common/telegram-token';
import {
  ADD_TO_GROUP_BUTTON,
  BOARD_FOOTER,
  BOT_COMMANDS,
  GROUP_ONLY_TEXTS,
  OPEN_APP_BUTTON,
  PIN_MANUALLY_TEXT,
  PRIVATE_MESSAGE_TEXT,
  groupTripReadyText,
  helpText,
  renderBalanceText,
  renderSummaryText,
  startPrivateText,
} from './bot-texts';

type GroupChat = { id: number; type: 'group' | 'supergroup'; title: string };

/** Групповой ли чат (поездка живёт только в группах). */
function asGroupChat(chat: Context['chat']): GroupChat | null {
  return chat && (chat.type === 'group' || chat.type === 'supergroup') ? chat : null;
}

/**
 * Телеграм-бот в режиме webhook. Устанавливает вебхук при старте и обрабатывает апдейты.
 * Тексты сообщений — в bot-texts.ts.
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

  /** Контакт для вопросов в /start и /help (например, @username); пусто — не показываем. */
  private get supportContact(): string {
    return this.config.get<string>('SUPPORT_CONTACT', '');
  }

  async onModuleInit(): Promise<void> {
    if (!isValidBotToken(this.token)) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set/invalid — bot disabled');
      return;
    }
    this.bot = new Bot(this.token);
    this.registerHandlers(this.bot);
    // Ошибка в хендлере не должна ронять обработку вебхука: иначе Telegram
    // получает 500 и бесконечно повторяет тот же апдейт.
    this.bot.catch((err) => {
      this.logger.error(
        `update ${err.ctx.update.update_id} failed: ${(err.error as Error)?.message ?? err.error}`,
      );
    });

    try {
      await this.bot.init();
      this.ready = true;
    } catch (e) {
      this.logger.error(`bot.init failed: ${(e as Error).message}`);
      return;
    }

    try {
      await this.bot.api.setMyCommands(BOT_COMMANDS);
    } catch (e) {
      this.logger.warn(`setMyCommands failed: ${(e as Error).message}`);
    }

    if (this.publicUrl) {
      const base = `${this.publicUrl.replace(/\/$/, '')}/api/telegram/webhook/`;
      try {
        await this.bot.api.setWebhook(base + this.webhookSecret, {
          secret_token: this.webhookSecret || undefined,
          allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        });
        // URL содержит секрет — в лог только без него.
        this.logger.log(`webhook set to ${base}***`);
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

  /** Кнопка для лички: добавить бота в группу поездки (диплинк выбора группы). */
  private addToGroupKeyboard(): InlineKeyboard {
    return new InlineKeyboard().url(
      ADD_TO_GROUP_BUTTON,
      `https://t.me/${this.bot!.botInfo.username}?startgroup=true`,
    );
  }

  /** Кнопка «открыть Mini App» для сообщений в групповом чате. */
  private openAppKeyboard(chatId: number): InlineKeyboard {
    return new InlineKeyboard().url(OPEN_APP_BUTTON, this.miniAppLink(chatId));
  }

  /**
   * Команда, работающая только в группе: регистрирует автора и вызывает
   * `run`; в личке отвечает подсказкой из GROUP_ONLY_TEXTS.
   */
  private groupCommand(
    bot: Bot,
    command: keyof typeof GROUP_ONLY_TEXTS,
    run: (chat: GroupChat) => Promise<void>,
    withAddButton = true,
  ): void {
    bot.command(command, async (ctx) => {
      const chat = asGroupChat(ctx.chat);
      if (chat) {
        await this.registerSender(chat.id, chat.title, ctx.from);
        await run(chat);
        return;
      }
      await ctx.reply(GROUP_ONLY_TEXTS[command], {
        reply_markup: withAddButton ? this.addToGroupKeyboard() : undefined,
      });
    });
  }

  private registerHandlers(bot: Bot): void {
    bot.command('start', async (ctx) => {
      if (ctx.chat.type === 'private') {
        await ctx.reply(startPrivateText(this.supportContact), {
          reply_markup: this.addToGroupKeyboard(),
        });
        return;
      }
      const chat = asGroupChat(ctx.chat);
      if (chat) {
        await this.registerSender(chat.id, chat.title, ctx.from);
        await this.sendGroupTripMessage(chat.id, chat.title);
      }
    });

    this.groupCommand(bot, 'balance', (c) => this.sendBalanceMessage(c.id, c.title));
    this.groupCommand(
      bot,
      'board',
      (c) => this.establishBalanceBoard(c.id, c.title),
      false,
    );
    this.groupCommand(bot, 'summary', (c) => this.sendSummaryMessage(c.id, c.title));
    this.groupCommand(bot, 'export', (c) => this.sendExportDocument(c.id, c.title));

    // Справка о функционале по команде /help или хэштегу #справка / #инфо / #help.
    // В группах хэштеги видны боту только с выключенным privacy mode или у админа.
    const help = async (ctx: Context) => {
      if (!ctx.chat) return;
      const chat = asGroupChat(ctx.chat);
      if (chat) await this.registerSender(chat.id, chat.title, ctx.from);
      await this.sendHelpMessage(ctx.chat.id, ctx.chat.type);
    };
    bot.command('help', help);
    bot.hears(/(?:^|\s)#(?:справка|инфо|help|помощь)\b/i, help);

    // Бот добавлен в группу → создаём поездку чата и присылаем кнопку входа.
    bot.on('my_chat_member', async (ctx) => {
      const chat = asGroupChat(ctx.chat);
      if (!chat) return;
      const now = ctx.myChatMember.new_chat_member.status;
      const before = ctx.myChatMember.old_chat_member.status;
      const isIn = (s: string) => s === 'member' || s === 'administrator';
      if (!isIn(now) || isIn(before)) return;
      await this.registerSender(chat.id, chat.title, ctx.myChatMember.from);
      await this.sendGroupTripMessage(chat.id, chat.title);
    });

    // Сервисные сообщения о входе/выходе приходят даже при включённом privacy mode.
    bot.on('message:new_chat_members', async (ctx) => {
      const chat = asGroupChat(ctx.chat);
      if (!chat) return;
      for (const u of ctx.message.new_chat_members) {
        await this.registerSender(chat.id, chat.title, u);
      }
    });

    bot.on('message:left_chat_member', async (ctx) => {
      const chat = asGroupChat(ctx.chat);
      const u = ctx.message.left_chat_member;
      if (!chat || u.is_bot) return;
      try {
        await this.trips.deactivateChatMember(chat.id, u.id);
      } catch (e) {
        this.logger.error(
          `deactivate member failed for chat ${chat.id}: ${(e as Error).message}`,
        );
      }
    });

    // Группа стала супергруппой (смена видимости истории, публичная ссылка и
    // т.п.) — у чата новый chat_id. Приходят два сервисных сообщения: в старую
    // группу (migrate_to) и в новую супергруппу (migrate_from); переносим
    // поездку по первому, второе — no-op. Должно стоять до общего 'message',
    // иначе регистрация отправителя заведёт под новым id пустую поездку.
    bot.on('message:migrate_to_chat_id', async (ctx) => {
      await this.migrateChat(ctx.chat.id, ctx.message.migrate_to_chat_id);
    });

    bot.on('message:migrate_from_chat_id', async (ctx) => {
      await this.migrateChat(ctx.message.migrate_from_chat_id, ctx.chat.id);
    });

    bot.on('message', async (ctx) => {
      if (ctx.chat.type === 'private') {
        await ctx.reply(PRIVATE_MESSAGE_TEXT, {
          reply_markup: this.addToGroupKeyboard(),
        });
        return;
      }
      // Пассивный сбор участников: автор сообщения в группе попадает в поездку.
      // Обычные сообщения бот видит только с выключенным privacy mode
      // (BotFather → /setprivacy → Disable) или с правами администратора.
      const chat = asGroupChat(ctx.chat);
      if (chat) await this.registerSender(chat.id, chat.title, ctx.from);
    });
  }

  /** Переносит поездку группы на новый chat_id супергруппы. */
  private async migrateChat(fromChatId: number, toChatId: number): Promise<void> {
    try {
      await this.trips.migrateGroupChat(fromChatId, toChatId);
      this.logger.log(`trip migrated: chat ${fromChatId} → ${toChatId}`);
    } catch (e) {
      this.logger.error(
        `chat migration ${fromChatId} → ${toChatId} failed: ${(e as Error).message}`,
      );
    }
  }

  /** Регистрирует пользователя Telegram как участника поездки группы. */
  private async registerSender(
    chatId: number,
    chatTitle: string | undefined,
    from?: TgUser,
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
  private async sendGroupTripMessage(chatId: number, chatTitle?: string): Promise<void> {
    try {
      const trip = await this.trips.ensureForGroupChat(chatId, chatTitle);
      await this.bot!.api.sendMessage(chatId, groupTripReadyText(trip.title), {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(chatId),
      });
    } catch (e) {
      this.logger.error(
        `group trip message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Отправляет справку о возможностях бота и контакт для вопросов. */
  private async sendHelpMessage(chatId: number, chatType: string): Promise<void> {
    const isPrivate = chatType === 'private';
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const keyboard = isPrivate
      ? this.addToGroupKeyboard()
      : isGroup
        ? this.openAppKeyboard(chatId)
        : undefined;
    try {
      await this.bot!.api.sendMessage(chatId, helpText(isPrivate, this.supportContact), {
        reply_markup: keyboard,
      });
    } catch (e) {
      this.logger.error(
        `help message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Отправляет в группу разовую сводку балансов (команда /balance). */
  private async sendBalanceMessage(chatId: number, chatTitle?: string): Promise<void> {
    try {
      const data = await this.trips.balancesForGroupChat(chatId, chatTitle);
      await this.bot!.api.sendMessage(chatId, renderBalanceText(data), {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(chatId),
      });
    } catch (e) {
      this.logger.error(
        `balance message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Создаёт «табло баланса»: отправляет сообщение, запоминает его id для
   * последующего редактирования на месте и пытается закрепить (если бот —
   * админ с правом закрепления; иначе просит закрепить вручную).
   */
  private async establishBalanceBoard(chatId: number, chatTitle?: string): Promise<void> {
    try {
      const data = await this.trips.balancesForGroupChat(chatId, chatTitle);
      const text = `${renderBalanceText(data)}\n\n${BOARD_FOOTER}`;
      const msg = await this.bot!.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(chatId),
      });
      await this.trips.setPinnedMessageId(data.trip.id, msg.message_id);
      try {
        await this.bot!.api.pinChatMessage(chatId, msg.message_id, {
          disable_notification: true,
        });
      } catch {
        // Бот не админ / нет права закрепления — просим закрепить вручную.
        await this.bot!.api.sendMessage(chatId, PIN_MANUALLY_TEXT);
      }
    } catch (e) {
      this.logger.error(
        `establish board failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Обновляет закреплённое «табло баланса» на месте. Вызывается после каждой
   * операции (расход/касса/взаиморасчёт). No-op, если табло ещё не создано.
   * Никогда не бросает.
   */
  async refreshBalanceBoard(telegramChatId: bigint): Promise<void> {
    if (!this.bot || !this.ready) return;
    const chatId = Number(telegramChatId);
    try {
      const data = await this.trips.balancesForGroupChat(chatId);
      const messageId = data.trip.pinnedMessageId;
      if (!messageId) return;
      const text = `${renderBalanceText(data)}\n\n${BOARD_FOOTER}`;
      try {
        await this.bot.api.editMessageText(chatId, Number(messageId), text, {
          parse_mode: 'HTML',
          reply_markup: this.openAppKeyboard(chatId),
        });
      } catch (e) {
        const desc = (e as { description?: string }).description ?? '';
        if (desc.includes('message is not modified')) return;
        // Сообщение удалено/недоступно для правки — сбрасываем, чтобы /board пересоздал.
        if (
          desc.includes('message to edit not found') ||
          desc.includes("message can't be edited") ||
          desc.includes('MESSAGE_ID_INVALID')
        ) {
          await this.trips.setPinnedMessageId(data.trip.id, null);
          return;
        }
        throw e;
      }
    } catch (e) {
      this.logger.error(
        `refresh board failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Отправляет в группу итоги поездки: суммы, число расходов, дни, топ плательщиков. */
  private async sendSummaryMessage(chatId: number, chatTitle?: string): Promise<void> {
    try {
      const data = await this.trips.summaryForGroupChat(chatId, chatTitle);
      await this.bot!.api.sendMessage(chatId, renderSummaryText(data), {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(chatId),
      });
    } catch (e) {
      this.logger.error(
        `summary message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Находит/создаёт поездку группы и присылает CSV-выгрузку расходов в чат. */
  private async sendExportDocument(chatId: number, chatTitle?: string): Promise<void> {
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
  async sendToChat(telegramChatId: bigint, text: string, html = false): Promise<void> {
    if (!this.bot || !this.ready) {
      this.logger.warn('sendToChat skipped: bot is not ready');
      return;
    }
    try {
      await this.bot.api.sendMessage(
        Number(telegramChatId),
        text,
        html ? { parse_mode: 'HTML' } : undefined,
      );
    } catch (e) {
      this.logger.error(
        `sendToChat failed for chat ${telegramChatId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Отправляет карточку расхода с кнопкой Mini App. Возвращает message_id
   * отправленного сообщения (для последующего редактирования) или null при сбое.
   */
  async sendExpenseCard(telegramChatId: bigint, text: string): Promise<number | null> {
    if (!this.bot || !this.ready) {
      this.logger.warn('sendExpenseCard skipped: bot is not ready');
      return null;
    }
    const chatId = Number(telegramChatId);
    try {
      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(chatId),
      });
      return msg.message_id;
    } catch (e) {
      this.logger.error(
        `sendExpenseCard failed for chat ${chatId}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Редактирует ранее отправленную карточку расхода на месте.
   * Возвращает true при успехе (или если текст не изменился), false — если
   * сообщение недоступно для правки (удалено/слишком старое) и требуется переотправка.
   */
  async editExpenseCard(
    telegramChatId: bigint,
    messageId: number,
    text: string,
  ): Promise<boolean> {
    if (!this.bot || !this.ready) return false;
    const chatId = Number(telegramChatId);
    try {
      await this.bot.api.editMessageText(chatId, messageId, text, {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(chatId),
      });
      return true;
    } catch (e) {
      const desc = (e as { description?: string }).description ?? '';
      if (desc.includes('message is not modified')) return true;
      this.logger.error(
        `editExpenseCard failed for chat ${chatId} msg ${messageId}: ${(e as Error).message}`,
      );
      return false;
    }
  }

  /** Обрабатывает входящий апдейт (из webhook-контроллера). */
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot || !this.ready) {
      this.logger.warn('update received but bot is not ready');
      return;
    }
    await this.bot.handleUpdate(update);
  }
}
