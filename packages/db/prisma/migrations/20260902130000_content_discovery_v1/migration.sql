CREATE TYPE "ContentIdeaStatus" AS ENUM ('INBOX', 'READY', 'IN_PROGRESS', 'DONE', 'ARCHIVED');

ALTER TABLE "SourceItem"
ADD COLUMN "externalId" TEXT,
ADD COLUMN "sourceProvider" TEXT;

CREATE TABLE "BenchmarkAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "creatorProfileId" TEXT,
    "platform" "SourcePlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "originalUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BenchmarkAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "creatorProfileId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContentIdeaStatus" NOT NULL DEFAULT 'INBOX',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentIdeaReference" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "platform" "SourcePlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorName" TEXT,
    "coverUrl" TEXT,
    "metadataSnapshot" JSONB,
    "sourceItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentIdeaReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceItem_workspaceId_sourcePlatform_externalId_key" ON "SourceItem"("workspaceId", "sourcePlatform", "externalId");
CREATE UNIQUE INDEX "BenchmarkAccount_workspaceId_platform_externalAccountId_key" ON "BenchmarkAccount"("workspaceId", "platform", "externalAccountId");
CREATE INDEX "BenchmarkAccount_workspaceId_enabled_updatedAt_idx" ON "BenchmarkAccount"("workspaceId", "enabled", "updatedAt");
CREATE INDEX "BenchmarkAccount_creatorProfileId_idx" ON "BenchmarkAccount"("creatorProfileId");
CREATE UNIQUE INDEX "ContentIdea_projectId_key" ON "ContentIdea"("projectId");
CREATE INDEX "ContentIdea_workspaceId_status_updatedAt_idx" ON "ContentIdea"("workspaceId", "status", "updatedAt");
CREATE INDEX "ContentIdea_creatorProfileId_idx" ON "ContentIdea"("creatorProfileId");
CREATE INDEX "ContentIdea_createdById_idx" ON "ContentIdea"("createdById");
CREATE UNIQUE INDEX "ContentIdeaReference_ideaId_platform_externalId_key" ON "ContentIdeaReference"("ideaId", "platform", "externalId");
CREATE INDEX "ContentIdeaReference_sourceItemId_idx" ON "ContentIdeaReference"("sourceItemId");

ALTER TABLE "BenchmarkAccount" ADD CONSTRAINT "BenchmarkAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkAccount" ADD CONSTRAINT "BenchmarkAccount_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenchmarkAccount" ADD CONSTRAINT "BenchmarkAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentIdeaReference" ADD CONSTRAINT "ContentIdeaReference_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentIdeaReference" ADD CONSTRAINT "ContentIdeaReference_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
