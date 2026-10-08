CREATE TYPE "SourceUnderstandingStatus" AS ENUM ('NOT_STARTED', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "SourceUnderstanding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "status" "SourceUnderstandingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "runId" TEXT,
    "text" TEXT,
    "pages" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SourceUnderstanding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SourceUnderstanding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SourceUnderstanding_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SourceUnderstanding_sourceItemId_key" ON "SourceUnderstanding"("sourceItemId");
CREATE INDEX "SourceUnderstanding_workspaceId_status_idx" ON "SourceUnderstanding"("workspaceId", "status");
