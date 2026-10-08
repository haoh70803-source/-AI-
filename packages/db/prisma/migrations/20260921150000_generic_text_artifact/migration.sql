CREATE TYPE "ArtifactType" AS ENUM ('TEXT');

CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "draftBranchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL DEFAULT 'TEXT',
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AssistantMessage" ADD COLUMN "artifactId" TEXT;

CREATE UNIQUE INDEX "Artifact_draftBranchId_key" ON "Artifact"("draftBranchId");
CREATE INDEX "Artifact_workspaceId_projectId_updatedAt_idx" ON "Artifact"("workspaceId", "projectId", "updatedAt");
CREATE INDEX "AssistantMessage_artifactId_createdAt_idx" ON "AssistantMessage"("artifactId", "createdAt");

ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_draftBranchId_fkey" FOREIGN KEY ("draftBranchId") REFERENCES "DraftBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
