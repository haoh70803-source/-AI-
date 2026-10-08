-- CreateEnum
CREATE TYPE "ContentProjectStatus" AS ENUM ('DRAFT', 'RESEARCHING', 'BRIEF_READY', 'WRITING', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectSourceRole" AS ENUM ('REFERENCE', 'EVIDENCE', 'INSPIRATION', 'OWN_MATERIAL');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('FACT', 'VIEWPOINT', 'CASE', 'DATA', 'QUOTE', 'EXPERIENCE', 'QUESTION', 'OTHER');

-- CreateTable
CREATE TABLE "ContentProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "audience" TEXT,
    "status" "ContentProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "role" "ProjectSourceRole" NOT NULL DEFAULT 'REFERENCE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "type" "EvidenceType" NOT NULL,
    "excerpt" TEXT,
    "claim" TEXT,
    "note" TEXT,
    "sourceUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeBrief" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "coreMessage" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "structure" JSONB NOT NULL,
    "tone" TEXT NOT NULL,
    "risks" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotherContent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "outline" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MotherContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentProject_workspaceId_createdAt_idx" ON "ContentProject"("workspaceId", "createdAt");
CREATE INDEX "ContentProject_workspaceId_status_idx" ON "ContentProject"("workspaceId", "status");
CREATE INDEX "ContentProject_createdById_idx" ON "ContentProject"("createdById");
CREATE UNIQUE INDEX "ProjectSource_projectId_sourceItemId_key" ON "ProjectSource"("projectId", "sourceItemId");
CREATE INDEX "ProjectSource_sourceItemId_idx" ON "ProjectSource"("sourceItemId");
CREATE INDEX "ProjectSource_projectId_sortOrder_idx" ON "ProjectSource"("projectId", "sortOrder");
CREATE INDEX "EvidenceItem_workspaceId_projectId_sortOrder_idx" ON "EvidenceItem"("workspaceId", "projectId", "sortOrder");
CREATE INDEX "EvidenceItem_sourceItemId_idx" ON "EvidenceItem"("sourceItemId");
CREATE INDEX "EvidenceItem_createdById_idx" ON "EvidenceItem"("createdById");
CREATE UNIQUE INDEX "CreativeBrief_projectId_key" ON "CreativeBrief"("projectId");
CREATE INDEX "CreativeBrief_workspaceId_updatedAt_idx" ON "CreativeBrief"("workspaceId", "updatedAt");
CREATE INDEX "CreativeBrief_createdById_idx" ON "CreativeBrief"("createdById");
CREATE UNIQUE INDEX "MotherContent_projectId_key" ON "MotherContent"("projectId");
CREATE INDEX "MotherContent_workspaceId_updatedAt_idx" ON "MotherContent"("workspaceId", "updatedAt");
CREATE INDEX "MotherContent_createdById_idx" ON "MotherContent"("createdById");

-- AddForeignKey
ALTER TABLE "ContentProject" ADD CONSTRAINT "ContentProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentProject" ADD CONSTRAINT "ContentProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectSource" ADD CONSTRAINT "ProjectSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSource" ADD CONSTRAINT "ProjectSource_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MotherContent" ADD CONSTRAINT "MotherContent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotherContent" ADD CONSTRAINT "MotherContent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotherContent" ADD CONSTRAINT "MotherContent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
