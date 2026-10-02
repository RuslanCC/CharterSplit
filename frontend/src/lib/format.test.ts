import { describe, expect, it } from 'vitest';
import { moneyToInput, parseMoney, plural } from './format';

describe('parseMoney', () => {
  it('понимает точку, запятую, пробелы и разделители тысяч', () => {
    expect(parseMoney('123.45')).toBe(12345);
    expect(parseMoney('123,45')).toBe(12345);
    expect(parseMoney('1 000,5')).toBe(100050);
    expect(parseMoney('1,000.50')).toBe(100050);
  });

  it('NaN на мусоре, пустой строке и отрицательных', () => {
    expect(parseMoney('abc')).toBeNaN();
    expect(parseMoney('')).toBeNaN();
    expect(parseMoney('-5')).toBeNaN();
  });

  it('обратна moneyToInput', () => {
    for (const minor of [0, 5, 100, 12345, 99999]) {
      expect(parseMoney(moneyToInput(minor))).toBe(minor);
    }
  });
});

describe('plural', () => {
  const forms: [string, string, string] = ['участник', 'участника', 'участников'];
  it('русские формы множественного числа', () => {
    expect(plural(1, forms)).toBe('участник');
    expect(plural(3, forms)).toBe('участника');
    expect(plural(11, forms)).toBe('участников');
    expect(plural(21, forms)).toBe('участник');
  });
});
