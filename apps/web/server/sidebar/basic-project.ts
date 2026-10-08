import "server-only";

import { db } from "@content-center/db";

export class BasicProjectError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "FORBIDDEN" | "FOLDER_NOT_FOUND") {
    super(code);
    this.name = "BasicProjectError";
  }
}

/** The sidebar creates an empty project; creative setup belongs to its own flow. */
export async function createBasicProject(input: { workspaceId: string; userId: string; title: string; description?: string; folderId?: string }) {
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  if (!title || title.length > 200 || (description?.length ?? 0) > 5_000) throw new BasicProjectError("INVALID_INPUT");
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { role: true } });
  if (!member || member.role === "VIEWER") throw new BasicProjectError("FORBIDDEN");
  const profile = await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { id: true } });

  return db.$transaction(async (tx) => {
    if (input.folderId) {
      const folder = await tx.projectFolder.findFirst({ where: { id: input.folderId, workspaceId: input.workspaceId, userId: input.userId }, select: { id: true } });
      if (!folder) throw new BasicProjectError("FOLDER_NOT_FOUND");
      // Keep appends to one personal folder serializable with sidebar reorders.
      await tx.projectFolder.update({ where: { id: folder.id }, data: { updatedAt: new Date() } });
    }
    const project = await tx.contentProject.create({ data: { workspaceId: input.workspaceId, createdById: input.userId, creatorProfileId: profile?.id, title, description, status: "DRAFT" } });
    const branch = await tx.draftBranch.create({ data: { workspaceId: input.workspaceId, projectId: project.id, title: "主稿", createdById: input.userId, updatedById: input.userId } });
    await tx.contentProject.update({ where: { id: project.id }, data: { primaryDraftBranchId: branch.id } });
    if (input.folderId) {
      const tail = await tx.userProjectPreference.aggregate({ where: { workspaceId: input.workspaceId, userId: input.userId, folderId: input.folderId }, _max: { sortOrder: true } });
      await tx.userProjectPreference.create({ data: { workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, folderId: input.folderId, sortOrder: (tail._max.sortOrder ?? -1) + 1 } });
    }
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "project.created", resourceType: "content_project", resourceId: project.id, metadata: { projectId: project.id, changedFields: ["title", "description"] } } });
    return { ...project, primaryDraftBranchId: branch.id };
  }, { isolationLevel: "Serializable" });
}
