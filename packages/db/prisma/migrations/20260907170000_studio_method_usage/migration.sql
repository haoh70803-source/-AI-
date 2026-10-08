-- M3 records explicit method selections and the exact versions that entered a generation run.
CREATE TABLE "ProjectMethodSelection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "methodAssetId" TEXT NOT NULL,
    "methodVersionId" TEXT NOT NULL,
    "selectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectMethodSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MethodUsage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "methodAssetId" TEXT NOT NULL,
    "methodVersionId" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MethodUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectMethodSelection_projectId_selectedByUserId_methodAssetId_key" ON "ProjectMethodSelection"("projectId", "selectedByUserId", "methodAssetId");
CREATE INDEX "ProjectMethodSelection_projectId_selectedByUserId_idx" ON "ProjectMethodSelection"("projectId", "selectedByUserId");
CREATE INDEX "ProjectMethodSelection_methodVersionId_idx" ON "ProjectMethodSelection"("methodVersionId");
CREATE UNIQUE INDEX "MethodUsage_aiRunId_methodVersionId_key" ON "MethodUsage"("aiRunId", "methodVersionId");
CREATE INDEX "MethodUsage_projectId_userId_createdAt_idx" ON "MethodUsage"("projectId", "userId", "createdAt");
CREATE INDEX "MethodUsage_methodAssetId_methodVersionId_idx" ON "MethodUsage"("methodAssetId", "methodVersionId");

ALTER TABLE "ProjectMethodSelection" ADD CONSTRAINT "ProjectMethodSelection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMethodSelection" ADD CONSTRAINT "ProjectMethodSelection_methodAssetId_fkey" FOREIGN KEY ("methodAssetId") REFERENCES "MethodAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMethodSelection" ADD CONSTRAINT "ProjectMethodSelection_methodVersionId_fkey" FOREIGN KEY ("methodVersionId") REFERENCES "MethodVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMethodSelection" ADD CONSTRAINT "ProjectMethodSelection_selectedByUserId_fkey" FOREIGN KEY ("selectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodUsage" ADD CONSTRAINT "MethodUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsage" ADD CONSTRAINT "MethodUsage_methodAssetId_fkey" FOREIGN KEY ("methodAssetId") REFERENCES "MethodAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsage" ADD CONSTRAINT "MethodUsage_methodVersionId_fkey" FOREIGN KEY ("methodVersionId") REFERENCES "MethodVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsage" ADD CONSTRAINT "MethodUsage_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsage" ADD CONSTRAINT "MethodUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
