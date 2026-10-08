-- Align existing FK update actions and index names; no table or column deletion.
BEGIN;
-- DropForeignKey
ALTER TABLE "ResearchObjectPreference" DROP CONSTRAINT IF EXISTS "ResearchObjectPreference_userId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchObjectPreference" DROP CONSTRAINT IF EXISTS "ResearchObjectPreference_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchRun" DROP CONSTRAINT IF EXISTS "ResearchRun_aiRunId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchRun" DROP CONSTRAINT IF EXISTS "ResearchRun_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "ResearchRun" DROP CONSTRAINT IF EXISTS "ResearchRun_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchRun" DROP CONSTRAINT IF EXISTS "ResearchRun_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchSession" DROP CONSTRAINT IF EXISTS "ResearchSession_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ResearchSession" DROP CONSTRAINT IF EXISTS "ResearchSession_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchSession" DROP CONSTRAINT IF EXISTS "ResearchSession_workspaceId_fkey";

-- AddForeignKey
ALTER TABLE "ResearchObjectPreference" ADD CONSTRAINT "ResearchObjectPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchObjectPreference" ADD CONSTRAINT "ResearchObjectPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
DO $$ BEGIN IF to_regclass('public."BenchmarkCollectionRun_workspaceId_benchmarkAccountId_createdAt"') IS NOT NULL AND to_regclass('public."BenchmarkCollectionRun_workspaceId_benchmarkAccountId_creat_idx"') IS NULL THEN ALTER INDEX "BenchmarkCollectionRun_workspaceId_benchmarkAccountId_createdAt" RENAME TO "BenchmarkCollectionRun_workspaceId_benchmarkAccountId_creat_idx"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('public."BenchmarkCollectionRunItem_collectionRunId_inRange_publishedAt_"') IS NOT NULL AND to_regclass('public."BenchmarkCollectionRunItem_collectionRunId_inRange_publishe_idx"') IS NULL THEN ALTER INDEX "BenchmarkCollectionRunItem_collectionRunId_inRange_publishedAt_" RENAME TO "BenchmarkCollectionRunItem_collectionRunId_inRange_publishe_idx"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('public."CreatorProfileSuggestion_workspaceId_targetUserId_status_create"') IS NOT NULL AND to_regclass('public."CreatorProfileSuggestion_workspaceId_targetUserId_status_cr_idx"') IS NULL THEN ALTER INDEX "CreatorProfileSuggestion_workspaceId_targetUserId_status_create" RENAME TO "CreatorProfileSuggestion_workspaceId_targetUserId_status_cr_idx"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('public."ProjectMethodSelection_projectId_selectedByUserId_methodAssetId"') IS NOT NULL AND to_regclass('public."ProjectMethodSelection_projectId_selectedByUserId_methodAss_key"') IS NULL THEN ALTER INDEX "ProjectMethodSelection_projectId_selectedByUserId_methodAssetId" RENAME TO "ProjectMethodSelection_projectId_selectedByUserId_methodAss_key"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('public."RecommendationEvidence_recommendationItemId_type_referenceId_ke"') IS NOT NULL AND to_regclass('public."RecommendationEvidence_recommendationItemId_type_referenceI_key"') IS NULL THEN ALTER INDEX "RecommendationEvidence_recommendationItemId_type_referenceId_ke" RENAME TO "RecommendationEvidence_recommendationItemId_type_referenceI_key"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('public."ResearchObjectPreference_workspaceId_userId_trend_identity_idx"') IS NOT NULL AND to_regclass('public."ResearchObjectPreference_workspaceId_userId_trendProvider_t_idx"') IS NULL THEN ALTER INDEX "ResearchObjectPreference_workspaceId_userId_trend_identity_idx" RENAME TO "ResearchObjectPreference_workspaceId_userId_trendProvider_t_idx"; END IF; END $$;


COMMIT;
