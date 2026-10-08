DROP INDEX "AssistantThread_projectId_key";
ALTER TABLE "AssistantThread" ADD COLUMN "canvasObjectId" TEXT;
CREATE INDEX "AssistantThread_projectId_canvasObjectId_idx" ON "AssistantThread"("projectId", "canvasObjectId");
CREATE UNIQUE INDEX "AssistantThread_project_default_key" ON "AssistantThread"("projectId") WHERE "canvasObjectId" IS NULL;
CREATE UNIQUE INDEX "AssistantThread_canvas_object_key" ON "AssistantThread"("projectId", "canvasObjectId") WHERE "canvasObjectId" IS NOT NULL;
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_canvasObjectId_fkey" FOREIGN KEY ("canvasObjectId") REFERENCES "CanvasObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "CanvasGenerateRunStatus" AS ENUM ('PENDING', 'STREAMING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TABLE "CanvasGenerateRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceCanvasObjectId" TEXT NOT NULL,
    "resultCanvasObjectId" TEXT,
    "aiRunId" TEXT,
    "inputSnapshotId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" "CanvasGenerateRunStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "CanvasGenerateRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CanvasGenerateRun_aiRunId_key" ON "CanvasGenerateRun"("aiRunId");
CREATE INDEX "CanvasGenerateRun_workspaceId_projectId_createdAt_idx" ON "CanvasGenerateRun"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CanvasGenerateRun_sourceCanvasObjectId_createdAt_idx" ON "CanvasGenerateRun"("sourceCanvasObjectId", "createdAt");
CREATE INDEX "CanvasGenerateRun_resultCanvasObjectId_idx" ON "CanvasGenerateRun"("resultCanvasObjectId");
CREATE INDEX "CanvasGenerateRun_inputSnapshotId_idx" ON "CanvasGenerateRun"("inputSnapshotId");
CREATE INDEX "CanvasGenerateRun_createdById_idx" ON "CanvasGenerateRun"("createdById");
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_sourceCanvasObjectId_fkey" FOREIGN KEY ("sourceCanvasObjectId") REFERENCES "CanvasObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_resultCanvasObjectId_fkey" FOREIGN KEY ("resultCanvasObjectId") REFERENCES "CanvasObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_inputSnapshotId_fkey" FOREIGN KEY ("inputSnapshotId") REFERENCES "CanvasObjectSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanvasGenerateRun" ADD CONSTRAINT "CanvasGenerateRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
