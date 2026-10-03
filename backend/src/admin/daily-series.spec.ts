import { describe, expect, it } from 'vitest';
import { fillDailySeries } from './daily-series';

describe('fillDailySeries', () => {
  const now = new Date('2026-10-03T15:00:00Z');

  it('строит ряд нужной длины от старых дней к сегодняшнему', () => {
    const s = fillDailySeries([], 3, now);
    expect(s.map((p) => p.day)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(s.every((p) => p.operations === 0 && p.newExpenses === 0)).toBe(true);
  });

  it('сливает строки из разных источников и отбрасывает дни вне окна', () => {
    const s = fillDailySeries(
      [
        { day: '2026-10-02', operations: 5, activeTrips: 2 },
        { day: '2026-10-02', newExpenses: 3 },
        { day: '2026-09-01', operations: 100 },
      ],
      2,
      now,
    );
    expect(s).toEqual([
      { day: '2026-10-02', operations: 5, activeTrips: 2, newExpenses: 3 },
      { day: '2026-10-03', operations: 0, activeTrips: 0, newExpenses: 0 },
    ]);
  });
});
