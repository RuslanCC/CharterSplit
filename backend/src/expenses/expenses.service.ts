import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SplitType, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { computeShares, ShareInput } from '../common/money';
import { NotifyService } from '../telegram/notify.service';
import { CreateExpenseDto, ExpenseParticipantDto, UpdateExpenseDto } from './dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly notify: NotifyService,
  ) {}

  async list(tripId: string, user: User) {
    await this.access.assertMember(tripId, user);
    return this.prisma.expense.findMany({
      where: { tripId },
      orderBy: { spentAt: 'desc' },
      include: { shares: true, paidByMember: true },
    });
  }

  async get(tripId: string, expenseId: string, user: User) {
    await this.access.assertMember(tripId, user);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tripId },
      include: { shares: { include: { member: true } }, paidByMember: true },
    });
    if (!expense) throw new NotFoundException('expense not found');
    return expense;
  }

  async create(tripId: string, user: User, dto: CreateExpenseDto) {
    await this.access.assertMember(tripId, user);
    await this.assertMembersInTrip(tripId, [
      dto.paidByMemberId,
      ...(dto.participants ?? []).map((p) => p.memberId),
    ]);

    const fromFund = dto.fromFund ?? false;
    const shares = fromFund ? [] : this.buildShares(dto.splitType, dto.amount, dto.participants);

    const expense = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          tripId,
          description: dto.description.trim(),
          amount: dto.amount,
          category: dto.category ?? null,
          spentAt: dto.spentAt ? new Date(dto.spentAt) : new Date(),
          paidByMemberId: dto.paidByMemberId,
          fromFund,
          splitType: dto.splitType,
          shares: shares.length
            ? {
                create: shares.map((s) => ({
                  memberId: s.memberId,
                  shareUnits: s.shareUnits,
                  amount: s.amount,
                })),
              }
            : undefined,
        },
        include: { shares: true },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.EXPENSE_CREATED,
          entityType: 'Expense',
          entityId: expense.id,
          payload: {
            description: expense.description,
            amount: expense.amount,
            fromFund: expense.fromFund,
            splitType: expense.splitType,
          },
        },
        tx,
      );
      return expense;
    });

    // Fire-and-forget: сбой Telegram не влияет на ответ API.
    void this.notify.expenseCreated(tripId, user, {
      description: expense.description,
      amount: expense.amount,
      fromFund: expense.fromFund,
      splitType: expense.splitType,
      participantCount: expense.shares.length,
    });
    void this.notify.balanceChanged(tripId);

    return expense;
  }

  async update(tripId: string, expenseId: string, user: User, dto: UpdateExpenseDto) {
    await this.access.assertMember(tripId, user);
    const existing = await this.prisma.expense.findFirst({
      where: { id: expenseId, tripId },
      include: { shares: true },
    });
    if (!existing) throw new NotFoundException('expense not found');

    const amount = dto.amount ?? existing.amount;
    const splitType = dto.splitType ?? existing.splitType;
    const fromFund = dto.fromFund ?? existing.fromFund;
    const paidByMemberId = dto.paidByMemberId ?? existing.paidByMemberId;

    const participants: ExpenseParticipantDto[] | undefined =
      dto.participants ??
      existing.shares.map((s) => ({
        memberId: s.memberId,
        shareUnits: s.shareUnits,
        amount: s.amount,
      }));

    await this.assertMembersInTrip(tripId, [
      paidByMemberId,
      ...(participants ?? []).map((p) => p.memberId),
    ]);

    const shares = fromFund ? [] : this.buildShares(splitType, amount, participants);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      const expense = await tx.expense.update({
        where: { id: expenseId },
        data: {
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          amount,
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.spentAt !== undefined ? { spentAt: new Date(dto.spentAt) } : {}),
          paidByMemberId,
          fromFund,
          splitType,
          shares: shares.length
            ? {
                create: shares.map((s) => ({
                  memberId: s.memberId,
                  shareUnits: s.shareUnits,
                  amount: s.amount,
                })),
              }
            : undefined,
        },
        include: { shares: true },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.EXPENSE_UPDATED,
          entityType: 'Expense',
          entityId: expense.id,
          payload: { description: expense.description, amount: expense.amount },
        },
        tx,
      );
      return expense;
    });

    void this.notify.balanceChanged(tripId);

    return updated;
  }

  async remove(tripId: string, expenseId: string, user: User) {
    await this.access.assertMember(tripId, user);
    const existing = await this.prisma.expense.findFirst({
      where: { id: expenseId, tripId },
    });
    if (!existing) throw new NotFoundException('expense not found');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.expense.delete({ where: { id: expenseId } });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.EXPENSE_DELETED,
          entityType: 'Expense',
          entityId: expenseId,
          payload: { description: existing.description, amount: existing.amount },
        },
        tx,
      );
      return { id: expenseId, deleted: true };
    });

    void this.notify.expenseDeleted(tripId, user, {
      description: existing.description,
      amount: existing.amount,
    });
    void this.notify.balanceChanged(tripId);

    return result;
  }

  private buildShares(
    splitType: SplitType,
    amount: number,
    participants?: ExpenseParticipantDto[],
  ) {
    if (!participants || participants.length === 0) {
      throw new BadRequestException('participants are required unless paid from fund');
    }
    const input: ShareInput[] = participants.map((p) => ({
      memberId: p.memberId,
      shareUnits: p.shareUnits,
      amount: p.amount,
    }));
    try {
      return computeShares(splitType, amount, input);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  private async assertMembersInTrip(tripId: string, memberIds: string[]) {
    const unique = [...new Set(memberIds)];
    const count = await this.prisma.tripMember.count({
      where: { tripId, id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('some members do not belong to this trip');
    }
  }
}
