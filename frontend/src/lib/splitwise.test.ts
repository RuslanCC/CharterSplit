import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  parseSignedMinor,
  parseSplitwiseCsv,
  suggestMemberId,
} from './splitwise';

describe('parseCsv', () => {
  it('учитывает кавычки, экранирование и CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseSignedMinor', () => {
  it('переводит суммы в минорные единицы со знаком', () => {
    expect(parseSignedMinor('551.62')).toBe(55162);
    expect(parseSignedMinor('-16,25')).toBe(-1625);
    expect(parseSignedMinor('7.5')).toBe(750);
    expect(parseSignedMinor('abc')).toBeNull();
  });
});

describe('parseSplitwiseCsv', () => {
  const csv = [
    'Date,Description,Category,Cost,Currency,Anna K.,Boris',
    '2026-07-01,Marina,General,100.00,EUR,50.00,-50.00',
    '2026-07-02,Boris paid Anna,Payment,50.00,EUR,-50.00,50.00',
    ',Total balance,,,EUR,0.00,0.00',
  ].join('\n');

  it('разбирает участников, строки и платежи', () => {
    const file = parseSplitwiseCsv(csv);
    expect(file.participants).toEqual(['Anna K.', 'Boris']);
    expect(file.rows).toHaveLength(2);
    expect(file.rows[0]).toMatchObject({
      date: '2026-07-01',
      cost: 10000,
      currency: 'EUR',
      isPayment: false,
      nets: [
        { csvName: 'Anna K.', amount: 5000 },
        { csvName: 'Boris', amount: -5000 },
      ],
    });
    expect(file.rows[1].isPayment).toBe(true);
    expect(file.skippedLines).toBe(1);
  });

  it('отклоняет чужой формат', () => {
    expect(() => parseSplitwiseCsv('foo,bar\n1,2')).toThrow(/Splitwise/);
  });
});

describe('suggestMemberId', () => {
  const members = [
    { id: '1', displayName: 'Anna Karenina', user: { username: 'anna_k' } },
    { id: '2', displayName: 'Boris', user: null },
  ];

  it('находит по точному имени, username и сокращению', () => {
    expect(suggestMemberId('Boris', members)).toBe('2');
    expect(suggestMemberId('anna_k', members)).toBe('1');
    expect(suggestMemberId('Anna K.', members)).toBe('1');
    expect(suggestMemberId('Viktor', members)).toBeNull();
  });
});
