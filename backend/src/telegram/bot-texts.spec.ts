import { describe, expect, it } from 'vitest';
import { helpText, renderBalanceText, startPrivateText } from './bot-texts';

describe('контакт поддержки', () => {
  it('выводится, только если задан', () => {
    expect(helpText(true, '@support')).toContain('пишите @support');
    expect(helpText(true, '')).not.toContain('По всем вопросам');
    expect(startPrivateText()).not.toContain('По всем вопросам');
  });
});

describe('renderBalanceText', () => {
  it('экранирует имена и показывает переводы', () => {
    const text = renderBalanceText({
      trip: { title: 'Яхта <Bora>', currency: 'EUR' },
      members: [
        { displayName: 'Анна', balance: 1500 },
        { displayName: 'Борис', balance: -1500 },
        { displayName: 'Вера', balance: 0 },
      ],
      transfers: [{ fromName: 'Борис', toName: 'Анна', amount: 1500 }],
      fund: { balance: 0 },
      totalSpent: 4500,
    });
    expect(text).toContain('Яхта &lt;Bora&gt;');
    expect(text).toContain('Борис → Анна');
    expect(text).not.toContain('Вера');
  });

  it('пишет, что долгов нет', () => {
    const text = renderBalanceText({
      trip: { title: 'T', currency: 'RUB' },
      members: [],
      transfers: [],
      fund: { balance: 0 },
      totalSpent: 0,
    });
    expect(text).toContain('долгов нет');
  });
});
