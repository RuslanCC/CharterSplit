-- Прежний chat_id группы после её превращения Telegram в супергруппу.
ALTER TABLE "Trip" ADD COLUMN "migratedFromChatId" BIGINT;
CREATE UNIQUE INDEX "Trip_migratedFromChatId_key" ON "Trip"("migratedFromChatId");
