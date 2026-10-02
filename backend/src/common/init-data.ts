import type { ParsedInitData } from './decorators/current-user.decorator';

/**
 * Разбирает сырой initData (URL-encoded query string от Telegram) в нормализованную
 * camelCase-структуру. Подпись проверяется отдельно (validate из SDK) — здесь только парсинг.
 * Свой парсер выбран намеренно, чтобы не зависеть от формы вывода parse() в разных версиях SDK.
 */
export function parseInitData(raw: string): ParsedInitData {
  const p = new URLSearchParams(raw);

  const userJson = p.get('user');
  const chatJson = p.get('chat');
  const user = userJson ? safeJson<RawUser>(userJson) : undefined;
  const chat = chatJson ? safeJson<RawChat>(chatJson) : undefined;
  const authDateRaw = p.get('auth_date');

  return {
    user: user
      ? {
          id: Number(user.id),
          firstName: user.first_name ?? undefined,
          lastName: user.last_name ?? undefined,
          username: user.username ?? undefined,
          languageCode: user.language_code ?? undefined,
          photoUrl: user.photo_url ?? undefined,
        }
      : undefined,
    chat: chat ? { id: Number(chat.id), type: chat.type, title: chat.title } : undefined,
    chatInstance: p.get('chat_instance') ?? undefined,
    chatType: p.get('chat_type') ?? undefined,
    startParam: p.get('start_param') ?? undefined,
    authDate: authDateRaw ? new Date(Number(authDateRaw) * 1000) : undefined,
  };
}

interface RawUser {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface RawChat {
  id: number | string;
  type?: string;
  title?: string;
}

function safeJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
