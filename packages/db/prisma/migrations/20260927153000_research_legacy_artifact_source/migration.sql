ALTER TABLE "Artifact" ADD COLUMN "sourceBenchmarkStudyId" TEXT;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_sourceBenchmarkStudyId_fkey" FOREIGN KEY ("sourceBenchmarkStudyId") REFERENCES "BenchmarkStudy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Artifact_projectId_sourceBenchmarkStudyId_key" ON "Artifact"("projectId", "sourceBenchmarkStudyId");
