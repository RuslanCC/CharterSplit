-- «Открытый счёт»: каждый участник вносит свою часть, остаток делится поровну.
ALTER TYPE "SplitType" ADD VALUE 'SELF';
ALTER TABLE "Expense" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "ExpenseShare" ADD COLUMN "claimed" INTEGER;
