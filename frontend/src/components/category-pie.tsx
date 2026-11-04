'use client';

import { useMemo } from 'react';
import { EXPENSE_CATEGORIES, OTHER_CATEGORY_COLOR } from '@/lib/categories';
import type { Expense } from '@/lib/types';
import { DonutChart, type DonutItem } from '@/components/donut-chart';

const FUND = 'Касса';
const OTHER = 'Другое';
const FUND_COLOR = 'var(--series-7)';
// Категории не из списка быстрых кнопок (например, импорт из Splitwise): свои
// цвета, не совпадающие с фиксированными; остальные уходят в «Другое».
const EXTRA_COLORS = ['var(--series-5)', '#06b6d4', '#a16207'];

/** Круговая диаграмма «на что ушли деньги» по всем расходам поездки. */
export function CategoryPie({
  expenses,
  currency,
}: {
  expenses: Expense[];
  currency: string;
}) {
  const items = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const e of expenses) {
      const key = e.fromFund ? FUND : (e.category ?? OTHER);
      byCat.set(key, (byCat.get(key) ?? 0) + e.amount);
    }

    let other = byCat.get(OTHER) ?? 0;
    byCat.delete(OTHER);
    let extra = 0;
    const result: DonutItem[] = [];
    for (const [label, amount] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      const known = EXPENSE_CATEGORIES.find((c) => c.label === label);
      let color: string | undefined;
      if (known) color = known.color;
      else if (label === FUND) color = FUND_COLOR;
      else if (extra < EXTRA_COLORS.length) color = EXTRA_COLORS[extra++];
      if (color) result.push({ key: label, label, amount, color });
      else other += amount;
    }
    if (other > 0)
      result.push({
        key: OTHER,
        label: OTHER,
        amount: other,
        color: OTHER_CATEGORY_COLOR,
      });
    // «Другое» — всегда последним, остальное по убыванию.
    return result;
  }, [expenses]);

  return <DonutChart items={items} currency={currency} ariaLabel="Траты по категориям" />;
}
