CREATE TABLE "ResearchObjectPreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "trendProvider" TEXT,
  "trendPlatform" "TrendPlatform",
  "trendType" "TrendType",
  "trendExternalKey" TEXT,
  "followedAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ResearchObjectPreference_workspaceId_userId_kind_objectKey_key" ON "ResearchObjectPreference"("workspaceId", "userId", "kind", "objectKey");
CREATE INDEX "ResearchObjectPreference_workspaceId_userId_kind_viewedAt_idx" ON "ResearchObjectPreference"("workspaceId", "userId", "kind", "viewedAt");
CREATE INDEX "ResearchObjectPreference_workspaceId_userId_kind_followedAt_idx" ON "ResearchObjectPreference"("workspaceId", "userId", "kind", "followedAt");
CREATE INDEX "ResearchObjectPreference_workspaceId_userId_trend_identity_idx" ON "ResearchObjectPreference"("workspaceId", "userId", "trendProvider", "trendPlatform", "trendType", "trendExternalKey");
