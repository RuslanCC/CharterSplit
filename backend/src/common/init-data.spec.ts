import { describe, expect, it } from 'vitest';
import { parseInitData } from './init-data';

describe('parseInitData', () => {
  it('разбирает user, chat и параметры запуска в camelCase', () => {
    const raw = new URLSearchParams({
      user: JSON.stringify({ id: 42, first_name: 'Анна', username: 'anna' }),
      chat: JSON.stringify({ id: -100123, type: 'supergroup', title: 'Яхта' }),
      chat_instance: '777',
      chat_type: 'supergroup',
      start_param: 'c-100123',
      auth_date: '1700000000',
      hash: 'x',
    }).toString();

    const parsed = parseInitData(raw);
    expect(parsed.user).toMatchObject({ id: 42, firstName: 'Анна', username: 'anna' });
    expect(parsed.chat).toEqual({ id: -100123, type: 'supergroup', title: 'Яхта' });
    expect(parsed.chatInstance).toBe('777');
    expect(parsed.startParam).toBe('c-100123');
    expect(parsed.authDate?.getTime()).toBe(1700000000 * 1000);
  });

  it('переживает битый JSON', () => {
    const parsed = parseInitData('user=%7Bnot-json&auth_date=1');
    expect(parsed.user).toBeUndefined();
    expect(parsed.chat).toBeUndefined();
  });
});
