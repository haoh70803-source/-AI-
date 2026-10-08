ALTER TYPE "PromptType" ADD VALUE 'ANALYZE_MATERIAL';

CREATE TYPE "MaterialAnalysisStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "MaterialAnalysisOrigin" AS ENUM ('AI', 'HUMAN');

CREATE TABLE "MaterialAnalysis" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceItemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "MaterialAnalysisStatus" NOT NULL DEFAULT 'PROCESSING',
  "suggestedTitle" TEXT,
  "summary" TEXT,
  "topic" TEXT,
  "tags" JSONB NOT NULL,
  "keywords" JSONB NOT NULL,
  "contentType" TEXT,
  "targetAudience" TEXT,
  "coreViewpoint" TEXT,
  "keyPoints" JSONB NOT NULL,
  "coreQuestion" TEXT,
  "origin" "MaterialAnalysisOrigin" NOT NULL DEFAULT 'AI',
  "aiRunId" TEXT,
  "transcriptUpdatedAtAtAnalysis" TIMESTAMP(3) NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialAnalysis_aiRunId_key" ON "MaterialAnalysis"("aiRunId");
CREATE UNIQUE INDEX "MaterialAnalysis_sourceItemId_version_key" ON "MaterialAnalysis"("sourceItemId", "version");
CREATE INDEX "MaterialAnalysis_workspaceId_sourceItemId_createdAt_idx" ON "MaterialAnalysis"("workspaceId", "sourceItemId", "createdAt");
CREATE INDEX "MaterialAnalysis_workspaceId_status_idx" ON "MaterialAnalysis"("workspaceId", "status");
CREATE INDEX "MaterialAnalysis_createdById_idx" ON "MaterialAnalysis"("createdById");

ALTER TABLE "MaterialAnalysis" ADD CONSTRAINT "MaterialAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAnalysis" ADD CONSTRAINT "MaterialAnalysis_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAnalysis" ADD CONSTRAINT "MaterialAnalysis_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialAnalysis" ADD CONSTRAINT "MaterialAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
