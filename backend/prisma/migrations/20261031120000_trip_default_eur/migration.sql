-- Новые поездки по умолчанию в EUR; существующие не меняются.
ALTER TABLE "Trip" ALTER COLUMN "currency" SET DEFAULT 'EUR';
