-- Погашение долга: должник (from) заплатил кредитору (to) вне приложения.
-- Учитывается только в балансах, не входит в totalSpent.

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Settlement_tripId_createdAt_idx" ON "Settlement"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "TripMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "TripMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
