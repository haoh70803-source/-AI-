-- M6 stores explicit, user-owned feedback for the currently generated mother draft.
CREATE TYPE "CreationFeedbackOutcome" AS ENUM ('DIRECTLY_USED', 'USED_AFTER_EDIT', 'NOT_USED');
CREATE TYPE "MethodUsageFeedbackRating" AS ENUM ('HELPFUL', 'NEUTRAL', 'NOT_SUITABLE');

CREATE TABLE "CreationFeedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motherContentId" TEXT NOT NULL,
    "motherContentVersion" INTEGER NOT NULL,
    "sourceAiRunId" TEXT NOT NULL,
    "outcome" "CreationFeedbackOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreationFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MethodUsageFeedback" (
    "id" TEXT NOT NULL,
    "creationFeedbackId" TEXT NOT NULL,
    "methodUsageId" TEXT NOT NULL,
    "methodVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "MethodUsageFeedbackRating" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MethodUsageFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreationFeedback_userId_projectId_key" ON "CreationFeedback"("userId", "projectId");
CREATE UNIQUE INDEX "MethodUsageFeedback_creationFeedbackId_methodUsageId_key" ON "MethodUsageFeedback"("creationFeedbackId", "methodUsageId");
CREATE INDEX "CreationFeedback_workspaceId_projectId_createdAt_idx" ON "CreationFeedback"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CreationFeedback_sourceAiRunId_idx" ON "CreationFeedback"("sourceAiRunId");
CREATE INDEX "CreationFeedback_motherContentId_motherContentVersion_idx" ON "CreationFeedback"("motherContentId", "motherContentVersion");
CREATE INDEX "MethodUsageFeedback_methodUsageId_idx" ON "MethodUsageFeedback"("methodUsageId");
CREATE INDEX "MethodUsageFeedback_methodVersionId_idx" ON "MethodUsageFeedback"("methodVersionId");
CREATE INDEX "MethodUsageFeedback_userId_createdAt_idx" ON "MethodUsageFeedback"("userId", "createdAt");

ALTER TABLE "CreationFeedback" ADD CONSTRAINT "CreationFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreationFeedback" ADD CONSTRAINT "CreationFeedback_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreationFeedback" ADD CONSTRAINT "CreationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreationFeedback" ADD CONSTRAINT "CreationFeedback_motherContentId_fkey" FOREIGN KEY ("motherContentId") REFERENCES "MotherContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreationFeedback" ADD CONSTRAINT "CreationFeedback_sourceAiRunId_fkey" FOREIGN KEY ("sourceAiRunId") REFERENCES "AIRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MethodUsageFeedback" ADD CONSTRAINT "MethodUsageFeedback_creationFeedbackId_fkey" FOREIGN KEY ("creationFeedbackId") REFERENCES "CreationFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsageFeedback" ADD CONSTRAINT "MethodUsageFeedback_methodUsageId_fkey" FOREIGN KEY ("methodUsageId") REFERENCES "MethodUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsageFeedback" ADD CONSTRAINT "MethodUsageFeedback_methodVersionId_fkey" FOREIGN KEY ("methodVersionId") REFERENCES "MethodVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MethodUsageFeedback" ADD CONSTRAINT "MethodUsageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
