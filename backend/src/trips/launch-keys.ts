import type { ParsedInitData } from '../common/decorators/current-user.decorator';

/** Ключи поездки из подписанного initData запуска Mini App. */
export interface LaunchKeys {
  /** Chat ID группы: из `chat` (только запуск из меню вложений) или из start_param `c<chatId>`. */
  chatId?: number;
  /**
   * Откуда взят chatId. `chat` Telegram подтверждает сам (пользователь открыл
   * приложение из этого чата). `startParam` — лишь содержимое ссылки: его может
   * подставить кто угодно, поэтому членство в чате нужно проверить.
   */
  chatIdSource?: 'chat' | 'startParam';
  chatInstance?: string;
  startParam?: string;
}

export function launchKeysFromInitData(initData: ParsedInitData | undefined): LaunchKeys {
  const keys: LaunchKeys = {
    chatInstance: initData?.chatInstance || undefined,
    startParam: initData?.startParam || undefined,
  };
  if (initData?.chat?.id !== undefined && Number.isFinite(initData.chat.id)) {
    keys.chatId = initData.chat.id;
    keys.chatIdSource = 'chat';
  }
  // Диплинк на открытый счёт: "c<chatId>_e<expenseId>". Хвост расхода — только
  // навигация в Mini App; ключ поездки — "c<chatId>".
  const m = keys.startParam?.match(/^c(-?\d+)(?:_e[A-Za-z0-9]+)?$/);
  if (m) {
    keys.startParam = `c${m[1]}`;
    if (keys.chatId === undefined) {
      keys.chatId = Number(m[1]);
      keys.chatIdSource = 'startParam';
    }
  }
  return keys;
}

/**
 * Нужна ли проверка членства в чате перед вступлением в поездку.
 * Уже участники и «заглушки» по @username (их добавил участник поездки)
 * проходят без проверки; новичок по ссылке с start_param — только с проверкой.
 */
export function needsMembershipCheck(opts: {
  alreadyMember: boolean;
  claimsPlaceholder: boolean;
  chatIdSource?: LaunchKeys['chatIdSource'];
}): boolean {
  if (opts.alreadyMember || opts.claimsPlaceholder) return false;
  return opts.chatIdSource === 'startParam';
}
