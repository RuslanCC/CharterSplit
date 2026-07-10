-- Ник Telegram у участника (lowercase, без @) — для добавления «по @username»
-- и автопривязки к аккаунту при первом входе.
ALTER TABLE "TripMember" ADD COLUMN "telegramUsername" TEXT;
