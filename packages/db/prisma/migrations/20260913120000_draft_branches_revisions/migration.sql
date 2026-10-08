CREATE TYPE "DraftRevisionOrigin" AS ENUM ('HUMAN', 'AI', 'GPT_WEB');

ALTER TABLE "ContentProject" ADD COLUMN "primaryDraftBranchId" TEXT;

CREATE TABLE "DraftBranch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentRevisionId" TEXT,
    "confirmedRevisionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftBranch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DraftBranch_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "DraftRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "draftBranchId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "outline" JSONB NOT NULL,
    "origin" "DraftRevisionOrigin" NOT NULL DEFAULT 'HUMAN',
    "originNote" TEXT,
    "generateRunId" TEXT,
    "warningSnapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DraftRevision_revision_check" CHECK ("revision" >= 1)
);

CREATE UNIQUE INDEX "ContentProject_primaryDraftBranchId_key" ON "ContentProject"("primaryDraftBranchId");
CREATE UNIQUE INDEX "DraftBranch_currentRevisionId_key" ON "DraftBranch"("currentRevisionId");
CREATE UNIQUE INDEX "DraftBranch_confirmedRevisionId_key" ON "DraftBranch"("confirmedRevisionId");
CREATE INDEX "DraftBranch_workspaceId_projectId_deletedAt_updatedAt_idx" ON "DraftBranch"("workspaceId", "projectId", "deletedAt", "updatedAt");
CREATE INDEX "DraftBranch_projectId_deletedAt_idx" ON "DraftBranch"("projectId", "deletedAt");
CREATE INDEX "DraftBranch_createdById_idx" ON "DraftBranch"("createdById");
CREATE INDEX "DraftBranch_updatedById_idx" ON "DraftBranch"("updatedById");
CREATE INDEX "DraftBranch_deletedById_idx" ON "DraftBranch"("deletedById");
CREATE UNIQUE INDEX "DraftRevision_draftBranchId_revision_key" ON "DraftRevision"("draftBranchId", "revision");
CREATE INDEX "DraftRevision_workspaceId_projectId_createdAt_idx" ON "DraftRevision"("workspaceId", "projectId", "createdAt");
CREATE INDEX "DraftRevision_projectId_draftBranchId_createdAt_idx" ON "DraftRevision"("projectId", "draftBranchId", "createdAt");
CREATE INDEX "DraftRevision_createdById_idx" ON "DraftRevision"("createdById");
CREATE INDEX "DraftRevision_generateRunId_idx" ON "DraftRevision"("generateRunId");

-- Every existing project gets one real primary branch. Projects without content
-- intentionally receive no revision, so the migration never invents a body.
INSERT INTO "DraftBranch" (
    "id", "workspaceId", "projectId", "title", "version", "createdById", "updatedById", "createdAt", "updatedAt"
)
SELECT
    'draft_branch_' || project."id",
    project."workspaceId",
    project."id",
    '主稿',
    0,
    project."createdById",
    project."createdById",
    project."createdAt",
    project."updatedAt"
FROM "ContentProject" project;

-- Only preserved audit snapshots with a real string body become history.
WITH valid_snapshots AS (
    SELECT
        audit."id" AS "auditId",
        audit."workspaceId",
        mother."projectId",
        mother."id" AS "motherId",
        audit."userId" AS "createdById",
        audit."createdAt",
        audit."metadata"->'snapshot' AS snapshot,
        ROW_NUMBER() OVER (PARTITION BY mother."id" ORDER BY audit."createdAt", audit."id")::INTEGER AS revision
    FROM "AuditLog" audit
    JOIN "MotherContent" mother ON mother."id" = audit."resourceId"
    WHERE audit."action" = 'mother_content.version_preserved'
      AND jsonb_typeof(audit."metadata"->'snapshot') = 'object'
      AND jsonb_typeof(audit."metadata"->'snapshot'->'body') = 'string'
)
INSERT INTO "DraftRevision" (
    "id", "workspaceId", "projectId", "draftBranchId", "revision", "title", "body", "outline", "origin", "originNote", "createdById", "createdAt"
)
SELECT
    'draft_revision_history_' || snapshot."auditId",
    snapshot."workspaceId",
    snapshot."projectId",
    'draft_branch_' || snapshot."projectId",
    snapshot.revision,
    CASE WHEN jsonb_typeof(snapshot.snapshot->'title') = 'string' THEN snapshot.snapshot->>'title' ELSE '' END,
    snapshot.snapshot->>'body',
    CASE WHEN jsonb_typeof(snapshot.snapshot->'outline') = 'array' THEN snapshot.snapshot->'outline' ELSE '[]'::jsonb END,
    CASE snapshot.snapshot->>'origin' WHEN 'KIMI' THEN 'AI'::"DraftRevisionOrigin" WHEN 'GPT_WEB' THEN 'GPT_WEB'::"DraftRevisionOrigin" ELSE 'HUMAN'::"DraftRevisionOrigin" END,
    CASE WHEN jsonb_typeof(snapshot.snapshot->'originNote') = 'string' THEN snapshot.snapshot->>'originNote' ELSE NULL END,
    snapshot."createdById",
    snapshot."createdAt"
FROM valid_snapshots snapshot;

-- The current MotherContent is always the last real revision.
WITH snapshot_counts AS (
    SELECT
        mother."id" AS "motherId",
        COUNT(audit."id") FILTER (
            WHERE audit."action" = 'mother_content.version_preserved'
              AND jsonb_typeof(audit."metadata"->'snapshot') = 'object'
              AND jsonb_typeof(audit."metadata"->'snapshot'->'body') = 'string'
        )::INTEGER AS count
    FROM "MotherContent" mother
    LEFT JOIN "AuditLog" audit ON audit."resourceId" = mother."id"
    GROUP BY mother."id"
)
INSERT INTO "DraftRevision" (
    "id", "workspaceId", "projectId", "draftBranchId", "revision", "title", "body", "outline", "origin", "originNote", "createdById", "createdAt"
)
SELECT
    'draft_revision_current_' || mother."id",
    mother."workspaceId",
    mother."projectId",
    'draft_branch_' || mother."projectId",
    counts.count + 1,
    mother."title",
    mother."body",
    mother."outline",
    CASE mother."origin"::text WHEN 'KIMI' THEN 'AI'::"DraftRevisionOrigin" WHEN 'GPT_WEB' THEN 'GPT_WEB'::"DraftRevisionOrigin" ELSE 'HUMAN'::"DraftRevisionOrigin" END,
    mother."originNote",
    mother."createdById",
    mother."updatedAt"
FROM "MotherContent" mother
JOIN snapshot_counts counts ON counts."motherId" = mother."id";

WITH snapshot_counts AS (
    SELECT
        mother."id" AS "motherId",
        COUNT(audit."id") FILTER (
            WHERE audit."action" = 'mother_content.version_preserved'
              AND jsonb_typeof(audit."metadata"->'snapshot') = 'object'
              AND jsonb_typeof(audit."metadata"->'snapshot'->'body') = 'string'
        )::INTEGER AS count
    FROM "MotherContent" mother
    LEFT JOIN "AuditLog" audit ON audit."resourceId" = mother."id"
    GROUP BY mother."id"
)
UPDATE "DraftBranch" branch
SET
    "currentRevisionId" = 'draft_revision_current_' || mother."id",
    "confirmedRevisionId" = CASE WHEN mother."confirmedVersion" = mother."version" THEN 'draft_revision_current_' || mother."id" ELSE NULL END,
    "version" = counts.count + 1,
    "updatedAt" = mother."updatedAt"
FROM "MotherContent" mother
JOIN snapshot_counts counts ON counts."motherId" = mother."id"
WHERE branch."projectId" = mother."projectId";

UPDATE "ContentProject"
SET "primaryDraftBranchId" = 'draft_branch_' || "id";

ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "DraftRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_confirmedRevisionId_fkey" FOREIGN KEY ("confirmedRevisionId") REFERENCES "DraftRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftBranch" ADD CONSTRAINT "DraftBranch_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_draftBranchId_fkey" FOREIGN KEY ("draftBranchId") REFERENCES "DraftBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentProject" ADD CONSTRAINT "ContentProject_primaryDraftBranchId_fkey" FOREIGN KEY ("primaryDraftBranchId") REFERENCES "DraftBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual, reverse order): drop the project FK/column, both Draft tables, then DraftRevisionOrigin.
