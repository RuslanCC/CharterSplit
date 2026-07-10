-- AlterTable: семейная связь — чьи расходы покрывает другой участник
ALTER TABLE "TripMember" ADD COLUMN "coveredByMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_coveredByMemberId_fkey" FOREIGN KEY ("coveredByMemberId") REFERENCES "TripMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
