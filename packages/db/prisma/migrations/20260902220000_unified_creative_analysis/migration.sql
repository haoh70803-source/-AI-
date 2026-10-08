ALTER TYPE "PromptType" ADD VALUE 'UNIFIED_CREATIVE_ANALYSIS';

CREATE TYPE "UnifiedCreativeAnalysisStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "UnifiedCreativeAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "aiRunId" TEXT,
    "version" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'unified-creative-analysis-v1',
    "status" "UnifiedCreativeAnalysisStatus" NOT NULL DEFAULT 'PROCESSING',
    "inputFingerprint" TEXT NOT NULL,
    "output" JSONB,
    "provenance" JSONB NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UnifiedCreativeAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnifiedCreativeAnalysis_aiRunId_key" ON "UnifiedCreativeAnalysis"("aiRunId");
CREATE UNIQUE INDEX "UnifiedCreativeAnalysis_projectId_version_key" ON "UnifiedCreativeAnalysis"("projectId", "version");
CREATE UNIQUE INDEX "UnifiedCreativeAnalysis_projectId_inputFingerprint_key" ON "UnifiedCreativeAnalysis"("projectId", "inputFingerprint");
CREATE INDEX "UnifiedCreativeAnalysis_workspaceId_projectId_status_idx" ON "UnifiedCreativeAnalysis"("workspaceId", "projectId", "status");
CREATE INDEX "UnifiedCreativeAnalysis_createdById_idx" ON "UnifiedCreativeAnalysis"("createdById");

ALTER TABLE "UnifiedCreativeAnalysis" ADD CONSTRAINT "UnifiedCreativeAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnifiedCreativeAnalysis" ADD CONSTRAINT "UnifiedCreativeAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnifiedCreativeAnalysis" ADD CONSTRAINT "UnifiedCreativeAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnifiedCreativeAnalysis" ADD CONSTRAINT "UnifiedCreativeAnalysis_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
