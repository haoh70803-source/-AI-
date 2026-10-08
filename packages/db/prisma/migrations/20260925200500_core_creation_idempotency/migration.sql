ALTER TABLE "ContentProject" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "ContentProject_workspaceId_createdById_clientRequestId_key" ON "ContentProject"("workspaceId", "createdById", "clientRequestId");
