import type { PrismaClient } from "@prisma/client";

export function findProjectForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; projectId: string },
) {
  return prisma.contentProject.findFirst({
    where: {
      id: input.projectId,
      workspaceId: input.workspaceId,
      workspace: { members: { some: { userId: input.userId } } },
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      creatorProfile: true,
      sources: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { sourceItem: { include: { transcript: true, tags: { include: { tag: { select: { id: true, name: true } } } }, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1 }, assets: { where: { assetType: "IMAGE" }, orderBy: { createdAt: "asc" }, select: { id: true, assetType: true, status: true, mimeType: true } } } } },
      },
      evidenceItems: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { sourceItem: { select: { id: true, title: true } } },
      },
      creativeBrief: true,
      motherContent: true,
      deepContentPackages: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { version: "desc" },
        take: 1,
      },
      platformVariants: { orderBy: { platform: "asc" } },
    },
  });
}
