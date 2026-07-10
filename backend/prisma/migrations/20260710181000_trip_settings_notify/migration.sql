-- Уведомления бота в чат поездки о новых расходах и операциях с кассой.
ALTER TABLE "TripSettings" ADD COLUMN "notifyChat" BOOLEAN NOT NULL DEFAULT true;
