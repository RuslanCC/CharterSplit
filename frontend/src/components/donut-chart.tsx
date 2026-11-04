'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DonutItem {
  key: string;
  label: string;
  amount: number;
  color: string;
}

const R = 64;
const WIDTH = 24;
const SIZE = 2 * (R + WIDTH / 2) + 4;
const C = SIZE / 2;

function arcPath(start: number, end: number): string {
  const p = (a: number) => [C + R * Math.sin(a), C - R * Math.cos(a)];
  const [x1, y1] = p(start);
  const [x2, y2] = p(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * Кольцевая диаграмма с легендой. Сегменты идут в переданном порядке; тап по
 * сегменту или строке легенды показывает сумму и долю в центре.
 */
export function DonutChart({
  items: all,
  currency,
  ariaLabel,
}: {
  items: DonutItem[];
  currency: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  const items = all.filter((g) => g.amount > 0);
  const total = items.reduce((s, g) => s + g.amount, 0);
  if (total <= 0) return null;

  const slices = items.map((g, i) => {
    const before = items.slice(0, i).reduce((s, x) => s + x.amount, 0);
    const turn = (v: number) => (v / total) * 2 * Math.PI;
    return { ...g, start: turn(before), end: turn(before + g.amount) };
  });
  const focus = items.find((g) => g.key === active);
  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div className="p-4">
      <div className="flex justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={ariaLabel}
        >
          {slices.length === 1 ? (
            <circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke={slices[0].color}
              strokeWidth={WIDTH}
            />
          ) : (
            slices.map((s) => (
              <path
                key={s.key}
                d={arcPath(s.start, s.end)}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.key ? WIDTH + 4 : WIDTH}
                opacity={active && active !== s.key ? 0.35 : 1}
                className="cursor-pointer transition-[opacity,stroke-width] duration-150"
                onClick={() => setActive(active === s.key ? null : s.key)}
              >
                <title>
                  {s.label}: {formatMoney(s.amount, currency)} ({pct(s.amount)}%)
                </title>
              </path>
            ))
          )}
          {/* Зазоры между сегментами — цветом карточки. */}
          {slices.length > 1 &&
            slices.map((s) => {
              const x = Math.sin(s.start);
              const y = -Math.cos(s.start);
              return (
                <line
                  key={`gap-${s.key}`}
                  x1={C + (R - WIDTH / 2 - 3) * x}
                  y1={C + (R - WIDTH / 2 - 3) * y}
                  x2={C + (R + WIDTH / 2 + 3) * x}
                  y2={C + (R + WIDTH / 2 + 3) * y}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            })}
          <text
            x={C}
            y={C - 4}
            textAnchor="middle"
            className="fill-text text-[15px] font-semibold"
          >
            {formatMoney(focus ? focus.amount : total, currency)}
          </text>
          <text x={C} y={C + 14} textAnchor="middle" className="fill-hint text-[11px]">
            {focus ? `${pct(focus.amount)}% всех трат` : 'всего'}
          </text>
        </svg>
      </div>

      <div className="mt-3 space-y-1">
        {items.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setActive(active === g.key ? null : g.key)}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm',
              active === g.key && 'bg-separator',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: g.color }}
              />
              <span className="truncate">{g.label}</span>
            </span>
            <span className="shrink-0">
              {formatMoney(g.amount, currency)}
              <span className="ml-1.5 inline-block w-9 text-right text-xs text-hint">
                {pct(g.amount)}%
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
