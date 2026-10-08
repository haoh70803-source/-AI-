ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");

ALTER TABLE "MotherContent" ADD COLUMN "confirmedVersion" INTEGER;
ALTER TABLE "MotherContent" ADD COLUMN "confirmedWarnings" JSONB;
