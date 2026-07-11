-- Чаевые расхода (минорные единицы): делятся поровну между участниками расхода.
ALTER TABLE "Expense" ADD COLUMN "tipAmount" INTEGER NOT NULL DEFAULT 0;
