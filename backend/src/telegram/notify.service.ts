import { Injectable, Logger } from '@nestjs/common';
import type { SplitType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot.service';
import { displayNameOf, formatMoney, escapeHtml } from '../common/format';

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

  async expenseCreated(
    tripId: string,
    actor: User,
    e: {
      description: string;
      amount: number;
      fromFund: boolean;
      splitType: SplitType;
      participantCount: number;
    },
  ): Promise<void> {
    try {
      const trip = await this.notifiableTrip(tripId);
      if (!trip) return;
      const money = formatMoney(e.amount, trip.currency);
      const how = e.fromFund
        ? 'оплачено из кассы'
        : e.splitType === 'EQUAL'
          ? `делится поровну на ${e.participantCount}`
          : `делится ${SPLIT_NOTE[e.splitType]}`;
      await this.bot.sendToChat(
        trip.telegramChatId!,
        [
          `💸 <b>${escapeHtml(e.description)}</b> — <b>${money}</b>`,
          `Добавил ${escapeHtml(await this.actorName(tripId, actor))} · ${how}`,
        ].join('\n'),
        true,
      );
    } catch (err) {
      this.logger.error(`expenseCreated notify failed: ${(err as Error).message}`);
    }
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
