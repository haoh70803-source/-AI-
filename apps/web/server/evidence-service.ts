import "server-only";

import { db } from "@content-center/db";
import { ProjectServiceError } from "./project-service";

export type EvidenceInput = {
  type: "FACT" | "VIEWPOINT" | "CASE" | "DATA" | "QUOTE" | "EXPERIENCE" | "QUESTION" | "OTHER";
  sourceItemId?: string | null;
  excerpt?: string;
  claim?: string;
  note?: string;
  sourceUrl?: string;
};

async function scopedProject(workspaceId: string, projectId: string) {
  const project = await db.contentProject.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  return project;
}

async function scopedSource(workspaceId: string, projectId: string, sourceItemId?: string | null) {
  if (!sourceItemId) return null;
  const source = await db.sourceItem.findFirst({
    where: { id: sourceItemId, workspaceId, projects: { some: { projectId } } },
    select: { id: true, sourceUrl: true },
  });
  if (!source) throw new ProjectServiceError("SOURCE_NOT_FOUND");
  return source;
}

export async function createEvidence(input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  data: EvidenceInput;
}) {
  const project = await scopedProject(input.workspaceId, input.projectId);
  const source = await scopedSource(input.workspaceId, project.id, input.data.sourceItemId);
  const maximum = await db.evidenceItem.aggregate({ where: { projectId: project.id }, _max: { sortOrder: true } });
  return db.$transaction(async (tx) => {
    const evidence = await tx.evidenceItem.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: project.id,
        sourceItemId: source?.id,
        type: input.data.type,
        excerpt: input.data.excerpt?.trim() || null,
        claim: input.data.claim?.trim() || null,
        note: input.data.note?.trim() || null,
        sourceUrl: input.data.sourceUrl?.trim() || source?.sourceUrl || null,
        sortOrder: (maximum._max.sortOrder ?? -1) + 1,
        createdById: input.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "evidence.created",
        resourceType: "evidence_item",
        resourceId: evidence.id,
        metadata: { projectId: project.id, resourceId: evidence.id, changedFields: ["type", "sourceItemId", "excerpt", "claim", "note", "sourceUrl"] },
      },
    });
    return evidence;
  });
}

export async function updateEvidence(input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  evidenceId: string;
  data: Partial<EvidenceInput>;
}) {
  await scopedProject(input.workspaceId, input.projectId);
  const evidence = await db.evidenceItem.findFirst({ where: { id: input.evidenceId, projectId: input.projectId, workspaceId: input.workspaceId } });
  if (!evidence) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  const source = input.data.sourceItemId !== undefined
    ? await scopedSource(input.workspaceId, input.projectId, input.data.sourceItemId)
    : undefined;
  const changedFields = Object.keys(input.data);
  return db.$transaction(async (tx) => {
    const updated = await tx.evidenceItem.update({
      where: { id: evidence.id },
      data: {
        ...(input.data.type !== undefined ? { type: input.data.type } : {}),
        ...(input.data.sourceItemId !== undefined ? { sourceItemId: source?.id ?? null } : {}),
        ...(input.data.excerpt !== undefined ? { excerpt: input.data.excerpt.trim() || null } : {}),
        ...(input.data.claim !== undefined ? { claim: input.data.claim.trim() || null } : {}),
        ...(input.data.note !== undefined ? { note: input.data.note.trim() || null } : {}),
        ...(input.data.sourceUrl !== undefined ? { sourceUrl: input.data.sourceUrl.trim() || null } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "evidence.updated",
        resourceType: "evidence_item",
        resourceId: evidence.id,
        metadata: { projectId: input.projectId, resourceId: evidence.id, changedFields },
      },
    });
    return updated;
  });
}

export async function moveEvidence(input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  evidenceId: string;
  direction: "UP" | "DOWN";
}) {
  await scopedProject(input.workspaceId, input.projectId);
  const items = await db.evidenceItem.findMany({
    where: { workspaceId: input.workspaceId, projectId: input.projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = items.findIndex((item) => item.id === input.evidenceId);
  if (index < 0) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  const targetIndex = input.direction === "UP" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return;
  const current = items[index]!;
  const target = items[targetIndex]!;
  await db.$transaction([
    db.evidenceItem.update({ where: { id: current.id }, data: { sortOrder: targetIndex } }),
    db.evidenceItem.update({ where: { id: target.id }, data: { sortOrder: index } }),
    db.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "evidence.updated",
        resourceType: "evidence_item",
        resourceId: current.id,
        metadata: { projectId: input.projectId, resourceId: current.id, changedFields: ["sortOrder"] },
      },
    }),
  ]);
}

export async function deleteEvidence(input: { workspaceId: string; userId: string; projectId: string; evidenceId: string }) {
  await scopedProject(input.workspaceId, input.projectId);
  const evidence = await db.evidenceItem.findFirst({ where: { id: input.evidenceId, projectId: input.projectId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!evidence) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  await db.$transaction([
    db.evidenceItem.delete({ where: { id: evidence.id } }),
    db.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "evidence.deleted",
        resourceType: "evidence_item",
        resourceId: evidence.id,
        metadata: { projectId: input.projectId, resourceId: evidence.id },
      },
    }),
  ]);
}
