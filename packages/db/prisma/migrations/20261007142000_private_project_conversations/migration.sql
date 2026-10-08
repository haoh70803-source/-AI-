BEGIN;
-- Existing conversations remain private to their creator; no messages are moved.
DROP INDEX "AssistantThread_project_default_key";
CREATE UNIQUE INDEX "AssistantThread_project_member_default_key" ON "AssistantThread" ("projectId", "createdById") WHERE "canvasObjectId" IS NULL;
CREATE INDEX "AssistantThread_projectId_createdById_canvasObjectId_idx" ON "AssistantThread" ("projectId", "createdById", "canvasObjectId");
COMMIT;
