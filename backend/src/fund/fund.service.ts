import { BadRequestException, Injectable } from '@nestjs/common';
import { FundTxnType, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { NotifyService } from '../telegram/notify.service';
import { FundAdjustDto, FundTxnDto } from './dto';

@Injectable()
export class FundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly notify: NotifyService,
  ) {}

  /** Баланс кассы + леджер движений. */
  async getFund(tripId: string, user: User) {
    await this.access.assertMember(tripId, user);
    const [txns, fundExpenses] = await Promise.all([
      this.prisma.fundTransaction.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
        include: { member: true },
      }),
      this.prisma.expense.findMany({
        where: { tripId, fromFund: true },
        orderBy: { spentAt: 'desc' },
        select: { id: true, description: true, amount: true, spentAt: true },
      }),
    ]);

    let balance = 0;
    for (const t of txns) {
      if (t.type === FundTxnType.CONTRIBUTION) balance += t.amount;
      else if (t.type === FundTxnType.PAYOUT) balance -= t.amount;
      else balance += t.amount; // ADJUSTMENT (может быть отрицательным)
    }
    const spentFromFund = fundExpenses.reduce((s, e) => s + e.amount, 0);
    balance -= spentFromFund;

    return {
      balance,
      totals: {
        contributions: txns
          .filter((t) => t.type === FundTxnType.CONTRIBUTION)
          .reduce((s, t) => s + t.amount, 0),
        payouts: txns
          .filter((t) => t.type === FundTxnType.PAYOUT)
          .reduce((s, t) => s + t.amount, 0),
        spentFromFund,
      },
      transactions: txns,
      fundExpenses,
    };
  }

  async contribute(tripId: string, user: User, dto: FundTxnDto) {
    return this.createTxn(
      tripId,
      user,
      FundTxnType.CONTRIBUTION,
      dto.amount,
      dto.memberId,
      dto.note,
      HistoryAction.FUND_CONTRIBUTED,
    );
  }

  async payout(tripId: string, user: User, dto: FundTxnDto) {
    return this.createTxn(
      tripId,
      user,
      FundTxnType.PAYOUT,
      dto.amount,
      dto.memberId,
      dto.note,
      HistoryAction.FUND_PAID_OUT,
    );
  }

  async adjust(tripId: string, user: User, dto: FundAdjustDto) {
    if (dto.delta === 0) throw new BadRequestException('delta must be non-zero');
    return this.createTxn(
      tripId,
      user,
      FundTxnType.ADJUSTMENT,
      dto.delta,
      undefined,
      dto.note,
      HistoryAction.FUND_ADJUSTED,
    );
  }

  private async createTxn(
    tripId: string,
    user: User,
    type: FundTxnType,
    amount: number,
    memberId: string | undefined,
    note: string | undefined,
    action: (typeof HistoryAction)[keyof typeof HistoryAction],
  ) {
    await this.access.assertMember(tripId, user);
    let memberName: string | null = null;
    if (memberId) {
      const member = await this.access.assertMemberInTrip(tripId, memberId);
      memberName = member.displayName;
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.fundTransaction.create({
        data: {
          tripId,
          memberId: memberId ?? null,
          userId: user.id,
          type,
          amount,
          note: note ?? null,
        },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action,
          entityType: 'FundTransaction',
          entityId: txn.id,
          payload: { type, amount, memberId: memberId ?? null } as Prisma.InputJsonValue,
        },
        tx,
      );
      return txn;
    });

    // Fire-and-forget: сбой Telegram не влияет на ответ API.
    if (type === FundTxnType.CONTRIBUTION) {
      void this.notify.fundContributed(tripId, user, memberName, amount);
    } else if (type === FundTxnType.PAYOUT) {
      void this.notify.fundPaidOut(tripId, user, memberName, amount);
    }

    return result;
  }
}
