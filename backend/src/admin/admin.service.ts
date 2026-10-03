import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BalancesService } from '../trips/balances.service';
import { fillDailySeries, type DailyRow } from './daily-series';
import type { AdminTripsQueryDto, TripSort } from './dto';

const DAY_MS = 86_400_000;
const SERIES_DAYS = 30;

/** Счётчики «новых» за 1/7/30 дней. */
interface NewCounts {
  d1: number;
  d7: number;
  d30: number;
}

/**
 * Статистика по всему инстансу и отчёты по чужим поездкам для владельца бота.
 * Читает БД напрямую, без проверок членства — доступ закрыт AdminGuard.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
  ) {}

  async stats() {
    const now = new Date();
    const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const seriesFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        (SERIES_DAYS - 1) * DAY_MS,
    );

    const countNew = async (
      count: (where: { createdAt: { gte: Date } }) => Promise<number>,
    ): Promise<NewCounts> => {
      const [d1, d7, d30] = await Promise.all(
        [1, 7, 30].map((d) => count({ createdAt: { gte: since(d) } })),
      );
      return { d1, d7, d30 };
    };

    const [
      users,
      trips,
      memberships,
      expenses,
      newUsers,
      newTrips,
      newExpenses,
      byCurrency,
      active7,
      active30,
      historyDaily,
      expenseDaily,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.trip.count(),
      this.prisma.tripMember.count({ where: { userId: { not: null } } }),
      this.prisma.expense.count(),
      countNew((where) => this.prisma.user.count({ where })),
      countNew((where) => this.prisma.trip.count({ where })),
      countNew((where) => this.prisma.expense.count({ where })),
      // У каждой поездки своя валюта — суммы складываем только внутри валюты.
      this.prisma.$queryRaw<
        { currency: string; total: bigint; count: bigint; trips: bigint }[]
      >`
        SELECT t."currency" AS currency,
               COALESCE(SUM(e."amount"), 0)::bigint AS total,
               COUNT(e."id")::bigint AS count,
               COUNT(DISTINCT e."tripId")::bigint AS trips
        FROM "Expense" e
        JOIN "Trip" t ON t."id" = e."tripId"
        GROUP BY t."currency"
        ORDER BY total DESC`,
      this.activeSince(since(7)),
      this.activeSince(since(30)),
      this.prisma.$queryRaw<{ day: string; operations: bigint; trips: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*)::bigint AS operations,
               COUNT(DISTINCT "tripId")::bigint AS trips
        FROM "OperationHistory"
        WHERE "createdAt" >= ${seriesFrom}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; expenses: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*)::bigint AS expenses
        FROM "Expense"
        WHERE "createdAt" >= ${seriesFrom}
        GROUP BY 1`,
    ]);

    const rows: DailyRow[] = [
      ...historyDaily.map((r) => ({
        day: r.day,
        operations: Number(r.operations),
        activeTrips: Number(r.trips),
      })),
      ...expenseDaily.map((r) => ({ day: r.day, newExpenses: Number(r.expenses) })),
    ];

    return {
      totals: { users, trips, memberships, expenses },
      new: { users: newUsers, trips: newTrips, expenses: newExpenses },
      spentByCurrency: byCurrency.map((r) => ({
        currency: r.currency,
        total: Number(r.total),
        expenses: Number(r.count),
        trips: Number(r.trips),
      })),
      active: {
        d7: active7,
        d30: active30,
      },
      daily: fillDailySeries(rows, SERIES_DAYS, now),
      generatedAt: now.toISOString(),
    };
  }

  /** Поездки и пользователи с действиями в истории операций начиная с `from`. */
  private async activeSince(from: Date): Promise<{ trips: number; users: number }> {
    const [row] = await this.prisma.$queryRaw<{ trips: bigint; users: bigint }[]>`
      SELECT COUNT(DISTINCT "tripId")::bigint AS trips,
             COUNT(DISTINCT "actorUserId")::bigint AS users
      FROM "OperationHistory"
      WHERE "createdAt" >= ${from}`;
    return { trips: Number(row?.trips ?? 0), users: Number(row?.users ?? 0) };
  }

  async listTrips(q: AdminTripsQueryDto) {
    const sort: TripSort = q.sort ?? 'activity';
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 50;
    const search = q.q?.trim();

    const where: Prisma.TripWhereInput = search
      ? { title: { contains: search, mode: 'insensitive' } }
      : {};

    // Поездок немного — собираем агрегаты целиком и сортируем в памяти
    // (сортировка по сумме/активности не выражается одним findMany).
    const [trips, expenseAgg, lastActivity] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        select: {
          id: true,
          title: true,
          currency: true,
          telegramChatId: true,
          createdAt: true,
          members: {
            select: {
              displayName: true,
              role: true,
              isActive: true,
              userId: true,
              user: { select: { username: true } },
            },
          },
        },
      }),
      this.prisma.expense.groupBy({
        by: ['tripId'],
        where: { trip: where },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.operationHistory.groupBy({
        by: ['tripId'],
        where: { trip: where },
        _max: { createdAt: true },
      }),
    ]);

    const spentBy = new Map(expenseAgg.map((a) => [a.tripId, a]));
    const lastBy = new Map(lastActivity.map((a) => [a.tripId, a._max.createdAt]));

    const rows = trips.map((t) => {
      const owner = t.members.find((m) => m.role === 'OWNER');
      const agg = spentBy.get(t.id);
      const last = lastBy.get(t.id) ?? null;
      return {
        id: t.id,
        title: t.title,
        currency: t.currency,
        telegramChatId: t.telegramChatId,
        createdAt: t.createdAt.toISOString(),
        lastActivityAt: (last ?? t.createdAt).toISOString(),
        owner: owner
          ? { displayName: owner.displayName, username: owner.user?.username ?? null }
          : null,
        members: t.members.filter((m) => m.isActive).length,
        users: t.members.filter((m) => m.isActive && m.userId).length,
        expenseCount: agg?._count._all ?? 0,
        totalSpent: agg?._sum.amount ?? 0,
      };
    });

    const key: Record<TripSort, (r: (typeof rows)[number]) => number> = {
      activity: (r) => Date.parse(r.lastActivityAt),
      created: (r) => Date.parse(r.createdAt),
      spent: (r) => r.totalSpent,
    };
    rows.sort((a, b) => key[sort](b) - key[sort](a));

    return {
      items: rows.slice(offset, offset + limit),
      total: rows.length,
    };
  }

  async tripReport(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        currency: true,
        telegramChatId: true,
        createdAt: true,
        members: {
          orderBy: { joinedAt: 'asc' },
          select: {
            id: true,
            displayName: true,
            telegramUsername: true,
            role: true,
            isActive: true,
            joinedAt: true,
            user: { select: { username: true, telegramUserId: true } },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('trip not found');

    const [summary, balances, expenses, history] = await Promise.all([
      this.balances.summary(id),
      this.balances.compute(id),
      this.prisma.expense.findMany({
        where: { tripId: id },
        orderBy: { spentAt: 'desc' },
        take: 20,
        select: {
          id: true,
          description: true,
          amount: true,
          category: true,
          spentAt: true,
          fromFund: true,
          paidByMember: { select: { displayName: true } },
        },
      }),
      this.prisma.operationHistory.findMany({
        where: { tripId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          payload: true,
          createdAt: true,
          actor: { select: { firstName: true, lastName: true, username: true } },
        },
      }),
    ]);

    const balanceBy = new Map(balances.members.map((b) => [b.memberId, b]));

    return {
      trip: {
        id: trip.id,
        title: trip.title,
        currency: trip.currency,
        telegramChatId: trip.telegramChatId,
        createdAt: trip.createdAt,
      },
      members: trip.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        username: m.user?.username ?? m.telegramUsername ?? null,
        telegramUserId: m.user?.telegramUserId ?? null,
        role: m.role,
        isActive: m.isActive,
        joinedAt: m.joinedAt,
        balance: balanceBy.get(m.id)?.balance ?? 0,
      })),
      summary,
      transfers: balances.transfers,
      fund: balances.fund,
      expenses: expenses.map((e) => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        category: e.category,
        spentAt: e.spentAt,
        fromFund: e.fromFund,
        paidBy: e.paidByMember.displayName,
      })),
      history,
    };
  }
}
