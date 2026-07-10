'use client';

import { useMemo } from 'react';
import { categoryColor, OTHER_CATEGORY_COLOR } from '@/lib/categories';
import { formatMoney } from '@/lib/format';
import type { Expense } from '@/lib/types';

// Накопительный график всех трат во времени: каждый расход поднимает линию
// на свою сумму; сегмент окрашен в цвет категории. Под графиком — итог.
const W = 320;
const H = 150;
const PAD = 8;

export function SpendingChart({
  expenses,
  currency,
}: {
  expenses: Expense[];
  currency: string;
}) {
  const model = useMemo(() => {
    const sorted = [...expenses].sort((a, b) =>
      a.spentAt.localeCompare(b.spentAt),
    );
    const total = sorted.reduce((s, e) => s + e.amount, 0);
    const innerW = W - 2 * PAD;
    const innerH = H - 2 * PAD;
    const n = sorted.length;

    const x = (i: number) => PAD + (n <= 1 ? innerW : (innerW * i) / n);
    const y = (v: number) => PAD + innerH * (1 - (total > 0 ? v / total : 0));

    let cum = 0;
    const segments: { d: string; color: string }[] = [];
    const points: { x: number; y: number }[] = [{ x: x(0), y: y(0) }];
    sorted.forEach((e, i) => {
      const from = cum;
      cum += e.amount;
      const p1 = { x: x(i), y: y(from) };
      const p2 = { x: x(i + 1), y: y(cum) };
      segments.push({
        d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
        color: e.fromFund ? OTHER_CATEGORY_COLOR : categoryColor(e.category),
      });
      points.push(p2);
    });

    // Заливка области под кривой.
    const areaPath =
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
      ` L ${x(n)} ${H - PAD} L ${x(0)} ${H - PAD} Z`;

    // Итоги по категориям для легенды.
    const byCat = new Map<string, number>();
    for (const e of sorted) {
      const key = e.fromFund ? 'Касса' : (e.category ?? 'Другое');
      byCat.set(key, (byCat.get(key) ?? 0) + e.amount);
    }
    const legend = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({
        label,
        amount,
        color:
          label === 'Касса'
            ? OTHER_CATEGORY_COLOR
            : categoryColor(label === 'Другое' ? null : label),
      }));

    return { total, segments, areaPath, legend, last: points[points.length - 1] };
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 text-center text-sm text-hint">
        Пока нет расходов — график появится после первого.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto' }}
        preserveAspectRatio="none"
      >
        <path d={model.areaPath} fill="var(--color-link)" fillOpacity={0.06} />
        {model.segments.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <circle
          cx={model.last.x}
          cy={model.last.y}
          r={3.5}
          fill="var(--color-text)"
        />
      </svg>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-xs text-hint">Всего потрачено</span>
        <span className="text-xl font-bold">
          {formatMoney(model.total, currency)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {model.legend.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            <span className="text-hint">{c.label}</span>
            <span className="font-medium">{formatMoney(c.amount, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
