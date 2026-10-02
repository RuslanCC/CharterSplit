import { Injectable, Logger } from '@nestjs/common';
import type { SplitType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot.service';
import { displayNameOf, formatMoney, escapeHtml } from '../common/format';
import { computeTipShares } from '../common/money';

const SPLIT_NOTE: Record<SplitType, string> = {
  EQUAL: 'поровну',
  SHARES: 'по долям',
  EXACT: 'точными суммами',
};

/**
 * Уведомления в групповой чат поездки о расходах и операциях с кассой.
 * Все методы fire-and-forget: не бросают и не задерживают бизнес-операцию.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotService,
  ) {}

  /**
   * Отправляет карточку нового расхода в чат и запоминает id сообщения,
   * чтобы при изменении расхода отредактировать его на месте.
   */
  async expenseCreated(tripId: string, actor: User, expenseId: string): Promise<void> {
    try {
      const trip = await this.notifiableTrip(tripId);
      if (!trip) return;
      const card = await this.renderExpenseCard(tripId, expenseId, actor, trip.currency);
      if (!card) return;
      const messageId = await this.bot.sendExpenseCard(trip.telegramChatId!, card);
      if (messageId != null) {
        await this.prisma.expense.update({
          where: { id: expenseId },
          data: { chatMessageId: BigInt(messageId) },
        });
      }
    } catch (err) {
      this.logger.error(`expenseCreated notify failed: ${(err as Error).message}`);
    }
  }

  /**
   * Обновляет карточку расхода в чате после его изменения: правит ранее
   * отправленное сообщение на месте. Если карточки ещё не было (уведомления были
   * выключены) или её удалили — отправляет новую и запоминает её id.
   */
  async expenseUpdated(tripId: string, actor: User, expenseId: string): Promise<void> {
    try {
      const trip = await this.notifiableTrip(tripId);
      if (!trip) return;
      const expense = await this.prisma.expense.findFirst({
        where: { id: expenseId, tripId },
        select: { chatMessageId: true },
      });
      if (!expense) return;
      const card = await this.renderExpenseCard(tripId, expenseId, actor, trip.currency);
      if (!card) return;

      if (expense.chatMessageId != null) {
        const ok = await this.bot.editExpenseCard(
          trip.telegramChatId!,
          Number(expense.chatMessageId),
          card,
        );
        if (ok) return;
      }
      // Карточки не было или её нельзя отредактировать — отправляем новую.
      const messageId = await this.bot.sendExpenseCard(trip.telegramChatId!, card);
      if (messageId != null) {
        await this.prisma.expense.update({
          where: { id: expenseId },
          data: { chatMessageId: BigInt(messageId) },
        });
      }
    } catch (err) {
      this.logger.error(`expenseUpdated notify failed: ${(err as Error).message}`);
    }
  }

  /**
   * Собирает HTML-текст карточки расхода: сумма, кто оплатил, способ деления
   * и подробная раскладка «кто сколько должен» (с учётом чаевых).
   * Возвращает null, если расход не найден.
   */
  private async renderExpenseCard(
    tripId: string,
    expenseId: string,
    actor: User,
    currency: string,
  ): Promise<string | null> {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tripId },
      include: {
        paidByMember: { select: { displayName: true } },
        shares: {
          orderBy: { id: 'asc' },
          include: { member: { select: { displayName: true } } },
        },
      },
    });
    if (!expense) return null;

    const fmt = (minor: number) => formatMoney(minor, currency);
    const payerName = escapeHtml(expense.paidByMember.displayName);
    const lines: string[] = [
      `💸 <b>${escapeHtml(expense.description)}</b> — <b>${fmt(expense.amount)}</b>`,
    ];

    if (expense.fromFund) {
      lines.push(`Оплатил ${payerName} · оплачено из кассы`);
      lines.push(`Добавил ${escapeHtml(await this.actorName(tripId, actor))}`);
      return lines.join('\n');
    }

    const how =
      expense.splitType === 'EQUAL'
        ? `делится поровну на ${expense.shares.length}`
        : `делится ${SPLIT_NOTE[expense.splitType]}`;
    lines.push(`Оплатил ${payerName} · ${how}`);

    // Итоговый долг каждого = его доля + равная доля чаевых.
    const tipShares = computeTipShares(
      expense.tipAmount,
      expense.shares.map((s) => s.memberId),
    );
    const rows = expense.shares
      .map((s) => ({
        name: s.member.displayName,
        owed: s.amount + (tipShares[s.memberId] ?? 0),
      }))
      .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'ru'));

    lines.push('', '<b>Кто сколько должен:</b>');
    for (const r of rows) {
      lines.push(`• ${escapeHtml(r.name)} — ${fmt(r.owed)}`);
    }
    if (expense.tipAmount > 0) {
      lines.push(`<i>вкл. чаевые ${fmt(expense.tipAmount)} поровну</i>`);
    }
    lines.push('', `<i>Добавил ${escapeHtml(await this.actorName(tripId, actor))}</i>`);
    return lines.join('\n');
  }

  async expenseDeleted(
    tripId: string,
    actor: User,
    e: { description: string; amount: number },
  ): Promise<void> {
    try {
      const trip = await this.notifiableTrip(tripId);
      if (!trip) return;
      await this.bot.sendToChat(
        trip.telegramChatId!,
        [
          `🗑 Удалён расход <b>${escapeHtml(e.description)}</b> — <b>${formatMoney(e.amount, trip.currency)}</b>`,
          `Убрал ${escapeHtml(await this.actorName(tripId, actor))}`,
        ].join('\n'),
        true,
      );
    } catch (err) {
      this.logger.error(`expenseDeleted notify failed: ${(err as Error).message}`);
    }
  }

  async fundContributed(
    tripId: string,
    actor: User,
    memberName: string | null,
    amount: number,
  ): Promise<void> {
    try {
      const trip = await this.notifiableTrip(tripId);
      if (!trip) return;
      const who = memberName ? ` от ${escapeHtml(memberName)}` : '';
      await this.bot.sendToChat(
        trip.telegramChatId!,
        [
          `🏦 <b>Взнос в кассу</b>${who} — <b>${formatMoney(amount, trip.currency)}</b>`,
          `Внёс ${escapeHtml(await this.actorName(tripId, actor))}`,
        ].join('\n'),
        true,
      );
    } catch (err) {
      this.logger.error(`fundContributed notify failed: ${(err as Error).message}`);
    }
  }

  async fundPaidOut(
    tripId: string,
    actor: User,
    memberName: string | null,
    amount: number,
  ): Promise<void> {
    try {
      const trip = await this.notifiableTrip(tripId);
      if (!trip) return;
      const who = memberName ? ` — ${escapeHtml(memberName)}` : '';
      await this.bot.sendToChat(
        trip.telegramChatId!,
        [
          `🏧 <b>Выплата из кассы</b>${who} — <b>${formatMoney(amount, trip.currency)}</b>`,
          `Записал ${escapeHtml(await this.actorName(tripId, actor))}`,
        ].join('\n'),
        true,
      );
    } catch (err) {
      this.logger.error(`fundPaidOut notify failed: ${(err as Error).message}`);
    }
  }

  /**
   * Обновляет закреплённое «табло баланса» в чате поездки после любой операции.
   * В отличие от текстовых уведомлений, не зависит от настройки notifyChat —
   * табло создаётся отдельной командой /board и живёт своей жизнью.
   */
  async balanceChanged(tripId: string): Promise<void> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { telegramChatId: true },
      });
      if (!trip?.telegramChatId) return;
      await this.bot.refreshBalanceBoard(trip.telegramChatId);
    } catch (err) {
      this.logger.error(`balanceChanged failed: ${(err as Error).message}`);
    }
  }

  /**
   * Имя автора действия для сообщений в чат: заданное в поездке имя участника
   * (может быть переименовано), с откатом на имя из Telegram, если участник не найден.
   */
  private async actorName(tripId: string, actor: User): Promise<string> {
    const member = await this.prisma.tripMember.findFirst({
      where: { tripId, userId: actor.id },
      select: { displayName: true },
    });
    return member?.displayName || displayNameOf(actor);
  }

  /** Поездка с привязанным чатом и включёнными уведомлениями, иначе null. */
  private async notifiableTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { settings: true },
    });
    if (!trip?.telegramChatId) return null;
    if (trip.settings?.notifyChat === false) return null;
    return trip;
  }
}
