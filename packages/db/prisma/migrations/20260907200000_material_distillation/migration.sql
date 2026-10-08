-- M7 stores versioned, user-requested single-video distillations.
ALTER TYPE "IngestJobType" ADD VALUE 'DISTILL_MATERIAL';
ALTER TYPE "PromptType" ADD VALUE 'DISTILL_MATERIAL';
CREATE TYPE "MaterialDistillationMode" AS ENUM ('COMPREHENSIVE', 'COPYWRITING');
CREATE TYPE "MaterialDistillationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "MaterialDistillation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" "MaterialDistillationMode" NOT NULL,
    "status" "MaterialDistillationStatus" NOT NULL DEFAULT 'PROCESSING',
    "schemaVersion" TEXT NOT NULL,
    "output" JSONB,
    "aiRunId" TEXT,
    "transcriptUpdatedAtAtDistillation" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialDistillation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialDistillation_sourceItemId_version_key" ON "MaterialDistillation"("sourceItemId", "version");
CREATE UNIQUE INDEX "MaterialDistillation_aiRunId_key" ON "MaterialDistillation"("aiRunId");
CREATE INDEX "MaterialDistillation_workspaceId_sourceItemId_createdAt_idx" ON "MaterialDistillation"("workspaceId", "sourceItemId", "createdAt");
CREATE INDEX "MaterialDistillation_workspaceId_status_idx" ON "MaterialDistillation"("workspaceId", "status");
CREATE INDEX "MaterialDistillation_createdById_idx" ON "MaterialDistillation"("createdById");

ALTER TABLE "MaterialDistillation" ADD CONSTRAINT "MaterialDistillation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialDistillation" ADD CONSTRAINT "MaterialDistillation_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialDistillation" ADD CONSTRAINT "MaterialDistillation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialDistillation" ADD CONSTRAINT "MaterialDistillation_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MethodVersion" ADD COLUMN "sourceMaterialDistillationId" TEXT;
CREATE INDEX "MethodVersion_sourceMaterialDistillationId_idx" ON "MethodVersion"("sourceMaterialDistillationId");
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_sourceMaterialDistillationId_fkey" FOREIGN KEY ("sourceMaterialDistillationId") REFERENCES "MaterialDistillation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" DROP CONSTRAINT "MethodVersion_source_kind_check";
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_source_kind_check" CHECK (
    ("sourceMaterialDistillationId" IS NOT NULL AND "sourceBenchmarkStudyId" IS NULL AND "sourceItemId" IS NULL AND "sourceMaterialAnalysisId" IS NULL AND "sourceTranscriptId" IS NULL AND "sourceTranscriptUpdatedAt" IS NULL)
    OR
    ("sourceMaterialDistillationId" IS NULL AND "sourceBenchmarkStudyId" IS NOT NULL AND "sourceItemId" IS NULL AND "sourceMaterialAnalysisId" IS NULL AND "sourceTranscriptId" IS NULL AND "sourceTranscriptUpdatedAt" IS NULL)
    OR
    ("sourceMaterialDistillationId" IS NULL AND "sourceBenchmarkStudyId" IS NULL AND "sourceItemId" IS NOT NULL AND "sourceMaterialAnalysisId" IS NOT NULL AND "sourceTranscriptId" IS NOT NULL AND "sourceTranscriptUpdatedAt" IS NOT NULL)
);
