'use client';

import { useMemo, useState } from 'react';
import { categoryColor, OTHER_CATEGORY_COLOR } from '@/lib/categories';
import { formatDate, formatMoney } from '@/lib/format';
import type { Expense } from '@/lib/types';

// Накопительный график всех трат во времени: каждый расход поднимает линию
// на свою сумму; сегмент окрашен в цвет категории. Вертикальные пунктиры —
// границы дней; при наведении на расход показывается тултип с деталями.
const W = 320;
const H = 150;
const PAD = 8;

// Граница дня — по локальному времени, как и группировка в списке расходов.
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const fmtDay = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
};

export function SpendingChart({
  expenses,
  currency,
}: {
  expenses: Expense[];
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const sorted = [...expenses].sort((a, b) => a.spentAt.localeCompare(b.spentAt));
    const total = sorted.reduce((s, e) => s + e.amount, 0);
    const innerW = W - 2 * PAD;
    const innerH = H - 2 * PAD;
    const n = sorted.length;

    const x = (i: number) => PAD + (n <= 1 ? innerW : (innerW * i) / n);
    const y = (v: number) => PAD + innerH * (1 - (total > 0 ? v / total : 0));

    let cum = 0;
    const segments: { d: string; color: string }[] = [];
    const nodes: {
      x0: number;
      x1: number;
      x: number;
      y: number;
      cum: number;
      e: Expense;
    }[] = [];
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
      nodes.push({ x0: x(i), x1: x(i + 1), x: p2.x, y: p2.y, cum, e });
    });

    // Заливка области под кривой.
    const areaPath =
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
      ` L ${x(n)} ${H - PAD} L ${x(0)} ${H - PAD} Z`;

    // Границы дней: вертикаль там, где начинается новый день. Подписи прореживаем,
    // чтобы не наезжали друг на друга при плотном графике.
    const days: {
      x: number;
      pct: number;
      label: string;
      line: boolean;
      showLabel: boolean;
    }[] = [];
    let lastLabel = -Infinity;
    sorted.forEach((e, i) => {
      if (i === 0 || dayKey(e.spentAt) !== dayKey(sorted[i - 1].spentAt)) {
        const xi = x(i);
        const showLabel = xi - lastLabel > 44;
        if (showLabel) lastLabel = xi;
        days.push({
          x: xi,
          pct: (xi / W) * 100,
          label: fmtDay(e.spentAt),
          line: i !== 0,
          showLabel,
        });
      }
    });

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

    return {
      total,
      segments,
      areaPath,
      legend,
      nodes,
      days,
      last: points[points.length - 1],
    };
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 text-center text-sm text-hint">
        Пока нет расходов — график появится после первого.
      </div>
    );
  }

  const active = hover != null ? model.nodes[hover] : null;
  const tipLeft = active ? (active.x / W) * 100 : 0;
  const tipTop = active ? (active.y / H) * 100 : 0;
  const tipTx = tipLeft < 18 ? '0%' : tipLeft > 82 ? '-100%' : '-50%';

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          style={{ height: 'auto' }}
          preserveAspectRatio="none"
          onPointerLeave={() => setHover(null)}
        >
          <path d={model.areaPath} fill="var(--color-link)" fillOpacity={0.06} />

          {/* Вертикальные границы дней */}
          {model.days.map(
            (d, i) =>
              d.line && (
                <line
                  key={`day-${i}`}
                  x1={d.x}
                  y1={PAD}
                  x2={d.x}
                  y2={H - PAD}
                  stroke="var(--color-hint)"
                  strokeWidth={1}
                  strokeOpacity={0.25}
                  strokeDasharray="3 3"
                />
              ),
          )}

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

          {/* Подсветка выбранной точки */}
          {active && (
            <>
              <line
                x1={active.x}
                y1={PAD}
                x2={active.x}
                y2={H - PAD}
                stroke="var(--color-text)"
                strokeWidth={1}
                strokeOpacity={0.25}
              />
              <circle cx={active.x} cy={active.y} r={4.5} fill="var(--color-text)" />
            </>
          )}

          {!active && (
            <circle
              cx={model.last.x}
              cy={model.last.y}
              r={3.5}
              fill="var(--color-text)"
            />
          )}

          {/* Прозрачные колонки-мишени для наведения/тапа */}
          {model.nodes.map((node, i) => (
            <rect
              key={`hit-${i}`}
              x={node.x0}
              y={0}
              width={Math.max(0.01, node.x1 - node.x0)}
              height={H}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            />
          ))}
        </svg>

        {/* Подписи дней */}
        {model.days.map(
          (d, i) =>
            d.showLabel && (
              <span
                key={`lbl-${i}`}
                className="pointer-events-none absolute bottom-0 whitespace-nowrap text-[10px] text-hint"
                style={{ left: `calc(${d.pct}% + 3px)` }}
              >
                {d.label}
              </span>
            ),
        )}

        {/* Тултип расхода */}
        {active && (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: `${tipLeft}%`,
              top: `${tipTop}%`,
              transform: `translate(${tipTx}, calc(-100% - 8px))`,
            }}
          >
            <div className="rounded-lg bg-text px-2.5 py-1.5 text-xs text-bg shadow-lg">
              <div className="font-semibold">
                {active.e.fromFund
                  ? `${active.e.description} · из кассы`
                  : active.e.description}
              </div>
              <div className="font-medium">{formatMoney(active.e.amount, currency)}</div>
              <div className="opacity-60">
                {formatDate(active.e.spentAt)} · Σ {formatMoney(active.cum, currency)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-xs text-hint">Всего потрачено</span>
        <span className="text-xl font-bold">{formatMoney(model.total, currency)}</span>
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
