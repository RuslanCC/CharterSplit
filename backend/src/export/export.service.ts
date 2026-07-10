import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Экспорт расходов поездки в CSV, совместимый с форматом Splitwise
 * (Date,Description,Category,Cost,Currency,<участники…>). Значение в колонке
 * участника — чистый эффект строки (заплатил − его доля), со знаком.
 * Файл переиспользуется импортёром (ImportService) для обратной загрузки.
 */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildCsv(tripId: string): Promise<{ filename: string; content: string }> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('trip not found');

    const [members, expenses, settlements] = await Promise.all([
      this.prisma.tripMember.findMany({
        where: { tripId },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { tripId },
        orderBy: { spentAt: 'asc' },
        include: { shares: true },
      }),
      this.prisma.settlement.findMany({
        where: { tripId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const memberIndex = new Map(members.map((m, i) => [m.id, i]));
    const header = [
      'Date',
      'Description',
      'Category',
      'Cost',
      'Currency',
      ...members.map((m) => m.displayName),
    ];
    const rows: string[][] = [header];

    for (const e of expenses) {
      const cells = new Array<string>(members.length).fill('');
      if (e.fromFund) {
        // Оплата из кассы: личных долей нет — колонки участников пустые.
      } else {
        for (const m of members) {
          const idx = memberIndex.get(m.id)!;
          const paid = e.paidByMemberId === m.id ? e.amount : 0;
          const share = e.shares.find((s) => s.memberId === m.id)?.amount ?? 0;
          const net = paid - share;
          cells[idx] = net === 0 ? '' : this.minorToDecimal(net);
        }
      }
      rows.push([
        this.dateOnly(e.spentAt),
        e.description,
        e.fromFund ? 'Fund' : (e.category ?? ''),
        this.minorToDecimal(e.amount),
        trip.currency,
        ...cells,
      ]);
    }

    // Погашения: должник (from) +сумма, кредитор (to) −сумма.
    for (const s of settlements) {
      const cells = new Array<string>(members.length).fill('');
      const fromIdx = memberIndex.get(s.fromMemberId);
      const toIdx = memberIndex.get(s.toMemberId);
      if (fromIdx !== undefined) cells[fromIdx] = this.minorToDecimal(s.amount);
      if (toIdx !== undefined) cells[toIdx] = this.minorToDecimal(-s.amount);
      rows.push([
        this.dateOnly(s.createdAt),
        'Погашение долга',
        'Payment',
        this.minorToDecimal(s.amount),
        trip.currency,
        ...cells,
      ]);
    }

    const body = rows.map((r) => r.map((c) => this.escape(c)).join(',')).join('\n');
    // BOM — чтобы Excel корректно открыл кириллицу в UTF-8.
    const content = '﻿' + body + '\n';
    const filename = `${this.safeName(trip.title)}.csv`;
    return { filename, content };
  }

  private minorToDecimal(minor: number): string {
    return (minor / 100).toFixed(2);
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** RFC4180: поле в кавычках, если содержит запятую/кавычку/перевод строки. */
  private escape(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private safeName(title: string): string {
    const base = title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
    return base ? `chartersplit_${base}` : 'chartersplit_export';
  }
}
