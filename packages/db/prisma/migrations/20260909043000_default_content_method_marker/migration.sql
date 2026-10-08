-- A workspace default method can aggregate several provenance kinds, so it cannot pretend to have one legacy source FK.
ALTER TABLE "MethodVersion" ADD COLUMN "workspaceDefaultKey" TEXT;

CREATE INDEX "MethodVersion_workspaceDefaultKey_idx" ON "MethodVersion"("workspaceDefaultKey");

ALTER TABLE "MethodVersion" DROP CONSTRAINT "MethodVersion_source_kind_check";
ALTER TABLE "MethodVersion" ADD CONSTRAINT "MethodVersion_source_kind_check" CHECK (
    ("workspaceDefaultKey" = 'DEFAULT_CONTENT' AND "sourceMaterialDistillationId" IS NULL AND "sourceBenchmarkStudyId" IS NULL AND "sourceItemId" IS NULL AND "sourceMaterialAnalysisId" IS NULL AND "sourceTranscriptId" IS NULL AND "sourceTranscriptUpdatedAt" IS NULL)
    OR
    ("workspaceDefaultKey" IS NULL AND "sourceMaterialDistillationId" IS NOT NULL AND "sourceBenchmarkStudyId" IS NULL AND "sourceItemId" IS NULL AND "sourceMaterialAnalysisId" IS NULL AND "sourceTranscriptId" IS NULL AND "sourceTranscriptUpdatedAt" IS NULL)
    OR
    ("workspaceDefaultKey" IS NULL AND "sourceMaterialDistillationId" IS NULL AND "sourceBenchmarkStudyId" IS NOT NULL AND "sourceItemId" IS NULL AND "sourceMaterialAnalysisId" IS NULL AND "sourceTranscriptId" IS NULL AND "sourceTranscriptUpdatedAt" IS NULL)
    OR
    ("workspaceDefaultKey" IS NULL AND "sourceMaterialDistillationId" IS NULL AND "sourceBenchmarkStudyId" IS NULL AND "sourceItemId" IS NOT NULL AND "sourceMaterialAnalysisId" IS NOT NULL AND "sourceTranscriptId" IS NOT NULL AND "sourceTranscriptUpdatedAt" IS NOT NULL)
);
