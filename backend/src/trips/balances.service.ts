import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeTipShares, fundBalance, settle } from '../common/money';
import { buildCoverageResolver } from '../common/coverage';

export interface MemberBalance {
  memberId: string;
  displayName: string;
  isActive: boolean;
  paid: number; // сколько внёс за расходы как плательщик (лично)
  owed: number; // сумма его долей (лично)
  balance: number; // итоговый эффективный баланс (с учётом семейного покрытия)
  coveredByMemberId: string | null; // прямая семейная связь
  effectiveMemberId: string; // конечный покрывающий (сам участник, если не покрыт)
}

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Считает балансы участников, взаиморасчёты и баланс кассы.
   * Семейное покрытие применяется на этапе расчёта: чистый эффект (paid − owed)
   * покрываемого участника переносится конечному покрывающему. Доли в БД остаются
   * на фактическом участнике, поэтому связь можно менять задним числом.
   */
  async compute(tripId: string) {
    const [members, expenses, fundTxns, settlements] = await Promise.all([
      this.prisma.tripMember.findMany({ where: { tripId } }),
      this.prisma.expense.findMany({
        where: { tripId, fromFund: false },
        // Порядок долей задаёт, кому достанется остаток от чаевых — фиксируем его.
        include: { shares: { orderBy: { id: 'asc' } } },
      }),
      this.prisma.fundTransaction.findMany({ where: { tripId } }),
      this.prisma.settlement.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const paid: Record<string, number> = {};
    const owed: Record<string, number> = {};
    for (const m of members) {
      paid[m.id] = 0;
      owed[m.id] = 0;
    }

    for (const e of expenses) {
      // e.amount — итог (база + чаевые); доли хранятся без чаевых, поэтому
      // чаевые распределяются поровну между участниками расхода здесь.
      paid[e.paidByMemberId] = (paid[e.paidByMemberId] ?? 0) + e.amount;
      for (const s of e.shares) {
        owed[s.memberId] = (owed[s.memberId] ?? 0) + s.amount;
      }
      if (e.tipAmount > 0) {
        const tips = computeTipShares(
          e.tipAmount,
          e.shares.map((s) => s.memberId),
        );
        for (const [mid, amt] of Object.entries(tips)) {
          owed[mid] = (owed[mid] ?? 0) + amt;
        }
      }
    }

    // Семейное покрытие: нетто каждого участника уходит его конечному покрывающему.
    const resolve = buildCoverageResolver(members);
    const effectiveBalance: Record<string, number> = {};
    for (const m of members) {
      const eff = resolve(m.id);
      effectiveBalance[eff] =
        (effectiveBalance[eff] ?? 0) + (paid[m.id] ?? 0) - (owed[m.id] ?? 0);
    }

    // Погашения: должник заплатил кредитору → его баланс растёт к нулю,
    // кредитору должны меньше. Учитываем на эффективных участниках (покрытие).
    for (const s of settlements) {
      const from = resolve(s.fromMemberId);
      const to = resolve(s.toMemberId);
      effectiveBalance[from] = (effectiveBalance[from] ?? 0) + s.amount;
      effectiveBalance[to] = (effectiveBalance[to] ?? 0) - s.amount;
    }

    const memberBalances: MemberBalance[] = members.map((m) => {
      const eff = resolve(m.id);
      return {
        memberId: m.id,
        displayName: m.displayName,
        isActive: m.isActive,
        paid: paid[m.id] ?? 0,
        owed: owed[m.id] ?? 0,
        // У покрываемого нетто уехало покрывающему → его собственный баланс 0.
        balance: eff === m.id ? (effectiveBalance[m.id] ?? 0) : 0,
        coveredByMemberId: m.coveredByMemberId ?? null,
        effectiveMemberId: eff,
      };
    });

    const transfers = settle(effectiveBalance);

    const fundExpenses = await this.prisma.expense.aggregate({
      where: { tripId, fromFund: true },
      _sum: { amount: true },
    });
    const fundBal = fundBalance(fundTxns, fundExpenses._sum.amount ?? 0);

    // Общая сумма расходов поездки: личные + оплаченные из кассы.
    const totalSpent =
      expenses.reduce((sum, e) => sum + e.amount, 0) + (fundExpenses._sum.amount ?? 0);

    // Обогащаем переводы именами.
    const nameById = new Map(members.map((m) => [m.id, m.displayName]));
    const namedTransfers = transfers.map((t) => ({
      ...t,
      fromName: nameById.get(t.fromMemberId) ?? '?',
      toName: nameById.get(t.toMemberId) ?? '?',
    }));

    const namedSettlements = settlements.map((s) => ({
      ...s,
      fromName: nameById.get(s.fromMemberId) ?? '?',
      toName: nameById.get(s.toMemberId) ?? '?',
    }));

    return {
      members: memberBalances,
      transfers: namedTransfers,
      settlements: namedSettlements,
      fund: { balance: fundBal },
      totalSpent,
    };
  }

  /** Итоги поездки: суммы, число расходов, длительность, разбивка по плательщикам. */
  async summary(tripId: string) {
    const [members, expenses] = await Promise.all([
      this.prisma.tripMember.findMany({ where: { tripId } }),
      this.prisma.expense.findMany({
        where: { tripId },
        select: {
          amount: true,
          fromFund: true,
          spentAt: true,
          paidByMemberId: true,
        },
      }),
    ]);

    const nameById = new Map(members.map((m) => [m.id, m.displayName]));

    let spentFromFund = 0;
    let spentPersonal = 0;
    const paidByMember: Record<string, number> = {};
    let firstAt: Date | null = null;
    let lastAt: Date | null = null;

    for (const e of expenses) {
      if (e.fromFund) {
        spentFromFund += e.amount;
      } else {
        spentPersonal += e.amount;
        paidByMember[e.paidByMemberId] = (paidByMember[e.paidByMemberId] ?? 0) + e.amount;
      }
      if (!firstAt || e.spentAt < firstAt) firstAt = e.spentAt;
      if (!lastAt || e.spentAt > lastAt) lastAt = e.spentAt;
    }

    const totalSpent = spentFromFund + spentPersonal;

    // Календарный размах в днях (включительно), минимум 1 — без деления на ноль.
    let days = 1;
    if (firstAt && lastAt) {
      const startOfDay = (d: Date) =>
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      days = Math.floor((startOfDay(lastAt) - startOfDay(firstAt)) / 86_400_000) + 1;
      if (days < 1) days = 1;
    }

    const perMember = Object.entries(paidByMember)
      .map(([memberId, paid]) => ({
        memberId,
        displayName: nameById.get(memberId) ?? '?',
        paid,
      }))
      .filter((m) => m.paid > 0)
      .sort((a, b) => b.paid - a.paid);

    return {
      totalSpent,
      spentFromFund,
      spentPersonal,
      expenseCount: expenses.length,
      firstExpenseAt: firstAt ? firstAt.toISOString() : null,
      lastExpenseAt: lastAt ? lastAt.toISOString() : null,
      days,
      avgPerDay: Math.round(totalSpent / days),
      perMember,
    };
  }
}
