import { describe, expect, it } from 'vitest';
import { escapeHtml, formatMoney } from './format';

describe('formatMoney', () => {
  it('переводит минорные единицы в сумму с валютой', () => {
    const s = formatMoney(123456, 'EUR');
    expect(s).toContain('1');
    expect(s).toContain('234,56');
    expect(s).toContain('€');
  });

  it('не падает на неизвестной валюте', () => {
    expect(formatMoney(150, 'XYZW')).toBe('1.50 XYZW');
  });
});

describe('escapeHtml', () => {
  it('экранирует спецсимволы Telegram HTML', () => {
    expect(escapeHtml('<b>Tom & Jerry</b>')).toBe('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;');
  });
});
