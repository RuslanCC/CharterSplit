'use client';

import { useState } from 'react';
import type { AdminDailyPoint } from '@/lib/types';

// Столбики активности по дням: высота — число операций в истории всех поездок.
// По нажатию/наведению — подпись с деталями дня.
const W = 320;
const H = 110;
const GAP = 2;

const fmtDay = (day: string) => {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    return day;
  }
};

export function AdminActivityChart({ daily }: { daily: AdminDailyPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.operations));
  const bw = W / daily.length;
  const shown = daily[active ?? daily.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Активность по дням"
        onMouseLeave={() => setActive(null)}
      >
        {daily.map((d, i) => {
          const h = d.operations > 0 ? Math.max(2, (d.operations / max) * (H - 4)) : 1;
          return (
            <rect
              key={d.day}
              x={i * bw + GAP / 2}
              y={H - h}
              width={Math.max(1, bw - GAP)}
              height={h}
              rx={1.5}
              className={
                i === (active ?? daily.length - 1)
                  ? 'fill-[var(--color-link)]'
                  : 'fill-[var(--color-link)] opacity-40'
              }
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-hint">
        <span>{daily.length ? fmtDay(daily[0].day) : ''}</span>
        <span>{daily.length ? fmtDay(daily[daily.length - 1].day) : ''}</span>
      </div>
      {shown && (
        <div className="mt-2 text-xs text-hint">
          <span className="font-medium text-text">{fmtDay(shown.day)}</span>
          {' · '}операций {shown.operations} · поездок {shown.activeTrips} · новых
          расходов {shown.newExpenses}
        </div>
      )}
    </div>
  );
}
