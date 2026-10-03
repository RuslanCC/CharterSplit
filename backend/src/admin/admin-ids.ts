/**
 * Глобальные администраторы инстанса (владельцы бота) — список Telegram User ID
 * из ADMIN_TELEGRAM_IDS через запятую/пробел. Не путать с владельцем поездки
 * (MemberRole.OWNER). Пусто — админ-раздел выключен.
 */
export function parseAdminIds(raw: string | undefined | null): Set<bigint> {
  const ids = new Set<bigint>();
  for (const part of (raw ?? '').split(/[\s,;]+/)) {
    if (/^\d+$/.test(part)) ids.add(BigInt(part));
  }
  return ids;
}

export function isAdmin(
  ids: ReadonlySet<bigint>,
  telegramUserId: bigint | number | null | undefined,
): boolean {
  if (telegramUserId === null || telegramUserId === undefined) return false;
  return ids.has(BigInt(telegramUserId));
}
