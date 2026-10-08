-- Phase 9C-1 is additive: existing project, draft, review, publishing, and AI tables remain unchanged.
CREATE TYPE "CanvasObjectType" AS ENUM ('TEXT', 'MATERIAL_REFERENCE', 'IMAGE_REFERENCE');
CREATE TYPE "CanvasSnapshotReason" AS ENUM ('MANUAL_CHECKPOINT', 'BEFORE_DELETE', 'AI_INPUT');
CREATE TYPE "CanvasRelationType" AS ENUM ('GENERATED_FROM');
CREATE TYPE "CanvasReferencePurpose" AS ENUM ('PRIMARY', 'CONTEXT');

CREATE TABLE "CanvasObject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "objectType" "CanvasObjectType" NOT NULL,
    "title" TEXT,
    "textContent" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "layoutVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanvasObject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CanvasObject_versions_check" CHECK ("contentVersion" >= 1 AND "layoutVersion" >= 1),
    CONSTRAINT "CanvasObject_size_check" CHECK ("width" >= 160 AND "height" >= 120),
    CONSTRAINT "CanvasObject_text_content_check" CHECK ("objectType" <> 'TEXT' OR "textContent" IS NOT NULL)
);

CREATE TABLE "CanvasObjectSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "objectType" "CanvasObjectType" NOT NULL,
    "objectContentVersion" INTEGER NOT NULL,
    "title" TEXT,
    "textContent" TEXT,
    "contentHash" TEXT,
    "snapshotReason" "CanvasSnapshotReason" NOT NULL,
    "referenceManifest" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvasObjectSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CanvasObjectSnapshot_version_check" CHECK ("objectContentVersion" >= 1)
);

CREATE TABLE "CanvasRelation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "relationType" "CanvasRelationType" NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "targetObjectId" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvasRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CanvasRelation_distinct_objects_check" CHECK ("sourceObjectId" <> "targetObjectId")
);

CREATE TABLE "CanvasMaterialReference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "canvasObjectId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "sourceAssetId" TEXT,
    "purpose" "CanvasReferencePurpose" NOT NULL DEFAULT 'PRIMARY',
    "excerpt" TEXT,
    "sourceTitleSnapshot" TEXT NOT NULL,
    "sourceTypeSnapshot" "SourceType" NOT NULL,
    "sourceUpdatedAtAtAttach" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvasMaterialReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanvasObject_workspaceId_projectId_deletedAt_updatedAt_idx" ON "CanvasObject"("workspaceId", "projectId", "deletedAt", "updatedAt");
CREATE INDEX "CanvasObject_projectId_deletedAt_zIndex_idx" ON "CanvasObject"("projectId", "deletedAt", "zIndex");
CREATE INDEX "CanvasObject_createdById_idx" ON "CanvasObject"("createdById");
CREATE INDEX "CanvasObject_updatedById_idx" ON "CanvasObject"("updatedById");
CREATE INDEX "CanvasObject_deletedById_idx" ON "CanvasObject"("deletedById");
CREATE INDEX "CanvasObjectSnapshot_workspaceId_projectId_createdAt_idx" ON "CanvasObjectSnapshot"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CanvasObjectSnapshot_objectId_objectContentVersion_createdA_idx" ON "CanvasObjectSnapshot"("objectId", "objectContentVersion", "createdAt");
CREATE INDEX "CanvasObjectSnapshot_createdById_idx" ON "CanvasObjectSnapshot"("createdById");
CREATE INDEX "CanvasRelation_workspaceId_projectId_createdAt_idx" ON "CanvasRelation"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CanvasRelation_sourceObjectId_idx" ON "CanvasRelation"("sourceObjectId");
CREATE INDEX "CanvasRelation_targetObjectId_idx" ON "CanvasRelation"("targetObjectId");
CREATE INDEX "CanvasRelation_sourceSnapshotId_idx" ON "CanvasRelation"("sourceSnapshotId");
CREATE INDEX "CanvasRelation_createdById_idx" ON "CanvasRelation"("createdById");
CREATE UNIQUE INDEX "CanvasMaterialReference_canvasObjectId_key" ON "CanvasMaterialReference"("canvasObjectId");
CREATE INDEX "CanvasMaterialReference_workspaceId_projectId_createdAt_idx" ON "CanvasMaterialReference"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CanvasMaterialReference_sourceItemId_idx" ON "CanvasMaterialReference"("sourceItemId");
CREATE INDEX "CanvasMaterialReference_sourceAssetId_idx" ON "CanvasMaterialReference"("sourceAssetId");

ALTER TABLE "CanvasObject" ADD CONSTRAINT "CanvasObject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasObject" ADD CONSTRAINT "CanvasObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasObject" ADD CONSTRAINT "CanvasObject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasObject" ADD CONSTRAINT "CanvasObject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasObject" ADD CONSTRAINT "CanvasObject_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CanvasObjectSnapshot" ADD CONSTRAINT "CanvasObjectSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasObjectSnapshot" ADD CONSTRAINT "CanvasObjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasObjectSnapshot" ADD CONSTRAINT "CanvasObjectSnapshot_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "CanvasObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasObjectSnapshot" ADD CONSTRAINT "CanvasObjectSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasRelation" ADD CONSTRAINT "CanvasRelation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasRelation" ADD CONSTRAINT "CanvasRelation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasRelation" ADD CONSTRAINT "CanvasRelation_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES "CanvasObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasRelation" ADD CONSTRAINT "CanvasRelation_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "CanvasObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasRelation" ADD CONSTRAINT "CanvasRelation_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "CanvasObjectSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasRelation" ADD CONSTRAINT "CanvasRelation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasMaterialReference" ADD CONSTRAINT "CanvasMaterialReference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasMaterialReference" ADD CONSTRAINT "CanvasMaterialReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasMaterialReference" ADD CONSTRAINT "CanvasMaterialReference_canvasObjectId_fkey" FOREIGN KEY ("canvasObjectId") REFERENCES "CanvasObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasMaterialReference" ADD CONSTRAINT "CanvasMaterialReference_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasMaterialReference" ADD CONSTRAINT "CanvasMaterialReference_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "SourceAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual, reverse order): drop the four Canvas tables, then the four Canvas enum types.
