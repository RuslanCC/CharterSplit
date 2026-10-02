import { FundTxnType, SplitType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { computeShares, computeTipShares, fundBalance, settle } from './money';

const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

describe('computeShares', () => {
  it('EQUAL: делит поровну, остаток — первым участникам', () => {
    const shares = computeShares(SplitType.EQUAL, 1000, [
      { memberId: 'a' },
      { memberId: 'b' },
      { memberId: 'c' },
    ]);
    expect(shares.map((s) => s.amount)).toEqual([334, 333, 333]);
    expect(sum(shares)).toBe(1000);
  });

  it('SHARES: метод наибольшего остатка, сумма сходится до копейки', () => {
    const shares = computeShares(SplitType.SHARES, 1000, [
      { memberId: 'a', shareUnits: 2 },
      { memberId: 'b', shareUnits: 1 },
      { memberId: 'c', shareUnits: 1 },
    ]);
    expect(shares.map((s) => s.amount)).toEqual([500, 250, 250]);

    const uneven = computeShares(SplitType.SHARES, 100, [
      { memberId: 'a', shareUnits: 1 },
      { memberId: 'b', shareUnits: 1 },
      { memberId: 'c', shareUnits: 1 },
    ]);
    expect(sum(uneven)).toBe(100);
    expect(uneven.map((s) => s.amount).sort()).toEqual([33, 33, 34]);
  });

  it('SHARES: вес меньше 1 приводится к 1', () => {
    const shares = computeShares(SplitType.SHARES, 300, [
      { memberId: 'a', shareUnits: 0 },
      { memberId: 'b', shareUnits: 2 },
    ]);
    expect(shares).toEqual([
      { memberId: 'a', shareUnits: 1, amount: 100 },
      { memberId: 'b', shareUnits: 2, amount: 200 },
    ]);
  });

  it('EXACT: принимает точные суммы и отклоняет несошедшиеся', () => {
    const shares = computeShares(SplitType.EXACT, 500, [
      { memberId: 'a', amount: 200 },
      { memberId: 'b', amount: 300 },
    ]);
    expect(shares.map((s) => s.amount)).toEqual([200, 300]);
    expect(() =>
      computeShares(SplitType.EXACT, 500, [{ memberId: 'a', amount: 499 }]),
    ).toThrow(/must equal amount/);
  });

  it('отклоняет пустой список и нецелую сумму', () => {
    expect(() => computeShares(SplitType.EQUAL, 100, [])).toThrow();
    expect(() => computeShares(SplitType.EQUAL, 10.5, [{ memberId: 'a' }])).toThrow();
  });
});

describe('computeTipShares', () => {
  it('делит чаевые поровну между участниками', () => {
    expect(computeTipShares(100, ['a', 'b', 'c'])).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('пусто без чаевых или участников', () => {
    expect(computeTipShares(0, ['a'])).toEqual({});
    expect(computeTipShares(100, [])).toEqual({});
  });
});

describe('settle', () => {
  it('сводит балансы к переводам, сохраняя суммы', () => {
    const transfers = settle({ a: 300, b: -100, c: -200 });
    expect(transfers).toEqual([
      { fromMemberId: 'c', toMemberId: 'a', amount: 200 },
      { fromMemberId: 'b', toMemberId: 'a', amount: 100 },
    ]);
  });

  it('нет переводов, если все в нуле', () => {
    expect(settle({ a: 0, b: 0 })).toEqual([]);
  });

  it('каждый должник гасит долг полностью', () => {
    const balances = { a: 500, b: 250, c: -400, d: -350 };
    const transfers = settle(balances);
    const net: Record<string, number> = { ...balances };
    for (const t of transfers) {
      net[t.fromMemberId] += t.amount;
      net[t.toMemberId] -= t.amount;
    }
    expect(Object.values(net).every((v) => v === 0)).toBe(true);
    expect(transfers.length).toBeLessThanOrEqual(3);
  });
});

describe('fundBalance', () => {
  it('взносы − выплаты ± корректировки − расходы из кассы', () => {
    const txns = [
      { type: FundTxnType.CONTRIBUTION, amount: 10_000 },
      { type: FundTxnType.PAYOUT, amount: 2_000 },
      { type: FundTxnType.ADJUSTMENT, amount: -500 },
    ];
    expect(fundBalance(txns, 3_000)).toBe(4_500);
  });
});
