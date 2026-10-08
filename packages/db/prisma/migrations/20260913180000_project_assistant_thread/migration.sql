ALTER TYPE "PromptType" ADD VALUE 'PROJECT_ASSISTANT';

CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AssistantMessageStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED', 'STOPPED');

CREATE TABLE "AssistantThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AssistantMessageStatus" NOT NULL DEFAULT 'PENDING',
    "aiRunId" TEXT,
    "metadata" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistantThread_projectId_key" ON "AssistantThread"("projectId");
CREATE INDEX "AssistantThread_workspaceId_updatedAt_idx" ON "AssistantThread"("workspaceId", "updatedAt");
CREATE INDEX "AssistantThread_createdById_idx" ON "AssistantThread"("createdById");
CREATE UNIQUE INDEX "AssistantMessage_aiRunId_key" ON "AssistantMessage"("aiRunId");
CREATE INDEX "AssistantMessage_threadId_createdAt_idx" ON "AssistantMessage"("threadId", "createdAt");
CREATE INDEX "AssistantMessage_threadId_status_idx" ON "AssistantMessage"("threadId", "status");

ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
