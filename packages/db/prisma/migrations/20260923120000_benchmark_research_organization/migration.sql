ALTER TABLE "BenchmarkAccount" ADD COLUMN "researchCategory" TEXT,
ADD COLUMN "researchNotes" TEXT;
CREATE INDEX "BenchmarkAccount_workspaceId_researchCategory_idx" ON "BenchmarkAccount"("workspaceId", "researchCategory");
