-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('VIDEO', 'IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('REMOTE', 'DOWNLOADING', 'STORED', 'FAILED');

-- CreateTable
CREATE TABLE "SourceAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "remoteUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "status" "AssetStatus" NOT NULL DEFAULT 'REMOTE',
    "metadata" JSONB,
    "storedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "success" BOOLEAN NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "cost" DECIMAL(65,30),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceAsset_workspaceId_createdAt_idx" ON "SourceAsset"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceAsset_workspaceId_sourceItemId_idx" ON "SourceAsset"("workspaceId", "sourceItemId");

-- CreateIndex
CREATE INDEX "SourceAsset_sourceItemId_status_idx" ON "SourceAsset"("sourceItemId", "status");

-- CreateIndex
CREATE INDEX "ApiUsage_workspaceId_createdAt_idx" ON "ApiUsage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_workspaceId_provider_operation_idx" ON "ApiUsage"("workspaceId", "provider", "operation");

-- CreateIndex
CREATE INDEX "ApiUsage_requestId_idx" ON "ApiUsage"("requestId");

-- AddForeignKey
ALTER TABLE "SourceAsset" ADD CONSTRAINT "SourceAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAsset" ADD CONSTRAINT "SourceAsset_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
