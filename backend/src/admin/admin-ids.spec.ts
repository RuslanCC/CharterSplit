import { describe, expect, it } from 'vitest';
import { isAdmin, parseAdminIds } from './admin-ids';

describe('parseAdminIds', () => {
  it('парсит список через запятую и пробелы', () => {
    expect([...parseAdminIds(' 123, 456 ;789\n')]).toEqual([123n, 456n, 789n]);
  });

  it('пусто и мусор — пустой набор', () => {
    expect(parseAdminIds(undefined).size).toBe(0);
    expect(parseAdminIds('').size).toBe(0);
    expect(parseAdminIds('abc, -5, 1.5').size).toBe(0);
  });

  it('не теряет точность больших id', () => {
    expect(parseAdminIds('9007199254740993').has(9007199254740993n)).toBe(true);
  });
});

describe('isAdmin', () => {
  const ids = parseAdminIds('100001');

  it('принимает bigint и number', () => {
    expect(isAdmin(ids, 100001n)).toBe(true);
    expect(isAdmin(ids, 100001)).toBe(true);
  });

  it('чужой или отсутствующий id — не админ', () => {
    expect(isAdmin(ids, 999)).toBe(false);
    expect(isAdmin(ids, null)).toBe(false);
    expect(isAdmin(new Set(), 100001)).toBe(false);
  });
});
