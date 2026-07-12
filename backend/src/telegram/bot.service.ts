import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { TripsService } from '../trips/trips.service';
import { ExportService } from '../export/export.service';
import { formatMoney, escapeHtml } from '../common/format';

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
        { command: 'board', description: 'Закрепляемое табло баланса (бот обновляет)' },
        { command: 'summary', description: 'Итоги поездки' },
        { command: 'export', description: 'Выгрузить расходы в CSV' },
        { command: 'help', description: 'Справка о функционале и контакты' },
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

  /**
   * Диплинк «добавить бота в группу» — открывает в Telegram выбор группы.
   * Приложение привязано к групповому чату, поэтому в личке это главный CTA.
   */
  private addToGroupLink(): string {
    return `https://t.me/${this.bot!.botInfo.username}?startgroup=true`;
  }

  /** Кнопка для лички: добавить бота в группу поездки. */
  private addToGroupKeyboard(): InlineKeyboard {
    return new InlineKeyboard().url(
      '➕ Добавить в группу поездки',
      this.addToGroupLink(),
    );
  }

  /** Кнопка «открыть Mini App» для сообщений в групповом чате. */
  private openAppKeyboard(chatId: number): InlineKeyboard {
    return new InlineKeyboard().url(
      '🧾 Открыть CharterSplit',
      this.miniAppLink(chatId),
    );
  }

  private registerHandlers(bot: Bot): void {
    bot.command('start', async (ctx) => {
      if (ctx.chat.type === 'private') {
        await ctx.reply(
          '⛵️ CharterSplit — деление общих расходов в поездке.\n\n' +
            'Приложение работает в групповом чате поездки, а не в личке.\n\n' +
            'Как начать:\n' +
            '1️⃣ Добавьте меня в группу вашей поездки — кнопкой ниже.\n' +
            '2️⃣ В группе я пришлю кнопку «🧾 Открыть CharterSplit» — открывайте приложение через неё.\n' +
            '3️⃣ Все, кто пишет в чат или открывает приложение, попадают в эту поездку автоматически.\n\n' +
            '❓ По всем вопросам пишите @RuslanCC',
          { reply_markup: this.addToGroupKeyboard() },
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
      await ctx.reply(
        'Команда /balance работает в групповом чате поездки. ' +
          'Добавьте меня в группу и откройте приложение кнопкой оттуда.',
        { reply_markup: this.addToGroupKeyboard() },
      );
    });

    bot.command('board', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.establishBalanceBoard(ctx.chat.id, ctx.chat.title);
        return;
      }
      await ctx.reply(
        'Команда /board работает в групповом чате поездки: бот пришлёт табло баланса ' +
          'и будет само обновлять его при каждом изменении. Закрепите это сообщение в чате.',
      );
    });

    bot.command('summary', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.sendSummaryMessage(ctx.chat.id, ctx.chat.title);
        return;
      }
      await ctx.reply(
        'Команда /summary работает в групповом чате поездки. ' +
          'Добавьте меня в группу и откройте приложение кнопкой оттуда.',
        { reply_markup: this.addToGroupKeyboard() },
      );
    });

    bot.command('export', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
        await this.sendExportDocument(ctx.chat.id, ctx.chat.title);
        return;
      }
      await ctx.reply(
        'Команда /export работает в групповом чате поездки — файл придёт туда же. ' +
          'Добавьте меня в группу поездки.',
        { reply_markup: this.addToGroupKeyboard() },
      );
    });

    // Справка о функционале по команде /help или хэштегу #справка / #инфо / #help.
    // В группах хэштеги видны боту только с выключенным privacy mode или у админа.
    bot.command('help', async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
      }
      await this.sendHelpMessage(ctx.chat.id, ctx.chat.type);
    });

    bot.hears(/(?:^|\s)#(?:справка|инфо|help|помощь)\b/i, async (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await this.registerSender(ctx.chat.id, ctx.chat.title, ctx.from);
      }
      await this.sendHelpMessage(ctx.chat.id, ctx.chat.type);
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
      if (ctx.chat?.type === 'private') {
        await ctx.reply(
          'CharterSplit работает в групповом чате поездки. ' +
            'Добавьте меня в группу и открывайте приложение кнопкой оттуда — ' +
            'подробнее в /start.',
          { reply_markup: this.addToGroupKeyboard() },
        );
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
        `⛵️ Поездка «<b>${escapeHtml(trip.title)}</b>» готова!\n` +
          'Нажмите кнопку, чтобы открыть общие расходы, судовую кассу и взаиморасчёты. ' +
          'Каждый, кто напишет в чат или откроет приложение, попадёт в эту же поездку; ' +
          'остальных можно добавить по @username на экране «Участники».',
        {
          parse_mode: 'HTML',
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

  /** Отправляет справку о возможностях бота и контакт для вопросов. */
  private async sendHelpMessage(
    chatId: number,
    chatType: string,
  ): Promise<void> {
    const lines: string[] = [
      '⛵️ CharterSplit — деление общих расходов в поездке.',
      '',
      'Что умеет бот:',
      '• Ведёт общие расходы, судовую кассу и взаиморасчёты поездки',
      '• Автоматически добавляет участников группы в поездку',
      '• Присылает балансы, итоги и выгрузку — прямо в чат',
      '',
      'Команды в групповом чате поездки:',
      '• /balance — баланс и кто кому должен',
      '• /board — закрепляемое табло баланса (бот сам его обновляет)',
      '• /summary — итоги поездки',
      '• /export — выгрузка расходов в CSV',
      '• /help или #справка — эта справка',
      '',
      chatType === 'private'
        ? 'Приложение работает в групповом чате поездки. Добавьте меня в группу — ' +
          'там появится кнопка «🧾 Открыть CharterSplit».'
        : 'Приложение открывается кнопкой «🧾 Открыть CharterSplit».',
      '',
      '❓ По всем вопросам пишите @RuslanCC',
    ];

    const keyboard =
      chatType === 'private'
        ? this.addToGroupKeyboard()
        : chatType === 'group' || chatType === 'supergroup'
          ? new InlineKeyboard().url(
              '🧾 Открыть CharterSplit',
              this.miniAppLink(chatId),
            )
          : undefined;

    try {
      await this.bot!.api.sendMessage(chatId, lines.join('\n'), {
        reply_markup: keyboard,
      });
    } catch (e) {
      this.logger.error(
        `help message failed for chat ${chatId}: ${(e as Error).message}`,
      );
    }
  }

  /** Собирает HTML-текст сводки балансов: расходы, касса, балансы, взаиморасчёты. */
  private renderBalanceText(data: {
    trip: { title: string; currency: string };
    members: { displayName: string; balance: number }[];
    transfers: { fromName: string; toName: string; amount: number }[];
    fund: { balance: number };
    totalSpent: number;
  }): string {
    const { trip, members, transfers, fund, totalSpent } = data;
    const fmt = (minor: number) => formatMoney(minor, trip.currency);

    const lines: string[] = [
      `⛵️ <b>${escapeHtml(trip.title)}</b>`,
      '',
      `💰 Всего расходов: <b>${fmt(totalSpent)}</b>`,
      `🏦 Касса: <b>${fmt(fund.balance)}</b>`,
    ];

    const nonZero = members.filter((m) => m.balance !== 0);
    if (nonZero.length > 0) {
      lines.push('', '<b>Балансы</b>');
      for (const m of nonZero) {
        const dot = m.balance > 0 ? '🟢' : '🔴';
        const sign = m.balance > 0 ? '+' : '';
        lines.push(
          `${dot} ${escapeHtml(m.displayName)}: <b>${sign}${fmt(m.balance)}</b>`,
        );
      }
    }

    lines.push('', '<b>Взаиморасчёты</b>');
    if (transfers.length === 0) {
      lines.push('Все рассчитаны, долгов нет 🎉');
    } else {
      for (const t of transfers) {
        lines.push(
          `• ${escapeHtml(t.fromName)} → ${escapeHtml(t.toName)}: <b>${fmt(t.amount)}</b>`,
        );
      }
    }

    return lines.join('\n');
  }

  /** Отправляет в группу разовую сводку балансов (команда /balance). */
  private async sendBalanceMessage(
    chatId: number,
    chatTitle?: string,
  ): Promise<void> {
    try {
      const data = await this.trips.balancesForGroupChat(chatId, chatTitle);
      await this.bot!.api.sendMessage(chatId, this.renderBalanceText(data), {
        parse_mode: 'HTML',
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

  /**
   * Создаёт «табло баланса»: отправляет сообщение, запоминает его id для
   * последующего редактирования на месте и пытается закрепить (если бот —
   * админ с правом закрепления; иначе просит закрепить вручную).
   */
  private async establishBalanceBoard(
    chatId: number,
    chatTitle?: string,
  ): Promise<void> {
    try {
      const data = await this.trips.balancesForGroupChat(chatId, chatTitle);
      const text = `${this.renderBalanceText(data)}\n\n<i>🔄 Табло обновляется автоматически</i>`;
      const msg = await this.bot!.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url(
          '🧾 Открыть CharterSplit',
          this.miniAppLink(chatId),
        ),
      });
      await this.trips.setPinnedMessageId(data.trip.id, msg.message_id);
      try {
        await this.bot!.api.pinChatMessage(chatId, msg.message_id, {
          disable_notification: true,
        });
      } catch {
        // Бот не админ / нет права закрепления — просим закрепить вручную.
        await this.bot!.api.sendMessage(
          chatId,
          '📌 Закрепите сообщение выше — бот будет держать его актуальным. ' +
            'Чтобы бот закреплял сам, дайте ему право «Закреплять сообщения».',
        );
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
      const text = `${this.renderBalanceText(data)}\n\n<i>🔄 Табло обновляется автоматически</i>`;
      try {
        await this.bot.api.editMessageText(chatId, Number(messageId), text, {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().url(
            '🧾 Открыть CharterSplit',
            this.miniAppLink(chatId),
          ),
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
        `📊 <b>Итоги «${escapeHtml(trip.title)}»</b>`,
        '',
        `💰 Всего потрачено: <b>${fmt(summary.totalSpent)}</b>`,
        `👤 Лично: ${fmt(summary.spentPersonal)}`,
        `🏦 Из кассы: ${fmt(summary.spentFromFund)}`,
        `🧾 Расходов: ${summary.expenseCount} за ${summary.days} дн.`,
        `📈 В среднем: ${fmt(summary.avgPerDay)} в день`,
      ];

      if (summary.perMember.length > 0) {
        lines.push('', '<b>Кто сколько платил</b>');
        for (const m of summary.perMember) {
          lines.push(`• ${escapeHtml(m.displayName)}: <b>${fmt(m.paid)}</b>`);
        }
      }

      await this.bot!.api.sendMessage(chatId, lines.join('\n'), {
        parse_mode: 'HTML',
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
  async sendToChat(
    telegramChatId: bigint,
    text: string,
    html = false,
  ): Promise<void> {
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
  async sendExpenseCard(
    telegramChatId: bigint,
    text: string,
  ): Promise<number | null> {
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
  async handleUpdate(update: unknown): Promise<void> {
    if (!this.bot || !this.ready) {
      this.logger.warn('update received but bot is not ready');
      return;
    }
    await this.bot.handleUpdate(update as any);
  }
}
