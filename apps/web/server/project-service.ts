import "server-only";
import { createHash } from "node:crypto";
import { CreationInputError, validateCreationModel, type CreationModel } from "./creation/models";
import { loadCreationSources } from "./creation/sources";
import { isDefaultContentMethodPayload } from "./default-content-method/schemas";

import {
  CONTENT_PROJECT_STATUSES,
  ProjectTransitionError,
  transitionProjectStatus as validateProjectTransition,
  type ContentProjectStatus,
} from "@content-center/core";
import { db, findProjectForUser, type Prisma } from "@content-center/db";
import { getProjectNextAction } from "../lib/project-next-action";

export class ProjectServiceError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "SOURCE_NOT_FOUND" | "SOURCE_ALREADY_ADDED" | "SOURCE_LIMIT_EXCEEDED" | "PROJECT_CONFLICT" | "PROJECT_RETAINED") {
    super(code);
    this.name = "ProjectServiceError";
  }
}

export type ProjectListQuery = {
  search?: string;
  status?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  review?: string;
  folder?: string;
  view?: string;
  tab?: string;
};

export type InitialCreativeBrief = {
  topic: string;
  angle: string;
  audience: string;
  coreMessage: string;
  coreQuestion: string;
  background: string;
  keyPoints: string[];
  structure: string[];
  tone: string;
  risks: string[];
  metadata: Prisma.InputJsonValue;
};

export async function listProjects(workspaceId: string, query: ProjectListQuery, organization?: { userId: string; folderId: string | null }) {
  if (organization) {
    const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: organization.userId } }, select: { id: true } });
    const folder = organization.folderId ? await db.projectFolder.findFirst({ where: { id: organization.folderId, workspaceId, userId: organization.userId }, select: { id: true } }) : true;
    if (!member || !folder) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  }
  let page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 12));
  const status = CONTENT_PROJECT_STATUSES.includes(query.status as ContentProjectStatus)
    ? query.status as ContentProjectStatus
    : undefined;
  const search = query.search?.trim();
  const unstarted: Prisma.ContentProjectWhereInput = { status: "DRAFT", AND: [
    { OR: [{ motherContent: { is: null } }, { motherContent: { is: { body: "" } } }] },
    { OR: [{ creativeBrief: { is: null } }, { creativeBrief: { is: { coreMessage: "" } } }] },
  ] };
  const where: Prisma.ContentProjectWhereInput = {
    workspaceId,
    status: status ?? { not: "ARCHIVED" },
    ...(organization ? { userPreferences: organization.folderId ? { some: { workspaceId, userId: organization.userId, folderId: organization.folderId } } : { none: { workspaceId, userId: organization.userId, folderId: { not: null } } } } : {}),
    ...(query.status === "UNSTARTED" ? { AND: [unstarted] } : query.status === "ACTIVE" ? { AND: [{ NOT: unstarted }, { status: { not: "APPROVED" } }] } : query.status === "DONE" ? { status: "APPROVED" } : {}),
    ...(query.review === "pending" ? { platformVariants: { some: { status: "IN_REVIEW" } } } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { goal: { contains: search, mode: "insensitive" } },
        { audience: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const total = await db.contentProject.count({ where });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, lastPage);
  const items = await db.contentProject.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        goal: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        _count: { select: { sources: true, evidenceItems: true } },
        sources: { select: { sourceItem: { select: { thumbnailUrl: true, materialAnalyses: { where: { status: "COMPLETED" }, take: 1, select: { id: true } } } } } },
        creativeBrief: { select: { coreMessage: true, metadata: true } },
        motherContent: { select: { body: true, version: true, confirmedVersion: true } },
        platformVariants: { select: { status: true } },
      },
      orderBy: [query.sort === "oldest" ? { createdAt: "asc" } : query.sort === "name" ? { title: "asc" } : query.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  return { items: items.map((item) => ({ ...item, nextAction: getProjectNextAction({ sources: item.sources.map(({ sourceItem }) => ({ completedAnalysis: sourceItem.materialAnalyses.length > 0 })), supplement: item.creativeBrief?.coreMessage, mother: item.motherContent, platformStatuses: item.platformVariants.map(({ status }) => status) }) })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function getProjectForUser(input: { userId: string; workspaceId: string; projectId: string }) {
  return findProjectForUser(db, input);
}

export async function createProject(input: {
  workspaceId: string;
  userId: string;
  title: string;
  description?: string;
  goal?: string;
  audience?: string;
  sourceItemId?: string;
  sourceItemIds?: string[];
  clientRequestId?: string;
  initialBrief?: InitialCreativeBrief;
  folderId?: string;
  methodVersionIds?: string[];
  modelSelection?: CreationModel | null;
}) {
  const requestedSourceIds = [...new Set([...(input.sourceItemId ? [input.sourceItemId] : []), ...(input.sourceItemIds ?? [])])];
  if (requestedSourceIds.length > 8) throw new ProjectServiceError("SOURCE_LIMIT_EXCEEDED");
  const clientRequestId = input.clientRequestId?.trim() || null;
  const normalizedTitle = input.title.trim();
  const normalizedDescription = input.description?.trim() || null;
  const normalizedGoal = input.goal?.trim() || null;
  const normalizedAudience = input.audience?.trim() || null;
  const methodIds = [...new Set(input.methodVersionIds ?? [])];
  const requestHash = createHash("sha256").update(JSON.stringify({ title: normalizedTitle, description: normalizedDescription, goal: normalizedGoal, audience: normalizedAudience, sources: [...requestedSourceIds].sort(), folderId: input.folderId ?? null, methods: [...methodIds].sort(), model: input.modelSelection ?? null })).digest("hex");
  const existingRequest = clientRequestId ? await db.contentProject.findFirst({ where: { workspaceId: input.workspaceId, createdById: input.userId, clientRequestId }, include: { sources: { select: { sourceItemId: true } } } }) : null;
  if (existingRequest) {
    if (existingRequest.creationRequestHash) {
      if (existingRequest.creationRequestHash !== requestHash) throw new ProjectServiceError("PROJECT_CONFLICT");
      return { ...existingRequest, primaryDraftBranchId: existingRequest.primaryDraftBranchId! };
    }
    if (existingRequest.title !== normalizedTitle || existingRequest.description !== normalizedDescription || existingRequest.goal !== normalizedGoal || existingRequest.audience !== normalizedAudience || requestedSourceIds.length !== existingRequest.sources.length || requestedSourceIds.some((id) => !existingRequest.sources.some((source) => source.sourceItemId === id))) throw new ProjectServiceError("PROJECT_CONFLICT");
    return { ...existingRequest, primaryDraftBranchId: existingRequest.primaryDraftBranchId! };
  }
  const sources = requestedSourceIds.length ? await db.sourceItem.findMany({ where: { id: { in: requestedSourceIds }, workspaceId: input.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } }) : [];
  if (sources.length !== requestedSourceIds.length) throw new ProjectServiceError("SOURCE_NOT_FOUND");
  const methods = methodIds.length ? await db.methodVersion.findMany({ where: { id: { in: methodIds }, asset: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: { not: "DISABLED" } } }, select: { id: true, assetId: true, steps: true } }) : [];
  if (methodIds.length > 1 || methods.length !== methodIds.length || new Set(methods.map((method) => method.assetId)).size !== methods.length || methods.some((method) => isDefaultContentMethodPayload(method.steps))) throw new CreationInputError("请选择 1 个自己的可用 Skill，或不使用 Skill。");
  if (input.methodVersionIds !== undefined || input.modelSelection !== undefined) {
    const model = await validateCreationModel(input.workspaceId, input.modelSelection);
    const attachments = await loadCreationSources(input.workspaceId, requestedSourceIds, input.userId);
    if (attachments.some((source) => source.state !== "READY")) throw new CreationInputError("部分资料尚未读好，请等待处理完成或移除后再发送。");
    if (!model.image && attachments.some((source) => source.image)) throw new CreationInputError("当前模型不支持图片，请选择支持图片的模型或移除图片引用。");
  }
  const creatorProfile = await db.creatorProfile.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    select: { id: true },
  });

  try { return await db.$transaction(async (tx) => {
    if (input.folderId) {
      const folder = await tx.projectFolder.findFirst({ where: { id: input.folderId, workspaceId: input.workspaceId, userId: input.userId }, select: { id: true } });
      if (!folder) throw new ProjectServiceError("PROJECT_NOT_FOUND");
      // Serialize appends to this personal folder without introducing another ordering system.
      await tx.projectFolder.update({ where: { id: folder.id }, data: { updatedAt: new Date() } });
    }
    const publishedContext = await tx.iPContextVersion.findFirst({where:{workspaceId:input.workspaceId,status:"PUBLISHED"},orderBy:{number:"desc"}});
    const project = await tx.contentProject.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.userId,
        ...(publishedContext ? {ipContextSnapshot:JSON.parse(JSON.stringify(publishedContext))} : {}),
        clientRequestId,
        creationRequestHash: requestHash,
        ...(input.modelSelection ? { creationModel: input.modelSelection } : {}),
        creatorProfileId: creatorProfile?.id,
        title: normalizedTitle,
        description: normalizedDescription,
        goal: normalizedGoal,
        audience: normalizedAudience,
        status: "DRAFT",
      },
    });
    const primaryDraft = await tx.draftBranch.create({
      data: { workspaceId: input.workspaceId, projectId: project.id, title: "主稿", createdById: input.userId, updatedById: input.userId },
    });
    await tx.contentProject.update({ where: { id: project.id }, data: { primaryDraftBranchId: primaryDraft.id } });
    if (methods.length) await tx.projectMethodSelection.createMany({ data: methods.map((method) => ({ projectId: project.id, methodAssetId: method.assetId, methodVersionId: method.id, selectedByUserId: input.userId })) });
    if (input.folderId) {
      const tail = await tx.userProjectPreference.aggregate({ where: { workspaceId: input.workspaceId, userId: input.userId, folderId: input.folderId }, _max: { sortOrder: true } });
      await tx.userProjectPreference.create({ data: { workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, folderId: input.folderId, sortOrder: (tail._max.sortOrder ?? -1) + 1 } });
    }
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "project.created",
        resourceType: "content_project",
        resourceId: project.id,
        metadata: { projectId: project.id, changedFields: ["title", "description", "goal", "audience"] },
      },
    });
    for (const [sortOrder, sourceId] of requestedSourceIds.entries()) {
      const relation = await tx.projectSource.create({ data: { projectId: project.id, sourceItemId: sourceId, role: "REFERENCE", sortOrder } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "project.source_added", resourceType: "project_source", resourceId: relation.id, metadata: { projectId: project.id, sourceItemId: sourceId, role: "REFERENCE" } } });
    }
    if (input.initialBrief) {
      const brief = await tx.creativeBrief.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: project.id,
          createdById: input.userId,
          ...input.initialBrief,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: "brief.initialized",
          resourceType: "creative_brief",
          resourceId: brief.id,
          metadata: { projectId: project.id, source: "MATERIAL_ANALYSIS" },
        },
      });
    }
    return { ...project, primaryDraftBranchId: primaryDraft.id };
  }); } catch (error) {
    if (!clientRequestId || !error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
    const existing = await db.contentProject.findFirst({ where: { workspaceId: input.workspaceId, createdById: input.userId, clientRequestId }, include: { sources: { select: { sourceItemId: true } } } });
    if (existing?.creationRequestHash) {
      if (existing.creationRequestHash !== requestHash) throw new ProjectServiceError("PROJECT_CONFLICT");
      return { ...existing, primaryDraftBranchId: existing.primaryDraftBranchId! };
    }
    if (!existing || existing.title !== normalizedTitle || existing.description !== normalizedDescription || existing.goal !== normalizedGoal || existing.audience !== normalizedAudience || existing.sources.length !== requestedSourceIds.length || requestedSourceIds.some((id) => !existing.sources.some((source) => source.sourceItemId === id))) throw new ProjectServiceError("PROJECT_CONFLICT");
    return { ...existing, primaryDraftBranchId: existing.primaryDraftBranchId! };
  }
}

export async function updateProject(input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  data: { title?: string; description?: string; goal?: string; audience?: string };
}) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  const changedFields = Object.keys(input.data);
  const updated = await db.contentProject.update({
    where: { id: project.id },
    data: {
      ...(input.data.title !== undefined ? { title: input.data.title.trim() } : {}),
      ...(input.data.description !== undefined ? { description: input.data.description.trim() || null } : {}),
      ...(input.data.goal !== undefined ? { goal: input.data.goal.trim() || null } : {}),
      ...(input.data.audience !== undefined ? { audience: input.data.audience.trim() || null } : {}),
    },
  });
  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project.updated",
      resourceType: "content_project",
      resourceId: project.id,
      metadata: { projectId: project.id, changedFields },
    },
  });
  return updated;
}

export async function deleteProject(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  if (await db.contentTopic.count({where:{projectId:project.id,workspaceId:input.workspaceId}})) throw new ProjectServiceError("PROJECT_RETAINED");
  await db.$transaction([
    db.contentProject.delete({ where: { id: project.id } }),
    db.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "project.deleted",
        resourceType: "content_project",
        resourceId: project.id,
        metadata: { projectId: project.id },
      },
    }),
  ]);
}

export async function addProjectSource(input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  sourceItemId: string;
  role: "REFERENCE" | "EVIDENCE" | "INSPIRATION" | "OWN_MATERIAL";
}) {
  const [project, source, existing] = await Promise.all([
    db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } }),
    db.sourceItem.findFirst({ where: { id: input.sourceItemId, workspaceId: input.workspaceId }, select: { id: true } }),
    db.projectSource.findFirst({ where: { projectId: input.projectId, sourceItemId: input.sourceItemId }, select: { id: true } }),
  ]);
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  if (!source) throw new ProjectServiceError("SOURCE_NOT_FOUND");
  if (existing) throw new ProjectServiceError("SOURCE_ALREADY_ADDED");
  const maximum = await db.projectSource.aggregate({ where: { projectId: project.id }, _max: { sortOrder: true } });
  const relation = await db.projectSource.create({
    data: { projectId: project.id, sourceItemId: source.id, role: input.role, sortOrder: (maximum._max.sortOrder ?? -1) + 1 },
  });
  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project.source_added",
      resourceType: "project_source",
      resourceId: relation.id,
      metadata: { projectId: project.id, sourceItemId: source.id, role: input.role },
    },
  });
  return relation;
}

export async function removeProjectSource(input: { workspaceId: string; userId: string; projectId: string; sourceItemId: string }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  const relation = await db.projectSource.findFirst({ where: { projectId: project.id, sourceItemId: input.sourceItemId }, select: { id: true } });
  if (!relation) throw new ProjectServiceError("SOURCE_NOT_FOUND");
  await db.$transaction([
    db.projectSource.delete({ where: { id: relation.id } }),
    db.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "project.source_removed",
        resourceType: "project_source",
        resourceId: relation.id,
        metadata: { projectId: project.id, sourceItemId: input.sourceItemId },
      },
    }),
  ]);
}

export async function transitionProjectStatus(input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  to: ContentProjectStatus;
}) {
  return db.$transaction(async (tx) => {
  const project = await tx.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
    include: { creativeBrief: true, motherContent: true },
  });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  if (project.status === input.to) return project;
  const status = validateProjectTransition({
    from: project.status,
    to: input.to,
    brief: project.creativeBrief,
    motherContent: project.motherContent,
  });
  const changed = await tx.contentProject.updateMany({ where: { id: project.id, workspaceId: input.workspaceId, status: project.status }, data: { status } });
  if (changed.count !== 1) throw new ProjectServiceError("PROJECT_CONFLICT");
  const updated = { ...project, status };
  const auditEntries: Prisma.AuditLogCreateManyInput[] = [{
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: "project.status_changed",
    resourceType: "content_project",
    resourceId: project.id,
    metadata: { projectId: project.id, from: project.status, to: status },
  }];
  if (status === "ARCHIVED") auditEntries.push({
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: "project.archived",
    resourceType: "content_project",
    resourceId: project.id,
    metadata: { projectId: project.id, from: project.status },
  });
  await tx.auditLog.createMany({ data: auditEntries });
  return updated;
  });
}

export async function restoreProject(input: { workspaceId: string; userId: string; projectId: string }) {
  return db.$transaction(async (tx) => {
    const project = await tx.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true, status: true } });
    if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
    if (project.status !== "ARCHIVED") return project;
    const archive = await tx.auditLog.findFirst({ where: { workspaceId: input.workspaceId, resourceId: project.id, action: "project.archived" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } });
    const metadata = archive?.metadata as { from?: string } | null;
    const status = metadata?.from && metadata.from !== "ARCHIVED" && CONTENT_PROJECT_STATUSES.includes(metadata.from as ContentProjectStatus) ? metadata.from as ContentProjectStatus : "DRAFT";
    const changed = await tx.contentProject.updateMany({ where: { id: project.id, workspaceId: input.workspaceId, status: "ARCHIVED" }, data: { status } });
    if (changed.count !== 1) throw new ProjectServiceError("PROJECT_CONFLICT");
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "project.restored", resourceType: "content_project", resourceId: project.id, metadata: { from: "ARCHIVED", to: status } } });
    return { id: project.id, status };
  });
}

export { ProjectTransitionError };
