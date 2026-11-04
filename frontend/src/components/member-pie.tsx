'use client';

import { DonutChart } from '@/components/donut-chart';

export interface PieGroup {
  /** Конечный плательщик группы (участник или тот, кто оплачивает расходы семьи). */
  key: string;
  label: string;
  amount: number;
  /** Слот категориальной палитры: закреплён за участником, не за местом в рейтинге. */
  slot: number;
}

// Категориальные цвета (--series-1…8) заданы в globals.css для светлой и тёмной
// темы. Групп больше восьми не бывает часто — лишние сворачиваются в «Остальные».
const MAX_SLOTS = 8;
const OTHER_COLOR = 'var(--series-other)';

/**
 * Круговая диаграмма «на кого сколько потрачено»: один сегмент на группу —
 * участника вместе с теми, чьи расходы он оплачивает.
 */
export function MemberPie({
  groups,
  currency,
}: {
  groups: PieGroup[];
  currency: string;
}) {
  const sorted = [...groups]
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const inPalette = sorted.filter((g) => g.slot < MAX_SLOTS);
  const rest = sorted.filter((g) => g.slot >= MAX_SLOTS);
  const items = [
    ...inPalette.map((g) => ({ ...g, color: `var(--series-${g.slot + 1})` })),
    ...(rest.length
      ? [
          {
            key: 'other',
            label: `Остальные (${rest.length})`,
            amount: rest.reduce((s, g) => s + g.amount, 0),
            color: OTHER_COLOR,
          },
        ]
      : []),
  ];

  return (
    <DonutChart
      items={items}
      currency={currency}
      ariaLabel="Доли участников в тратах поездки"
    />
  );
}
