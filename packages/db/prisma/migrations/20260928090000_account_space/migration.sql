-- Additive only: existing accounts, memberships and data remain intact.
ALTER TABLE "Session" ADD COLUMN "activeWorkspaceId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceMember" ADD COLUMN "disabledAt" TIMESTAMP(3);
