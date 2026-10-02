/** Похож ли токен на настоящий токен бота из @BotFather («<id>:<secret>»). */
export function isValidBotToken(token: string | undefined): token is string {
  return !!token && /^\d+:[\w-]{20,}$/.test(token);
}
