-- Закреплённое «табло баланса»: id сообщения бота, которое он редактирует на месте.
ALTER TABLE "Trip" ADD COLUMN "pinnedMessageId" BIGINT;
