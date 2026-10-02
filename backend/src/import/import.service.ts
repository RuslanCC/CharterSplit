import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SplitType, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { buildCoverageResolver } from '../common/coverage';
import { NotifyService } from '../telegram/notify.service';
import { ImportRowDto, SplitwiseImportDto } from './dto';

export interface ImportResult {
  imported: number;
  createdGuests: { id: string; displayName: string }[];
  skipped: { description: string; date: string; reason: string }[];
  warnings: string[];
}

interface PreparedShare {
  memberId: string;
  amount: number;
}

// Допуск на округления Splitwise: пара центов на участника.
const ROUNDING_TOLERANCE_PER_PARTICIPANT = 2;
const MAX_ROWS = 2000;

/**
 * Импорт экспорта Splitwise (CSV). Каждая строка — расход; значение в колонке участника —
 * чистый эффект (заплатил − его доля). Доли восстанавливаются как EXACT-суммы.
 * Семейные связи (TripMember.coveredByMemberId) применяются до расчёта: чистые эффекты
 * покрываемого участника переносятся на покрывающего, поэтому и долг, и оплата
 * записываются на него.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly notify: NotifyService,
  ) {}

  async importSplitwise(
    tripId: string,
    user: User,
    dto: SplitwiseImportDto,
  ): Promise<ImportResult> {
    await this.access.assertMember(tripId, user);
    if (dto.rows.length > MAX_ROWS) {
      throw new BadRequestException(`too many rows (max ${MAX_ROWS})`);
    }

    for (const m of dto.mappings) {
      if (!m.memberId === !m.guestName) {
        throw new BadRequestException(
          `mapping for "${m.csvName}" must specify exactly one of memberId / guestName`,
        );
      }
    }
    const mappedIds = dto.mappings
      .map((m) => m.memberId)
      .filter((id): id is string => !!id);
    if (new Set(mappedIds).size !== mappedIds.length) {
      throw new BadRequestException('two CSV participants are mapped to the same member');
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { settings: true },
    });
    if (
      dto.mappings.some((m) => m.guestName) &&
      trip.settings?.allowGuestMembers === false
    ) {
      throw new ForbiddenException('guest members are disabled for this trip');
    }
    const members = await this.prisma.tripMember.findMany({ where: { tripId } });
    const memberById = new Map(members.map((m) => [m.id, m]));
    for (const id of mappedIds) {
      if (!memberById.has(id)) {
        throw new BadRequestException('some mapped members do not belong to this trip');
      }
    }

    const result: ImportResult = {
      imported: 0,
      createdGuests: [],
      skipped: [],
      warnings: [],
    };

    const foreignCurrencies = new Set(
      dto.rows.map((r) => r.currency.toUpperCase()).filter((c) => c !== trip.currency),
    );
    if (foreignCurrencies.size > 0) {
      result.warnings.push(
        `Валюта файла (${[...foreignCurrencies].join(', ')}) отличается от валюты поездки (${trip.currency}); суммы импортированы без конвертации`,
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Гости для несопоставленных участников CSV.
        const memberByCsvName = new Map<string, string>();
        for (const m of dto.mappings) {
          if (m.memberId) {
            memberByCsvName.set(m.csvName, m.memberId);
          } else {
            const guest = await tx.tripMember.create({
              data: { tripId, displayName: m.guestName!.trim(), userId: null },
            });
            memberById.set(guest.id, guest);
            memberByCsvName.set(m.csvName, guest.id);
            result.createdGuests.push({ id: guest.id, displayName: guest.displayName });
            await this.history.record(
              {
                tripId,
                actorUserId: user.id,
                action: HistoryAction.MEMBER_ADDED,
                entityType: 'TripMember',
                entityId: guest.id,
                payload: { displayName: guest.displayName, guest: true, import: true },
              },
              tx,
            );
          }
        }

        // 2. Разрешение семейных связей: участник → конечный покрывающий.
        // (включая только что созданных гостей — memberById уже пополнен)
        const effectiveId = buildCoverageResolver([...memberById.values()]);

        // 3. Строки — в хронологическом порядке.
        const rows = [...dto.rows].sort((a, b) => a.date.localeCompare(b.date));
        for (const row of rows) {
          const prepared = this.prepareRow(row, memberByCsvName, effectiveId, result);
          for (const exp of prepared) {
            await tx.expense.create({
              data: {
                tripId,
                description: exp.description,
                amount: exp.amount,
                category: row.category ?? null,
                spentAt: this.spentAtOf(row.date),
                paidByMemberId: exp.paidByMemberId,
                fromFund: false,
                splitType: SplitType.EXACT,
                shares: {
                  create: exp.shares.map((s) => ({
                    memberId: s.memberId,
                    shareUnits: 1,
                    amount: s.amount,
                  })),
                },
              },
            });
            result.imported += 1;
          }
        }

        await this.history.record(
          {
            tripId,
            actorUserId: user.id,
            action: HistoryAction.EXPENSES_IMPORTED,
            entityType: 'Trip',
            entityId: tripId,
            payload: {
              source: 'splitwise',
              imported: result.imported,
              skipped: result.skipped.length,
              createdGuests: result.createdGuests.length,
            },
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );

    // Fire-and-forget: обновить закреплённое табло баланса в чате.
    void this.notify.balanceChanged(tripId);
    return result;
  }

  /** Восстанавливает расход(ы) из строки Splitwise. Пустой массив — строка пропущена. */
  private prepareRow(
    row: ImportRowDto,
    memberByCsvName: Map<string, string>,
    effectiveId: (id: string) => string,
    result: ImportResult,
  ): {
    description: string;
    amount: number;
    paidByMemberId: string;
    shares: PreparedShare[];
  }[] {
    const skip = (reason: string) => {
      result.skipped.push({ description: row.description, date: row.date, reason });
      return [];
    };

    // Чистые эффекты по конечным участникам (семейное покрытие схлопывает членов семьи).
    const nets = new Map<string, number>();
    for (const n of row.nets) {
      const memberId = memberByCsvName.get(n.csvName);
      if (!memberId) return skip(`нет сопоставления для «${n.csvName}»`);
      const id = effectiveId(memberId);
      nets.set(id, (nets.get(id) ?? 0) + n.amount);
    }
    for (const [id, amount] of nets) if (amount === 0) nets.delete(id);
    if (nets.size === 0) return skip('нет участников с ненулевыми долями');

    const positives = [...nets].filter(([, a]) => a > 0);
    const negatives = [...nets].filter(([, a]) => a < 0);
    if (positives.length === 0) return skip('не удалось определить плательщика');

    const tolerance = ROUNDING_TOLERANCE_PER_PARTICIPANT * (nets.size + 1);

    if (positives.length === 1) {
      // Обычный случай: один плательщик. Доля должника = −net, доля плательщика = cost − net.
      const [payerId, payerNet] = positives[0];
      const shares: PreparedShare[] = negatives.map(([memberId, a]) => ({
        memberId,
        amount: -a,
      }));
      const payerShare = row.cost - payerNet;
      if (payerShare < -tolerance) {
        return skip('доля плательщика отрицательная — строка не согласована');
      }
      if (payerShare > 0) shares.push({ memberId: payerId, amount: payerShare });

      const diff = row.cost - shares.reduce((s, x) => s + x.amount, 0);
      if (Math.abs(diff) > tolerance) {
        return skip('сумма долей не сходится с суммой расхода');
      }
      if (diff !== 0) {
        if (shares.length === 0) {
          shares.push({ memberId: payerId, amount: diff });
        } else {
          // корректировка округления — на наибольшую долю
          const largest = shares.reduce((a, b) => (b.amount > a.amount ? b : a));
          largest.amount += diff;
          if (largest.amount < 0) return skip('сумма долей не сходится с суммой расхода');
        }
      }
      return [
        {
          description: row.description,
          amount: row.cost,
          paidByMemberId: payerId,
          shares: shares.filter((s) => s.amount > 0),
        },
      ];
    }

    // Несколько плательщиков: точные доли не восстановимы из экспорта. Разбиваем на
    // расход на каждого плательщика (сумма = его переплата), долги — пропорционально.
    if (negatives.length === 0) return skip('несколько плательщиков без должников');
    result.warnings.push(
      `«${row.description}» (${row.date}): несколько плательщиков — расход разбит на ${positives.length} части пропорционально`,
    );
    const totalOwed = negatives.reduce((s, [, a]) => s - a, 0);
    return positives.map(([payerId, paid]) => {
      const raw = negatives.map(([, a]) => (paid * -a) / totalOwed);
      const amounts = raw.map((r) => Math.floor(r));
      let remainder = paid - amounts.reduce((s, x) => s + x, 0);
      const order = raw
        .map((r, i) => ({ i, frac: r - Math.floor(r) }))
        .sort((a, b) => b.frac - a.frac);
      for (const { i } of order) {
        if (remainder <= 0) break;
        amounts[i] += 1;
        remainder -= 1;
      }
      return {
        description: `${row.description} (совместная оплата)`,
        amount: paid,
        paidByMemberId: payerId,
        shares: negatives
          .map(([memberId], i) => ({ memberId, amount: amounts[i] }))
          .filter((s) => s.amount > 0),
      };
    });
  }

  private spentAtOf(date: string): Date {
    // В экспорте только дата — фиксируем полдень UTC, чтобы день не «уплывал» в часовых поясах.
    return date.length > 10 ? new Date(date) : new Date(`${date}T12:00:00.000Z`);
  }
}
