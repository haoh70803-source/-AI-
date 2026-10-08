ALTER TABLE "DraftBranch"
  ADD COLUMN "workingTitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "workingBody" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "workingOutline" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "workingOrigin" "DraftRevisionOrigin" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "workingOriginNote" TEXT,
  ADD COLUMN "workingGenerateRunId" TEXT;

UPDATE "DraftBranch" branch
SET
  "workingTitle" = revision."title",
  "workingBody" = revision."body",
  "workingOutline" = revision."outline",
  "workingOrigin" = revision."origin",
  "workingOriginNote" = revision."originNote",
  "workingGenerateRunId" = revision."generateRunId"
FROM "DraftRevision" revision
WHERE branch."currentRevisionId" = revision."id";

-- Rollback (manual): remove the six working-state columns from DraftBranch.
