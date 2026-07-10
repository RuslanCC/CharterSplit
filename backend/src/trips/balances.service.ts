import { Injectable } from '@nestjs/common';
import { FundTxnType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { settle } from '../common/money';
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
    const [members, expenses, fundTxns] = await Promise.all([
      this.prisma.tripMember.findMany({ where: { tripId } }),
      this.prisma.expense.findMany({
        where: { tripId, fromFund: false },
        include: { shares: true },
      }),
      this.prisma.fundTransaction.findMany({ where: { tripId } }),
    ]);

    const paid: Record<string, number> = {};
    const owed: Record<string, number> = {};
    for (const m of members) {
      paid[m.id] = 0;
      owed[m.id] = 0;
    }

    for (const e of expenses) {
      paid[e.paidByMemberId] = (paid[e.paidByMemberId] ?? 0) + e.amount;
      for (const s of e.shares) {
        owed[s.memberId] = (owed[s.memberId] ?? 0) + s.amount;
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

    // Баланс кассы: взносы − выплаты − оплаты расходов из кассы.
    let fundBalance = 0;
    for (const t of fundTxns) {
      if (t.type === FundTxnType.CONTRIBUTION) fundBalance += t.amount;
      else if (t.type === FundTxnType.PAYOUT) fundBalance -= t.amount;
      else if (t.type === FundTxnType.ADJUSTMENT) fundBalance += t.amount;
    }
    const fundExpenses = await this.prisma.expense.aggregate({
      where: { tripId, fromFund: true },
      _sum: { amount: true },
    });
    fundBalance -= fundExpenses._sum.amount ?? 0;

    // Обогащаем переводы именами.
    const nameById = new Map(members.map((m) => [m.id, m.displayName]));
    const namedTransfers = transfers.map((t) => ({
      ...t,
      fromName: nameById.get(t.fromMemberId) ?? '?',
      toName: nameById.get(t.toMemberId) ?? '?',
    }));

    return {
      members: memberBalances,
      transfers: namedTransfers,
      fund: { balance: fundBalance },
    };
  }
}
