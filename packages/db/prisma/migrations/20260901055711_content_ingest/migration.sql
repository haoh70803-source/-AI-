-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TEXT', 'URL', 'VIDEO', 'AUDIO', 'IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "SourcePlatform" AS ENUM ('GENERIC', 'DOUYIN', 'XIAOHONGSHU', 'WECHAT', 'BILIBILI', 'YOUTUBE', 'TIKTOK', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IngestJobType" AS ENUM ('EXTRACT_TEXT', 'FETCH_URL', 'TRANSCRIBE', 'PROCESS_MEDIA');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderMode" AS ENUM ('REAL', 'MOCK');

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourcePlatform" "SourcePlatform" NOT NULL DEFAULT 'GENERIC',
    "sourceUrl" TEXT,
    "canonicalUrl" TEXT,
    "title" TEXT,
    "author" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "rawText" TEXT,
    "status" "SourceItemStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "jobType" "IngestJobType" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "language" TEXT,
    "durationMs" INTEGER,
    "fullText" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceItemTag" (
    "sourceItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceItemTag_pkey" PRIMARY KEY ("sourceItemId","tagId")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "collectionId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId","sourceItemId")
);

-- CreateIndex
CREATE INDEX "SourceItem_workspaceId_createdAt_idx" ON "SourceItem"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceItem_workspaceId_status_idx" ON "SourceItem"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "SourceItem_workspaceId_sourcePlatform_idx" ON "SourceItem"("workspaceId", "sourcePlatform");

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_workspaceId_canonicalUrl_key" ON "SourceItem"("workspaceId", "canonicalUrl");

-- CreateIndex
CREATE INDEX "IngestJob_workspaceId_createdAt_idx" ON "IngestJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "IngestJob_workspaceId_status_idx" ON "IngestJob"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "IngestJob_sourceItemId_createdAt_idx" ON "IngestJob"("sourceItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_sourceItemId_key" ON "Transcript"("sourceItemId");

-- CreateIndex
CREATE INDEX "Transcript_workspaceId_createdAt_idx" ON "Transcript"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentTag_workspaceId_name_idx" ON "ContentTag"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTag_workspaceId_slug_key" ON "ContentTag"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "SourceItemTag_tagId_idx" ON "SourceItemTag"("tagId");

-- CreateIndex
CREATE INDEX "Collection_workspaceId_createdAt_idx" ON "Collection"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_workspaceId_name_key" ON "Collection"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "CollectionItem_sourceItemId_idx" ON "CollectionItem"("sourceItemId");

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItemTag" ADD CONSTRAINT "SourceItemTag_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItemTag" ADD CONSTRAINT "SourceItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ContentTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
