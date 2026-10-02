import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { HistoryActionType } from '../common/history-actions';
import type { HistoryQueryDto } from './dto';

export interface RecordInput {
  tripId: string;
  actorUserId?: string | null;
  action: HistoryActionType;
  entityType: string;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Записывает операцию в историю. Принимает опциональный транзакционный клиент,
   * чтобы аудит писался в той же транзакции, что и само действие.
   */
  async record(input: RecordInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.operationHistory.create({
      data: {
        tripId: input.tripId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        payload: input.payload ?? Prisma.JsonNull,
      },
    });
  }

  /** Лента истории поездки с фильтрами и cursor-пагинацией. */
  async list(tripId: string, q: HistoryQueryDto) {
    const take = Math.min(Math.max(Number(q.take) || 30, 1), 100);

    const where: Prisma.OperationHistoryWhereInput = { tripId };
    if (q.action) where.action = q.action;
    if (q.memberId) {
      // участник → его userId; фильтруем историю по действиям этого пользователя
      const member = await this.prisma.tripMember.findFirst({
        where: { id: q.memberId, tripId },
        select: { userId: true },
      });
      where.actorUserId = member?.userId ?? '__none__';
    }
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(q.from);
      if (q.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(q.to);
    }

    const items = await this.prisma.operationHistory.findMany({
      where,
      // id — тай-брейкер: при равных createdAt курсорная пагинация не теряет строк.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, username: true },
        },
      },
    });

    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;

    // Имя автора берём из записи участника этой поездки (может быть переименовано),
    // чтобы история показывала заданное имя, а не имя из Telegram.
    const actorIds = [
      ...new Set(page.map((i) => i.actorUserId).filter((id): id is string => !!id)),
    ];
    const memberNames = actorIds.length
      ? await this.prisma.tripMember.findMany({
          where: { tripId, userId: { in: actorIds } },
          select: { userId: true, displayName: true },
        })
      : [];
    const nameByUserId = new Map(
      memberNames.map((m) => [m.userId as string, m.displayName]),
    );

    return {
      items: page.map((i) => ({
        ...i,
        actorName: i.actorUserId ? (nameByUserId.get(i.actorUserId) ?? null) : null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
