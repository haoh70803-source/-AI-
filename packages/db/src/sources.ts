import type { PrismaClient } from "@prisma/client";

export function findSourceForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; sourceItemId: string },
) {
  return prisma.sourceItem.findFirst({
    where: {
      id: input.sourceItemId,
      workspaceId: input.workspaceId,
      workspace: { members: { some: { userId: input.userId } } },
    },
    include: {
      transcript: true,
      ingestJobs: { orderBy: { createdAt: "desc" }, take: 10 },
      tags: { include: { tag: true }, orderBy: { createdAt: "asc" } },
      collections: { include: { collection: true }, orderBy: { createdAt: "asc" } },
      assets: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function hasSourceDeletionReferences(prisma: PrismaClient, sourceItemId: string) {
  const [methodVersion, benchmarkStudySample, materialDistillation, distillationMethodVersion, canvasMaterialReference, projectSource] = await Promise.all([
    prisma.methodVersion.findFirst({ where: { sourceItemId }, select: { id: true } }),
    prisma.benchmarkStudySample.findFirst({ where: { sourceItemId }, select: { id: true } }),
    prisma.materialDistillation.findFirst({ where: { sourceItemId }, select: { id: true } }),
    prisma.methodVersion.findFirst({ where: { sourceMaterialDistillation: { sourceItemId } }, select: { id: true } }),
    prisma.canvasMaterialReference.findFirst({ where: { sourceItemId }, select: { id: true } }),
    prisma.projectSource.findFirst({ where: { sourceItemId }, select: { id: true } }),
  ]);
  return Boolean(methodVersion || benchmarkStudySample || materialDistillation || distillationMethodVersion || canvasMaterialReference || projectSource);
}

export function findIngestJobForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; jobId: string },
) {
  return prisma.ingestJob.findFirst({
    where: {
      id: input.jobId,
      workspaceId: input.workspaceId,
      workspace: { members: { some: { userId: input.userId } } },
    },
  });
}

export function findSourceAssetForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; sourceAssetId: string },
) {
  return prisma.sourceAsset.findFirst({
    where: {
      id: input.sourceAssetId,
      workspaceId: input.workspaceId,
      workspace: { members: { some: { userId: input.userId } } },
      sourceItem: { workspaceId: input.workspaceId },
    },
  });
}

export function findCollectionForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; collectionId: string },
) {
  return prisma.collection.findFirst({
    where: {
      id: input.collectionId,
      workspaceId: input.workspaceId,
      workspace: { members: { some: { userId: input.userId } } },
    },
  });
}

export function findTagForUser(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; tagId: string },
) {
  return prisma.contentTag.findFirst({
    where: {
      id: input.tagId,
      workspaceId: input.workspaceId,
      workspace: { members: { some: { userId: input.userId } } },
    },
  });
}
