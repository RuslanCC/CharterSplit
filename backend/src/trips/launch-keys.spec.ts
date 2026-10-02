import { describe, expect, it } from 'vitest';
import { launchKeysFromInitData, needsMembershipCheck } from './launch-keys';

describe('launchKeysFromInitData', () => {
  it('chat из initData подтверждён Telegram', () => {
    expect(
      launchKeysFromInitData({
        chat: { id: -100500 },
        startParam: 'c-1',
        chatInstance: 'i',
      }),
    ).toEqual({
      chatId: -100500,
      chatIdSource: 'chat',
      chatInstance: 'i',
      startParam: 'c-1',
    });
  });

  it('chatId из start_param помечается как непроверенный', () => {
    expect(launchKeysFromInitData({ startParam: 'c-100777' })).toMatchObject({
      chatId: -100777,
      chatIdSource: 'startParam',
    });
  });

  it('без ключей группы chatId нет', () => {
    expect(launchKeysFromInitData({ chatInstance: 'x', startParam: 'promo' })).toEqual({
      chatInstance: 'x',
      startParam: 'promo',
    });
    expect(launchKeysFromInitData(undefined)).toEqual({});
  });
});

describe('needsMembershipCheck', () => {
  it('новичок по ссылке со start_param — проверяем', () => {
    expect(
      needsMembershipCheck({
        alreadyMember: false,
        claimsPlaceholder: false,
        chatIdSource: 'startParam',
      }),
    ).toBe(true);
  });

  it('участники, заглушки по @username и запуск из самого чата — без проверки', () => {
    const base = { chatIdSource: 'startParam' as const };
    expect(
      needsMembershipCheck({ ...base, alreadyMember: true, claimsPlaceholder: false }),
    ).toBe(false);
    expect(
      needsMembershipCheck({ ...base, alreadyMember: false, claimsPlaceholder: true }),
    ).toBe(false);
    expect(
      needsMembershipCheck({
        alreadyMember: false,
        claimsPlaceholder: false,
        chatIdSource: 'chat',
      }),
    ).toBe(false);
  });
});
