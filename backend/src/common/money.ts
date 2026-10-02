// Денежная логика: расчёт долей расхода и сведение взаиморасчётов.
// Все суммы — целые минорные единицы (копейки/центы).

import { FundTxnType, SplitType } from '@prisma/client';

// Суммы хранятся в 32-битном Int (макс 2 147 483 647 минорных единиц).
// Держим потолок с запасом, чтобы вместо переполнения БД прилетала 400.
export const MAX_MINOR = 2_000_000_000;

export interface ShareInput {
  memberId: string;
  shareUnits?: number; // для SHARES
  amount?: number; // для EXACT
}

export interface ComputedShare {
  memberId: string;
  shareUnits: number;
  amount: number;
}

/**
 * Рассчитывает доли участников в расходе в зависимости от способа деления.
 * Гарантирует, что сумма долей строго равна amount (остаток распределяется детерминированно).
 */
export function computeShares(
  splitType: SplitType,
  amount: number,
  participants: ShareInput[],
): ComputedShare[] {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('amount must be a non-negative integer (minor units)');
  }
  if (participants.length === 0) {
    throw new Error('at least one participant is required');
  }

  if (splitType === SplitType.EXACT) {
    const shares = participants.map((p) => ({
      memberId: p.memberId,
      shareUnits: 1,
      amount: p.amount ?? 0,
    }));
    const sum = shares.reduce((s, x) => s + x.amount, 0);
    if (sum !== amount) {
      throw new Error(`exact shares sum (${sum}) must equal amount (${amount})`);
    }
    return shares;
  }

  if (splitType === SplitType.SHARES) {
    const units = participants.map((p) => Math.max(1, Math.trunc(p.shareUnits ?? 1)));
    const totalUnits = units.reduce((s, u) => s + u, 0);
    // базовые (округлённые вниз) доли + распределение остатка по наибольшей дробной части
    const raw = units.map((u) => (amount * u) / totalUnits);
    const floors = raw.map((r) => Math.floor(r));
    let remainder = amount - floors.reduce((s, f) => s + f, 0);
    const order = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r) }))
      .sort((a, b) => b.frac - a.frac);
    const result = participants.map((p, i) => ({
      memberId: p.memberId,
      shareUnits: units[i],
      amount: floors[i],
    }));
    for (const { i } of order) {
      if (remainder <= 0) break;
      result[i].amount += 1;
      remainder -= 1;
    }
    return result;
  }

  // EQUAL
  const n = participants.length;
  const base = Math.floor(amount / n);
  const remainder = amount - base * n;
  return participants.map((p, i) => ({
    memberId: p.memberId,
    shareUnits: 1,
    amount: base + (i < remainder ? 1 : 0),
  }));
}

/**
 * Доли чаевых: делятся поровну между участниками расхода (тот же
 * детерминированный остаток, что и EQUAL). Возвращает map memberId → сумма.
 */
export function computeTipShares(
  tipAmount: number,
  memberIds: string[],
): Record<string, number> {
  if (tipAmount <= 0 || memberIds.length === 0) return {};
  const shares = computeShares(
    SplitType.EQUAL,
    tipAmount,
    memberIds.map((id) => ({ memberId: id })),
  );
  return Object.fromEntries(shares.map((s) => [s.memberId, s.amount]));
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * Сводит балансы участников (net = получил − отдал) к короткому списку переводов.
 * Жадный алгоритм: крупнейший должник платит крупнейшему кредитору — не более
 * n−1 переводов (строгий минимум — NP-трудная задача, на практике разница мала).
 */
export function settle(balances: Record<string, number>): Transfer[] {
  const debtors: { id: string; amt: number }[] = [];
  const creditors: { id: string; amt: number }[] = [];
  for (const [id, bal] of Object.entries(balances)) {
    if (bal < 0) debtors.push({ id, amt: -bal });
    else if (bal > 0) creditors.push({ id, amt: bal });
  }
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const pay = Math.min(d.amt, c.amt);
    if (pay > 0) {
      transfers.push({ fromMemberId: d.id, toMemberId: c.id, amount: pay });
      d.amt -= pay;
      c.amt -= pay;
    }
    if (d.amt === 0) di += 1;
    if (c.amt === 0) ci += 1;
  }
  return transfers;
}

/**
 * Баланс судовой кассы: взносы − выплаты ± корректировки − расходы, оплаченные
 * из кассы. Корректировка хранится со знаком.
 */
export function fundBalance(
  txns: { type: FundTxnType; amount: number }[],
  spentFromFund: number,
): number {
  let balance = 0;
  for (const t of txns) {
    balance += t.type === FundTxnType.PAYOUT ? -t.amount : t.amount;
  }
  return balance - spentFromFund;
}
