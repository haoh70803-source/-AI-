ALTER TYPE "PromptType" ADD VALUE 'METHOD_SUGGESTION_FROM_RESEARCH';
ALTER TYPE "PromptType" ADD VALUE 'CREATOR_PROFILE_SUGGESTION';
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "MethodSuggestionType" AS ENUM ('OPENING', 'STRUCTURE', 'VIEWPOINT_PROGRESSION', 'CASE_USAGE', 'EVIDENCE_USAGE', 'ENDING', 'RHYTHM', 'BOUNDARY');
CREATE TYPE "MethodSuggestionStability" AS ENUM ('LIMITED', 'STABLE');
CREATE TYPE "CreatorProfileSuggestionType" AS ENUM ('CORE_TOPIC', 'PERSONAL_VIEW', 'HOOK_PREFERENCE', 'STRUCTURE_PREFERENCE', 'PREFERRED_STYLE', 'FORBIDDEN_STYLE', 'EXAMPLE_PHRASE');

CREATE TABLE "MethodSuggestion" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourceBenchmarkStudyId" TEXT NOT NULL,
  "sourceMethodIndex" INTEGER NOT NULL,
  "type" "MethodSuggestionType" NOT NULL,
  "title" TEXT NOT NULL,
  "steps" JSONB NOT NULL,
  "applicableScenarios" JSONB NOT NULL,
  "boundaries" JSONB NOT NULL,
  "rationale" TEXT NOT NULL,
  "stability" "MethodSuggestionStability" NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "sourceRefs" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT NOT NULL,
  "savedMethodAssetId" TEXT,
  "generatedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MethodSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreatorProfileSuggestion" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "creatorProfileId" TEXT,
  "targetUserId" TEXT NOT NULL,
  "type" "CreatorProfileSuggestionType" NOT NULL,
  "currentValue" JSONB NOT NULL,
  "proposedValue" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "evidenceRefs" JSONB NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT NOT NULL,
  "generatedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorProfileSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MethodSuggestion_dedupeKey_key" ON "MethodSuggestion"("dedupeKey");
CREATE UNIQUE INDEX "MethodSuggestion_savedMethodAssetId_key" ON "MethodSuggestion"("savedMethodAssetId");
CREATE INDEX "MethodSuggestion_workspaceId_ownerUserId_status_createdAt_idx" ON "MethodSuggestion"("workspaceId", "ownerUserId", "status", "createdAt");
CREATE INDEX "MethodSuggestion_sourceBenchmarkStudyId_status_idx" ON "MethodSuggestion"("sourceBenchmarkStudyId", "status");
CREATE INDEX "MethodSuggestion_generatedById_idx" ON "MethodSuggestion"("generatedById");
CREATE INDEX "MethodSuggestion_reviewedById_idx" ON "MethodSuggestion"("reviewedById");
CREATE UNIQUE INDEX "CreatorProfileSuggestion_dedupeKey_key" ON "CreatorProfileSuggestion"("dedupeKey");
CREATE INDEX "CreatorProfileSuggestion_workspaceId_targetUserId_status_createdAt_idx" ON "CreatorProfileSuggestion"("workspaceId", "targetUserId", "status", "createdAt");
CREATE INDEX "CreatorProfileSuggestion_creatorProfileId_status_idx" ON "CreatorProfileSuggestion"("creatorProfileId", "status");
CREATE INDEX "CreatorProfileSuggestion_generatedById_idx" ON "CreatorProfileSuggestion"("generatedById");
CREATE INDEX "CreatorProfileSuggestion_reviewedById_idx" ON "CreatorProfileSuggestion"("reviewedById");

ALTER TABLE "MethodSuggestion" ADD CONSTRAINT "MethodSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodSuggestion" ADD CONSTRAINT "MethodSuggestion_sourceBenchmarkStudyId_fkey" FOREIGN KEY ("sourceBenchmarkStudyId") REFERENCES "BenchmarkStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodSuggestion" ADD CONSTRAINT "MethodSuggestion_savedMethodAssetId_fkey" FOREIGN KEY ("savedMethodAssetId") REFERENCES "MethodAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MethodSuggestion" ADD CONSTRAINT "MethodSuggestion_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodSuggestion" ADD CONSTRAINT "MethodSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreatorProfileSuggestion" ADD CONSTRAINT "CreatorProfileSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorProfileSuggestion" ADD CONSTRAINT "CreatorProfileSuggestion_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorProfileSuggestion" ADD CONSTRAINT "CreatorProfileSuggestion_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreatorProfileSuggestion" ADD CONSTRAINT "CreatorProfileSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
