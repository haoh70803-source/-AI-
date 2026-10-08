import "server-only";

import { db, type Prisma, type PublishStatus } from "@content-center/db";
import type { SupportedPlatform } from "../../lib/platforms";
import { QualityGate, isPlatformVariantReadyToPublish } from "../reviews/quality-gate";
import { buildPublishPackage } from "./publish-package";
import { publishSnapshotSchema, type PublishSnapshot } from "./schemas";

type Actor = { workspaceId: string; userId: string };
type TaskFilters = { platform?: SupportedPlatform; status?: PublishStatus; creatorId?: string; from?: Date; to?: Date };

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function membership(actor: Actor) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.userId } } });
  if (!member) throw new PublishTaskServiceError("PUBLISH_TASK_NOT_FOUND", "发布任务不存在或不属于当前 Workspace。");
  return member;
}

async function requireWriter(actor: Actor) {
  const member = await membership(actor);
  if (member.role === "VIEWER") throw new PublishTaskServiceError("PUBLISH_FORBIDDEN", "VIEWER 只能查看发布中心。");
  return member;
}

async function scopedVariant(input: Actor & { projectId: string; platform: SupportedPlatform }) {
  const [member, variant] = await Promise.all([
    membership(input),
    db.platformVariant.findFirst({
      where: { workspaceId: input.workspaceId, projectId: input.projectId, platform: input.platform },
      include: {
        project: {
          include: {
            motherContent: true,
            creatorProfile: true,
            evidenceItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            deepContentPackages: { where: { status: { not: "ARCHIVED" } }, orderBy: { version: "desc" }, take: 1 },
          },
        },
      },
    }),
  ]);
  if (!variant || !variant.project.motherContent) throw new PublishTaskServiceError("PUBLISH_TASK_NOT_FOUND", "平台内容不存在或不属于当前 Workspace。");
  return { member, variant, project: variant.project, motherContent: variant.project.motherContent };
}

function gate(context: Awaited<ReturnType<typeof scopedVariant>>) {
  return new QualityGate().check({
    project: context.project,
    motherContent: context.motherContent,
    platformVariant: context.variant,
    creatorProfile: context.project.creatorProfile,
    evidence: context.project.evidenceItems,
    deepContentPackage: context.project.deepContentPackages[0] ?? null,
  });
}

function auditMetadata(task: { id: string; projectId: string; platform: string; status: string; scheduledAt: Date | null; contentSnapshot: unknown }) {
  const parsed = publishSnapshotSchema.safeParse(task.contentSnapshot);
  return { taskId: task.id, projectId: task.projectId, platform: task.platform, status: task.status, scheduledAt: task.scheduledAt?.toISOString() ?? null, variantVersion: parsed.success ? parsed.data.variantVersion : null };
}

const taskInclude = {
  project: { select: { id: true, title: true, createdById: true, creatorProfile: { select: { userId: true, displayName: true } }, motherContent: { select: { version: true } } } },
  platformVariant: { select: { id: true, version: true, status: true, sourceMotherVersion: true } },
  createdBy: { select: { id: true, name: true } },
  publisher: { select: { id: true, name: true } },
} satisfies Prisma.PublishTaskInclude;

export async function createPublishTask(input: Actor & { projectId: string; platform: SupportedPlatform; scheduledAt?: Date | null }, dependencies: { now?: () => Date } = {}) {
  const context = await scopedVariant(input);
  if (context.member.role === "VIEWER") throw new PublishTaskServiceError("PUBLISH_FORBIDDEN", "VIEWER 不能创建发布任务。");
  if (context.variant.status !== "APPROVED") throw new PublishTaskServiceError("VARIANT_NOT_APPROVED", "平台内容尚未通过人工审核。");
  if (!isPlatformVariantReadyToPublish({ status: context.variant.status, sourceMotherVersion: context.variant.sourceMotherVersion, motherVersion: context.motherContent.version })) throw new PublishTaskServiceError("VARIANT_STALE", "母稿已变化，请重新生成并审核平台内容。");
  const quality = gate(context);
  if (quality.issues.some(({ severity }) => severity === "ERROR")) throw new PublishTaskServiceError("QUALITY_GATE_BLOCKED", "QualityGate 存在阻塞性 ERROR。");
  const now = dependencies.now?.() ?? new Date();
  const snapshot: PublishSnapshot = {
    variantVersion: context.variant.version,
    motherVersion: context.motherContent.version,
    title: context.variant.title,
    hook: context.variant.hook,
    body: context.variant.body,
    summary: context.variant.summary,
    hashtags: strings(context.variant.hashtags),
    metadata: context.variant.metadata ?? null,
    mediaPlan: context.variant.mediaPlan ?? null,
    platform: input.platform,
    createdAt: now.toISOString(),
  };
  const status = input.scheduledAt ? "SCHEDULED" : "READY_TO_PUBLISH";
  return db.$transaction(async (tx) => {
    const task = await tx.publishTask.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, platformVariantId: context.variant.id, platform: input.platform, status, scheduledAt: input.scheduledAt ?? null, createdById: input.userId, contentSnapshot: json(snapshot) }, include: taskInclude });
    const metadata = auditMetadata(task);
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "publish_task.created", resourceType: "publish_task", resourceId: task.id, metadata } });
    if (input.scheduledAt) await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "publish_task.scheduled", resourceType: "publish_task", resourceId: task.id, metadata } });
    return task;
  });
}

export async function listPublishTasks(actor: Actor, filters: TaskFilters = {}) {
  await membership(actor);
  return db.publishTask.findMany({
    where: {
      workspaceId: actor.workspaceId,
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.creatorId ? { OR: [{ createdById: filters.creatorId }, { project: { creatorProfile: { userId: filters.creatorId } } }] } : {}),
      ...((filters.from || filters.to) ? { scheduledAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } } : {}),
    },
    include: taskInclude,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function listPublishCreators(actor: Actor) {
  await membership(actor);
  return db.user.findMany({ where: { workspaceMemberships: { some: { workspaceId: actor.workspaceId } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getPublishTask(actor: Actor, taskId: string) {
  await membership(actor);
  const task = await db.publishTask.findFirst({ where: { id: taskId, workspaceId: actor.workspaceId }, include: taskInclude });
  if (!task) throw new PublishTaskServiceError("PUBLISH_TASK_NOT_FOUND", "发布任务不存在或不属于当前 Workspace。");
  const snapshot = publishSnapshotSchema.parse(task.contentSnapshot);
  const contentChanged = task.platformVariant.version !== snapshot.variantVersion || task.platformVariant.sourceMotherVersion !== snapshot.motherVersion || task.project.motherContent?.version !== snapshot.motherVersion;
  return { ...task, snapshot, package: buildPublishPackage(snapshot), contentChanged };
}

async function mutableTask(actor: Actor, taskId: string) {
  await requireWriter(actor);
  const task = await db.publishTask.findFirst({ where: { id: taskId, workspaceId: actor.workspaceId } });
  if (!task) throw new PublishTaskServiceError("PUBLISH_TASK_NOT_FOUND", "发布任务不存在或不属于当前 Workspace。");
  return task;
}

async function mutate(input: Actor & { taskId: string; action: string; data: Prisma.PublishTaskUpdateInput }) {
  const current = await mutableTask(input, input.taskId);
  return db.$transaction(async (tx) => {
    const task = await tx.publishTask.update({ where: { id: current.id }, data: input.data, include: taskInclude });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: input.action, resourceType: "publish_task", resourceId: task.id, metadata: auditMetadata(task) } });
    return task;
  });
}

export async function updatePublishTask(input: Actor & { taskId: string; note?: string | null; externalPostId?: string | null }) {
  const task = await mutableTask(input, input.taskId);
  if (task.status === "PUBLISHED") throw new PublishTaskServiceError("PUBLISH_TASK_FINAL", "已发布任务不能再修改。");
  return db.publishTask.update({ where: { id: task.id }, data: { ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}), ...(input.externalPostId !== undefined ? { externalPostId: input.externalPostId?.trim() || null } : {}) }, include: taskInclude });
}

export async function schedulePublishTask(input: Actor & { taskId: string; scheduledAt: Date }) {
  const current = await mutableTask(input, input.taskId);
  if (current.status === "PUBLISHED") throw new PublishTaskServiceError("PUBLISH_TASK_FINAL", "已发布任务不能改期。");
  return mutate({ ...input, action: current.status === "SCHEDULED" ? "publish_task.rescheduled" : "publish_task.scheduled", data: { scheduledAt: input.scheduledAt, status: "SCHEDULED" } });
}

export async function cancelPublishTask(input: Actor & { taskId: string; note?: string | null }) {
  const current = await mutableTask(input, input.taskId);
  if (current.status === "PUBLISHED") throw new PublishTaskServiceError("PUBLISH_TASK_FINAL", "已发布任务不能取消。");
  return mutate({ ...input, action: "publish_task.cancelled", data: { status: "CANCELLED", note: input.note?.trim() || current.note } });
}

export async function failPublishTask(input: Actor & { taskId: string; note: string }) {
  const current = await mutableTask(input, input.taskId);
  if (current.status === "PUBLISHED" || current.status === "CANCELLED") throw new PublishTaskServiceError("PUBLISH_TASK_FINAL", "终态任务不能标记失败。");
  return mutate({ ...input, action: "publish_task.failed", data: { status: "FAILED", note: input.note.trim() } });
}

export async function markPublishTaskPublished(input: Actor & { taskId: string; publishedAt?: Date; externalUrl?: string | null; externalPostId?: string | null; note?: string | null }) {
  const current = await mutableTask(input, input.taskId);
  if (current.status === "PUBLISHED" || current.status === "CANCELLED") throw new PublishTaskServiceError("PUBLISH_TASK_FINAL", "当前任务不能标记发布。");
  return mutate({ ...input, action: "publish_task.marked_published", data: { status: "PUBLISHED", publishedAt: input.publishedAt ?? new Date(), publisher: { connect: { id: input.userId } }, externalUrl: input.externalUrl?.trim() || null, externalPostId: input.externalPostId?.trim() || null, note: input.note?.trim() || current.note } });
}

export async function recordPublishPackageCopied(input: Actor & { taskId: string }) {
  const task = await getPublishTask(input, input.taskId);
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "publish_package.copied", resourceType: "publish_task", resourceId: task.id, metadata: auditMetadata(task) } });
  return { copied: true };
}

export class PublishTaskServiceError extends Error {
  constructor(readonly code: "PUBLISH_TASK_NOT_FOUND" | "PUBLISH_FORBIDDEN" | "VARIANT_NOT_APPROVED" | "VARIANT_STALE" | "QUALITY_GATE_BLOCKED" | "PUBLISH_TASK_FINAL", message: string) {
    super(message);
    this.name = "PublishTaskServiceError";
  }
}
