-- M2 stores user-confirmed method snapshots without changing existing content data.
CREATE TYPE "MethodStatus" AS ENUM ('SAVED', 'TRIAL', 'CORE', 'DISABLED');

CREATE TABLE "MethodAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "MethodStatus" NOT NULL DEFAULT 'SAVED',
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MethodAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MethodVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "applicableScenarios" JSONB NOT NULL,
    "boundaries" JSONB NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "sourceMaterialAnalysisId" TEXT NOT NULL,
    "sourceTranscriptId" TEXT NOT NULL,
    "sourceTranscriptUpdatedAt" TIMESTAMP(3) NOT NULL,
    "evidence" JSONB NOT NULL,
    "editedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MethodVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MethodVersion_assetId_version_key" ON "MethodVersion"("assetId", "version");
CREATE INDEX "MethodAsset_workspaceId_ownerUserId_status_updatedAt_idx" ON "MethodAsset"("workspaceId", "ownerUserId", "status", "updatedAt");
CREATE INDEX "MethodVersion_sourceItemId_idx" ON "MethodVersion"("sourceItemId");
CREATE INDEX "MethodVersion_sourceMaterialAnalysisId_idx" ON "MethodVersion"("sourceMaterialAnalysisId");
CREATE INDEX "MethodVersion_sourceTranscriptId_idx" ON "MethodVersion"("sourceTranscriptId");

ALTER TABLE "MethodAsset" ADD CONSTRAINT "MethodAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodAsset" ADD CONSTRAINT "MethodAsset_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MethodAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_sourceMaterialAnalysisId_fkey" FOREIGN KEY ("sourceMaterialAnalysisId") REFERENCES "MaterialAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_sourceTranscriptId_fkey" FOREIGN KEY ("sourceTranscriptId") REFERENCES "Transcript"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
