-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'READY_TO_PUBLISH', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PublishTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platformVariantId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publisherId" TEXT,
    "createdById" TEXT NOT NULL,
    "externalUrl" TEXT,
    "externalPostId" TEXT,
    "note" TEXT,
    "contentSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishTask_workspaceId_status_scheduledAt_idx" ON "PublishTask"("workspaceId", "status", "scheduledAt");
CREATE INDEX "PublishTask_workspaceId_platform_createdAt_idx" ON "PublishTask"("workspaceId", "platform", "createdAt");
CREATE INDEX "PublishTask_projectId_createdAt_idx" ON "PublishTask"("projectId", "createdAt");
CREATE INDEX "PublishTask_platformVariantId_createdAt_idx" ON "PublishTask"("platformVariantId", "createdAt");
CREATE INDEX "PublishTask_createdById_idx" ON "PublishTask"("createdById");
CREATE INDEX "PublishTask_publisherId_idx" ON "PublishTask"("publisherId");

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_platformVariantId_fkey" FOREIGN KEY ("platformVariantId") REFERENCES "PlatformVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
