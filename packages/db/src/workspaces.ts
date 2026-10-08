import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export async function createOwnedWorkspace(
  prisma: PrismaClient,
  input: { userId: string; name: string; slug: string },
) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.name,
        slug: input.slug,
        members: { create: { userId: input.userId, role: "OWNER" } },
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        userId: input.userId,
        action: "workspace.created",
        resourceType: "workspace",
        resourceId: workspace.id,
      },
    });

    return workspace;
  });
}

export function findWorkspaceForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string },
) {
  return prisma.workspace.findFirst({
    where: {
      id: input.workspaceId,
      disabledAt: null,
      members: { some: { userId: input.userId, disabledAt: null, user: { disabledAt: null } } },
    },
    include: {
      members: { where: { userId: input.userId, disabledAt: null }, take: 1 },
    },
  });
}

/** Ensures the internal V1 tenant invariant: every user owns one personal workspace. */
export async function ensurePersonalWorkspaceForUser(
  prisma: PrismaClient,
  input: { userId: string; name?: string },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workspaceMember.findFirst({
      where: { userId: input.userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing.workspace;

    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { name: true },
    });
    const workspace = await tx.workspace.create({
      data: {
        name: input.name?.trim() || `${user.name}的内容空间`,
        slug: `personal-${input.userId.slice(0, 12)}-${randomUUID().slice(0, 8)}`,
        members: { create: { userId: input.userId, role: "OWNER" } },
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        userId: input.userId,
        action: "workspace.personal_provisioned",
        resourceType: "workspace",
        resourceId: workspace.id,
      },
    });
    return workspace;
  }, { isolationLevel: "Serializable" });
}
