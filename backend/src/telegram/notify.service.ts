import { Injectable, Logger } from '@nestjs/common';
import type { SplitType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot.service';
import { displayNameOf, formatMoney } from '../common/format';

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
        ? 'из кассы'
        : e.splitType === 'EQUAL'
          ? `поровну на ${e.participantCount}`
          : SPLIT_NOTE[e.splitType];
      await this.bot.sendToChat(
        trip.telegramChatId!,
        `💸 ${displayNameOf(actor)} добавил «${e.description}» — ${money} (${how})`,
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
        `🗑 ${displayNameOf(actor)} удалил расход «${e.description}» — ${formatMoney(e.amount, trip.currency)}`,
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
      const who = memberName ? ` от ${memberName}` : '';
      await this.bot.sendToChat(
        trip.telegramChatId!,
        `🏦 Взнос в кассу${who}: ${formatMoney(amount, trip.currency)} (внёс ${displayNameOf(actor)})`,
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
      const who = memberName ? ` — ${memberName}` : '';
      await this.bot.sendToChat(
        trip.telegramChatId!,
        `🏧 Выплата из кассы${who}: ${formatMoney(amount, trip.currency)} (записал ${displayNameOf(actor)})`,
      );
    } catch (err) {
      this.logger.error(`fundPaidOut notify failed: ${(err as Error).message}`);
    }
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
