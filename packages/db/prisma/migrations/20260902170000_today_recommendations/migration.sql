ALTER TYPE "PromptType" ADD VALUE 'GENERATE_TODAY_RECOMMENDATIONS';

CREATE TYPE "RecommendationMode" AS ENUM ('DETERMINISTIC', 'AI_ASSISTED');
CREATE TYPE "RecommendationItemStatus" AS ENUM ('NEW', 'SAVED', 'STARTED', 'DISMISSED');
CREATE TYPE "RecommendationEvidenceType" AS ENUM ('TREND', 'BENCHMARK_CONTENT', 'CONTENT_IDEA', 'SOURCE_ITEM', 'PROJECT', 'CREATOR_PROFILE');

CREATE TABLE "BenchmarkContentSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "benchmarkAccountId" TEXT NOT NULL,
  "platform" "SourcePlatform" NOT NULL,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "authorName" TEXT,
  "coverUrl" TEXT,
  "metadata" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkContentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationBatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "creatorProfileId" TEXT,
  "mode" "RecommendationMode" NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "aiRunId" TEXT,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "RecommendationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "coreQuestion" TEXT NOT NULL,
  "angle" TEXT NOT NULL,
  "whyRecommended" TEXT NOT NULL,
  "whyNow" TEXT NOT NULL,
  "creatorFit" TEXT NOT NULL,
  "differenceFromRecentContent" TEXT NOT NULL,
  "suggestedNextStep" TEXT NOT NULL,
  "riskNotes" JSONB NOT NULL,
  "recommendedFormat" TEXT,
  "status" "RecommendationItemStatus" NOT NULL DEFAULT 'NEW',
  "contentIdeaId" TEXT,
  "projectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecommendationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationEvidence" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "recommendationItemId" TEXT NOT NULL,
  "type" "RecommendationEvidenceType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkContentSnapshot_workspaceId_platform_externalId_key" ON "BenchmarkContentSnapshot"("workspaceId", "platform", "externalId");
CREATE INDEX "BenchmarkContentSnapshot_workspaceId_observedAt_idx" ON "BenchmarkContentSnapshot"("workspaceId", "observedAt");
CREATE INDEX "BenchmarkContentSnapshot_benchmarkAccountId_observedAt_idx" ON "BenchmarkContentSnapshot"("benchmarkAccountId", "observedAt");
CREATE UNIQUE INDEX "RecommendationBatch_aiRunId_key" ON "RecommendationBatch"("aiRunId");
CREATE INDEX "RecommendationBatch_workspaceId_createdById_generatedAt_idx" ON "RecommendationBatch"("workspaceId", "createdById", "generatedAt");
CREATE INDEX "RecommendationBatch_creatorProfileId_idx" ON "RecommendationBatch"("creatorProfileId");
CREATE UNIQUE INDEX "RecommendationItem_batchId_position_key" ON "RecommendationItem"("batchId", "position");
CREATE INDEX "RecommendationItem_workspaceId_status_createdAt_idx" ON "RecommendationItem"("workspaceId", "status", "createdAt");
CREATE INDEX "RecommendationItem_contentIdeaId_idx" ON "RecommendationItem"("contentIdeaId");
CREATE INDEX "RecommendationItem_projectId_idx" ON "RecommendationItem"("projectId");
CREATE UNIQUE INDEX "RecommendationEvidence_recommendationItemId_type_referenceId_key" ON "RecommendationEvidence"("recommendationItemId", "type", "referenceId");
CREATE INDEX "RecommendationEvidence_workspaceId_type_referenceId_idx" ON "RecommendationEvidence"("workspaceId", "type", "referenceId");

ALTER TABLE "BenchmarkContentSnapshot" ADD CONSTRAINT "BenchmarkContentSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkContentSnapshot" ADD CONSTRAINT "BenchmarkContentSnapshot_benchmarkAccountId_fkey" FOREIGN KEY ("benchmarkAccountId") REFERENCES "BenchmarkAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvidence" ADD CONSTRAINT "RecommendationEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvidence" ADD CONSTRAINT "RecommendationEvidence_recommendationItemId_fkey" FOREIGN KEY ("recommendationItemId") REFERENCES "RecommendationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
