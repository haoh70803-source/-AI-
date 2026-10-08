CREATE TABLE "ProjectFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProjectPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "pinnedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProjectPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectFolder_workspaceId_userId_name_key" ON "ProjectFolder"("workspaceId", "userId", "name");
CREATE INDEX "ProjectFolder_workspaceId_userId_sortOrder_idx" ON "ProjectFolder"("workspaceId", "userId", "sortOrder");
CREATE UNIQUE INDEX "UserProjectPreference_workspaceId_userId_projectId_key" ON "UserProjectPreference"("workspaceId", "userId", "projectId");
CREATE INDEX "UserProjectPreference_workspaceId_userId_pinnedAt_idx" ON "UserProjectPreference"("workspaceId", "userId", "pinnedAt");
CREATE INDEX "UserProjectPreference_workspaceId_userId_folderId_sortOrder_idx" ON "UserProjectPreference"("workspaceId", "userId", "folderId", "sortOrder");
CREATE INDEX "UserProjectPreference_workspaceId_userId_lastOpenedAt_idx" ON "UserProjectPreference"("workspaceId", "userId", "lastOpenedAt");

ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectPreference" ADD CONSTRAINT "UserProjectPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectPreference" ADD CONSTRAINT "UserProjectPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectPreference" ADD CONSTRAINT "UserProjectPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectPreference" ADD CONSTRAINT "UserProjectPreference_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ProjectFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
