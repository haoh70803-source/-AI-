CREATE TYPE "ResearchRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TABLE "ResearchSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "projectId" TEXT REFERENCES "ContentProject"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "entryTemplate" TEXT NOT NULL DEFAULT 'DIRECT',
  "requestKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ResearchSession_workspaceId_createdById_updatedAt_idx" ON "ResearchSession"("workspaceId", "createdById", "updatedAt");
CREATE INDEX "ResearchSession_projectId_idx" ON "ResearchSession"("projectId");
CREATE UNIQUE INDEX "ResearchSession_workspaceId_createdById_requestKey_key" ON "ResearchSession"("workspaceId", "createdById", "requestKey");
CREATE TABLE "ResearchRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "ResearchSession"("id") ON DELETE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ResearchRunStatus" NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "inputScope" JSONB NOT NULL,
  "sourceRefs" JSONB NOT NULL DEFAULT '[]',
  "coverage" JSONB NOT NULL DEFAULT '{}',
  "blocks" JSONB NOT NULL DEFAULT '[]',
  "schemaVersion" TEXT NOT NULL DEFAULT 'research-blocks-v1',
  "aiRunId" TEXT REFERENCES "AIRun"("id") ON DELETE SET NULL,
  "savedAt" TIMESTAMP(3),
  "resultTitle" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ResearchRun_aiRunId_key" ON "ResearchRun"("aiRunId");
CREATE UNIQUE INDEX "ResearchRun_sessionId_requestKey_key" ON "ResearchRun"("sessionId", "requestKey");
CREATE UNIQUE INDEX "ResearchRun_sessionId_version_key" ON "ResearchRun"("sessionId", "version");
CREATE INDEX "ResearchRun_workspaceId_requestedById_savedAt_idx" ON "ResearchRun"("workspaceId", "requestedById", "savedAt");
CREATE INDEX "ResearchRun_sessionId_createdAt_idx" ON "ResearchRun"("sessionId", "createdAt");
CREATE UNIQUE INDEX "ResearchRun_one_active_per_session" ON "ResearchRun"("sessionId") WHERE "status" IN ('QUEUED', 'RUNNING');
