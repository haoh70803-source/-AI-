CREATE TYPE "TrendPlatform" AS ENUM ('DOUYIN', 'XIAOHONGSHU', 'GLOBAL');
CREATE TYPE "TrendType" AS ENUM ('HOT', 'SURGING', 'DARK_HORSE');

ALTER TYPE "PromptType" ADD VALUE 'GENERATE_TOPIC_CANDIDATES';

ALTER TABLE "ContentIdea" ADD COLUMN "aiRationale" JSONB;
ALTER TABLE "ContentIdeaReference" ADD COLUMN "trendSnapshotId" TEXT;

ALTER TABLE "AIRun" DROP CONSTRAINT "AIRun_projectId_fkey";
ALTER TABLE "AIRun" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TrendSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "platform" "TrendPlatform" NOT NULL,
  "trendType" "TrendType" NOT NULL,
  "externalKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "keyword" TEXT,
  "rank" INTEGER,
  "metrics" JSONB NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrendSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrendSnapshot_workspaceId_platform_trendType_observedAt_idx"
  ON "TrendSnapshot"("workspaceId", "platform", "trendType", "observedAt");
CREATE INDEX "TrendSnapshot_workspaceId_externalKey_observedAt_idx"
  ON "TrendSnapshot"("workspaceId", "externalKey", "observedAt");
CREATE INDEX "TrendSnapshot_workspaceId_windowStart_windowEnd_idx"
  ON "TrendSnapshot"("workspaceId", "windowStart", "windowEnd");

CREATE UNIQUE INDEX "ContentIdeaReference_ideaId_trendSnapshotId_key"
  ON "ContentIdeaReference"("ideaId", "trendSnapshotId");
CREATE INDEX "ContentIdeaReference_trendSnapshotId_idx"
  ON "ContentIdeaReference"("trendSnapshotId");

ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentIdeaReference" ADD CONSTRAINT "ContentIdeaReference_trendSnapshotId_fkey"
  FOREIGN KEY ("trendSnapshotId") REFERENCES "TrendSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
