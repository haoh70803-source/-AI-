-- M4 compares a user-selected set of already analysed benchmark contents.
ALTER TYPE "PromptType" ADD VALUE 'ANALYZE_BENCHMARK';
CREATE TYPE "BenchmarkStudyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "BenchmarkStudy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "benchmarkAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BenchmarkStudyStatus" NOT NULL DEFAULT 'PROCESSING',
    "sampleCount" INTEGER NOT NULL,
    "insufficientSamples" BOOLEAN NOT NULL,
    "output" JSONB,
    "aiRunId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BenchmarkStudy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BenchmarkStudySample" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "materialAnalysisId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenchmarkStudySample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkStudy_benchmarkAccountId_version_key" ON "BenchmarkStudy"("benchmarkAccountId", "version");
CREATE UNIQUE INDEX "BenchmarkStudy_aiRunId_key" ON "BenchmarkStudy"("aiRunId");
CREATE UNIQUE INDEX "BenchmarkStudySample_studyId_sourceItemId_key" ON "BenchmarkStudySample"("studyId", "sourceItemId");
CREATE INDEX "BenchmarkStudy_workspaceId_benchmarkAccountId_createdAt_idx" ON "BenchmarkStudy"("workspaceId", "benchmarkAccountId", "createdAt");
CREATE INDEX "BenchmarkStudy_workspaceId_status_idx" ON "BenchmarkStudy"("workspaceId", "status");
CREATE INDEX "BenchmarkStudy_createdById_idx" ON "BenchmarkStudy"("createdById");
CREATE INDEX "BenchmarkStudySample_sourceItemId_idx" ON "BenchmarkStudySample"("sourceItemId");
CREATE INDEX "BenchmarkStudySample_materialAnalysisId_idx" ON "BenchmarkStudySample"("materialAnalysisId");
CREATE INDEX "BenchmarkStudySample_snapshotId_idx" ON "BenchmarkStudySample"("snapshotId");

ALTER TABLE "BenchmarkStudy" ADD CONSTRAINT "BenchmarkStudy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudy" ADD CONSTRAINT "BenchmarkStudy_benchmarkAccountId_fkey" FOREIGN KEY ("benchmarkAccountId") REFERENCES "BenchmarkAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudy" ADD CONSTRAINT "BenchmarkStudy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudy" ADD CONSTRAINT "BenchmarkStudy_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BenchmarkStudySample" ADD CONSTRAINT "BenchmarkStudySample_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "BenchmarkStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudySample" ADD CONSTRAINT "BenchmarkStudySample_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudySample" ADD CONSTRAINT "BenchmarkStudySample_materialAnalysisId_fkey" FOREIGN KEY ("materialAnalysisId") REFERENCES "MaterialAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkStudySample" ADD CONSTRAINT "BenchmarkStudySample_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BenchmarkContentSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MethodVersion" ALTER COLUMN "sourceItemId" DROP NOT NULL;
ALTER TABLE "MethodVersion" ALTER COLUMN "sourceMaterialAnalysisId" DROP NOT NULL;
ALTER TABLE "MethodVersion" ALTER COLUMN "sourceTranscriptId" DROP NOT NULL;
ALTER TABLE "MethodVersion" ALTER COLUMN "sourceTranscriptUpdatedAt" DROP NOT NULL;
ALTER TABLE "MethodVersion" ADD COLUMN "sourceBenchmarkStudyId" TEXT;
CREATE INDEX "MethodVersion_sourceBenchmarkStudyId_idx" ON "MethodVersion"("sourceBenchmarkStudyId");
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_sourceBenchmarkStudyId_fkey" FOREIGN KEY ("sourceBenchmarkStudyId") REFERENCES "BenchmarkStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_source_kind_check" CHECK (
    ("sourceBenchmarkStudyId" IS NOT NULL AND "sourceItemId" IS NULL AND "sourceMaterialAnalysisId" IS NULL AND "sourceTranscriptId" IS NULL AND "sourceTranscriptUpdatedAt" IS NULL)
    OR
    ("sourceBenchmarkStudyId" IS NULL AND "sourceItemId" IS NOT NULL AND "sourceMaterialAnalysisId" IS NOT NULL AND "sourceTranscriptId" IS NOT NULL AND "sourceTranscriptUpdatedAt" IS NOT NULL)
);
