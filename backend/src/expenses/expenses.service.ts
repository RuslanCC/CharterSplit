import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SplitType, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { computeSelfShares, computeShares, MAX_MINOR, ShareInput } from '../common/money';
import { formatMoney } from '../common/format';
import { NotifyService } from '../telegram/notify.service';
import {
  ClaimShareDto,
  CreateExpenseDto,
  ExpenseParticipantDto,
  UpdateExpenseDto,
} from './dto';

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
      include: {
        shares: { include: { member: true }, orderBy: { id: 'asc' } },
        paidByMember: true,
      },
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
    // dto.amount — база (счёт без чаевых); доли считаются от базы, а в БД
    // amount хранится как итог (база + чаевые). Чаевые есть только у личных расходов.
    const tip = fromFund ? 0 : (dto.tipAmount ?? 0);
    this.assertTotalFits(dto.amount, tip);
    const shares = fromFund
      ? []
      : this.buildShares(dto.splitType, dto.amount, dto.participants);

    const expense = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          tripId,
          description: dto.description.trim(),
          amount: dto.amount + tip,
          tipAmount: tip,
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
                  claimed: s.claimed ?? null,
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
            tipAmount: expense.tipAmount,
            fromFund: expense.fromFund,
            splitType: expense.splitType,
          },
        },
        tx,
      );
      return expense;
    });

    // Fire-and-forget: сбой Telegram не влияет на ответ API.
    void this.notify.expenseCreated(tripId, user, expense.id);
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

    const splitType = dto.splitType ?? existing.splitType;
    const fromFund = dto.fromFund ?? existing.fromFund;
    const paidByMemberId = dto.paidByMemberId ?? existing.paidByMemberId;
    // База (без чаевых): из dto.amount либо восстанавливается из хранимого итога.
    const base = dto.amount ?? existing.amount - existing.tipAmount;
    const tip = fromFund ? 0 : (dto.tipAmount ?? existing.tipAmount);
    this.assertTotalFits(base, tip);

    const participants: ExpenseParticipantDto[] | undefined =
      dto.participants ??
      existing.shares.map((s) => ({
        memberId: s.memberId,
        shareUnits: s.shareUnits,
        amount: s.amount,
        claimed: s.claimed,
      }));

    await this.assertMembersInTrip(tripId, [
      paidByMemberId,
      ...(participants ?? []).map((p) => p.memberId),
    ]);

    const shares = fromFund ? [] : this.buildShares(splitType, base, participants);

    // Закрытие «открытого счёта»; у других способов деления closedAt не нужен.
    let closedAt: Date | null = null;
    if (splitType === SplitType.SELF && !fromFund) {
      closedAt =
        dto.closed === undefined
          ? existing.closedAt
          : dto.closed
            ? (existing.closedAt ?? new Date())
            : null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      const expense = await tx.expense.update({
        where: { id: expenseId },
        data: {
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          amount: base + tip,
          tipAmount: tip,
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.spentAt !== undefined ? { spentAt: new Date(dto.spentAt) } : {}),
          paidByMemberId,
          fromFund,
          splitType,
          closedAt,
          shares: shares.length
            ? {
                create: shares.map((s) => ({
                  memberId: s.memberId,
                  shareUnits: s.shareUnits,
                  amount: s.amount,
                  claimed: s.claimed ?? null,
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

    // Обновляем карточку расхода в чате на месте и пересчитываем табло балансов.
    void this.notify.expenseUpdated(tripId, user, updated.id);
    void this.notify.balanceChanged(tripId);

    return updated;
  }

  /**
   * «Открытый счёт» (SELF): участник вносит свою часть (amount = null — убирает).
   * Остаток чека пересчитывается и делится поровну между всеми участниками.
   * Участник поездки, которого не было в расходе, добавляется в него.
   */
  async claim(
    tripId: string,
    expenseId: string,
    memberId: string,
    user: User,
    dto: ClaimShareDto,
  ) {
    await this.access.assertMember(tripId, user);
    await this.assertMembersInTrip(tripId, [memberId]);
    const claimed = dto.amount ?? null;

    await this.prisma.$transaction(async (tx) => {
      // Блокируем строку расхода: одновременные вводы пересчитывают доли по очереди.
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${expenseId} AND "tripId" = ${tripId} FOR UPDATE`;
      const existing = await tx.expense.findFirst({
        where: { id: expenseId, tripId },
        include: {
          shares: { orderBy: { id: 'asc' } },
          trip: { select: { currency: true } },
        },
      });
      if (!existing) throw new NotFoundException('expense not found');
      if (existing.splitType !== SplitType.SELF || existing.fromFund) {
        throw new ConflictException('В этом расходе части не вносятся по отдельности');
      }
      if (existing.closedAt) throw new ConflictException('Счёт уже закрыт');

      const participants: ShareInput[] = existing.shares.map((s) => ({
        memberId: s.memberId,
        claimed: s.memberId === memberId ? claimed : s.claimed,
      }));
      if (!participants.some((p) => p.memberId === memberId)) {
        participants.push({ memberId, claimed });
      }

      const base = existing.amount - existing.tipAmount;
      const others = participants
        .filter((p) => p.memberId !== memberId)
        .reduce((sum, p) => sum + (p.claimed ?? 0), 0);
      if ((claimed ?? 0) + others > base) {
        throw new BadRequestException(
          `Больше суммы чека: можно внести не больше ${formatMoney(base - others, existing.trip.currency)}`,
        );
      }

      // Доли обновляем на месте (их порядок задаёт распределение остатка чаевых).
      for (const s of computeSelfShares(base, participants)) {
        await tx.expenseShare.upsert({
          where: { expenseId_memberId: { expenseId, memberId: s.memberId } },
          update: { amount: s.amount, claimed: s.claimed ?? null },
          create: {
            expenseId,
            memberId: s.memberId,
            shareUnits: 1,
            amount: s.amount,
            claimed: s.claimed ?? null,
          },
        });
      }
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.EXPENSE_SHARE_CLAIMED,
          entityType: 'Expense',
          entityId: expenseId,
          payload: {
            description: existing.description,
            amount: claimed ?? 0,
            memberId,
            cleared: claimed === null,
          },
        },
        tx,
      );
    });

    void this.notify.expenseUpdated(tripId, user, expenseId);
    void this.notify.balanceChanged(tripId);

    return this.get(tripId, expenseId, user);
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
      claimed: p.claimed,
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

  /** База + чаевые хранятся одним Int — не даём переполнить колонку. */
  private assertTotalFits(base: number, tip: number): void {
    if (base + tip > MAX_MINOR) {
      throw new BadRequestException('amount with tip is too large');
    }
  }
}
