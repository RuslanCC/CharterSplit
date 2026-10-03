export interface DailyPoint {
  /** День в UTC, YYYY-MM-DD. */
  day: string;
  operations: number;
  activeTrips: number;
  newExpenses: number;
}

export type DailyRow = Partial<Omit<DailyPoint, 'day'>> & { day: string };

const DAY_MS = 86_400_000;

/** YYYY-MM-DD по UTC. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Ряд за последние `days` дней (UTC, включая сегодня), по порядку от старых к
 * новым. Дни без событий — нулями; строки из нескольких источников по одному
 * дню сливаются.
 */
export function fillDailySeries(rows: DailyRow[], days: number, now: Date): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDayKey(new Date(today - i * DAY_MS));
    byDay.set(day, { day, operations: 0, activeTrips: 0, newExpenses: 0 });
  }
  for (const r of rows) {
    const p = byDay.get(r.day);
    if (!p) continue;
    p.operations += r.operations ?? 0;
    p.activeTrips += r.activeTrips ?? 0;
    p.newExpenses += r.newExpenses ?? 0;
  }
  return [...byDay.values()];
}
