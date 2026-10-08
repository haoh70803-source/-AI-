import "server-only";

import { db, type Prisma } from "@content-center/db";
import { z } from "zod";
import { isDefaultContentMethodPayload } from "../default-content-method/schemas";

export const creationFeedbackOutcomeSchema = z.enum(["DIRECTLY_USED", "USED_AFTER_EDIT", "NOT_USED"]);
export const methodUsageFeedbackRatingSchema = z.enum(["HELPFUL", "NEUTRAL", "NOT_SUITABLE"]);
const methodFeedbackInputSchema = z.object({ methodUsageId: z.string().trim().min(1).max(200), rating: methodUsageFeedbackRatingSchema }).strict();
export const upsertCreationFeedbackSchema = z.object({
  motherContentVersion: z.number().int().min(1),
  outcome: creationFeedbackOutcomeSchema,
  methodFeedbacks: z.array(methodFeedbackInputSchema).max(20).default([]),
}).strict().superRefine((value, context) => {
  if (new Set(value.methodFeedbacks.map((item) => item.methodUsageId)).size !== value.methodFeedbacks.length) context.addIssue({ code: "custom", path: ["methodFeedbacks"], message: "方法反馈不能重复。" });
});

export class CreationFeedbackError extends Error {
  constructor(readonly code: "FEEDBACK_PROJECT_NOT_FOUND" | "FEEDBACK_FORBIDDEN" | "FEEDBACK_UNAVAILABLE" | "FEEDBACK_INVALID_INPUT" | "FEEDBACK_METHOD_INVALID", message: string) {
    super(message);
    this.name = "CreationFeedbackError";
  }
}

export type CreationFeedbackMethodDTO = {
  methodUsageId: string;
  methodVersionId: string;
  methodVersion: number;
  title: string;
  rating: "HELPFUL" | "NEUTRAL" | "NOT_SUITABLE" | null;
};

export type CreationFeedbackDTO = {
  id: string;
  motherContentId: string;
  motherContentVersion: number;
  sourceAiRunId: string;
  outcome: "DIRECTLY_USED" | "USED_AFTER_EDIT" | "NOT_USED";
  methodFeedbacks: CreationFeedbackMethodDTO[];
  createdAt: string;
  updatedAt: string;
};

export type CreationFeedbackContext = {
  available: boolean;
  projectId: string;
  motherContentId: string | null;
  motherContentVersion: number | null;
  sourceAiRunId: string | null;
  methods: CreationFeedbackMethodDTO[];
  feedback: CreationFeedbackDTO | null;
  unavailableReason?: "MOTHER_NOT_READY" | "NO_APPLIED_GENERATION";
};

const projectInclude = {
  motherContent: { select: { id: true, version: true, body: true, origin: true } },
} as const;
const usageInclude = {
  methodVersion: { select: { id: true, version: true, title: true, steps: true } },
} as const;

type UsageRow = Prisma.MethodUsageGetPayload<{ include: typeof usageInclude }>;
type FeedbackRow = Prisma.CreationFeedbackGetPayload<{ include: { methodFeedbacks: { include: { methodUsage: { include: typeof usageInclude } } } } }>;

function toFeedback(row: FeedbackRow): CreationFeedbackDTO {
  return {
    id: row.id,
    motherContentId: row.motherContentId,
    motherContentVersion: row.motherContentVersion,
    sourceAiRunId: row.sourceAiRunId,
    outcome: row.outcome,
    methodFeedbacks: row.methodFeedbacks.filter((item) => !isDefaultContentMethodPayload(item.methodUsage.methodVersion.steps)).map((item) => ({ methodUsageId: item.methodUsageId, methodVersionId: item.methodVersionId, methodVersion: item.methodUsage.methodVersion.version, title: item.methodUsage.methodVersion.title, rating: item.rating })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ownedProject(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, createdById: input.userId, workspace: { members: { some: { userId: input.userId } } } },
    select: { id: true, ...projectInclude },
  });
  if (!project) throw new CreationFeedbackError("FEEDBACK_PROJECT_NOT_FOUND", "只能查看自己创建的内容。 ");
  return project;
}

async function appliedGeneration(input: { workspaceId: string; userId: string; projectId: string }) {
  return db.aIRun.findFirst({
    where: { workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, action: "GENERATE_MOTHER_CONTENT", status: "SUCCEEDED", appliedAt: { not: null } },
    orderBy: { appliedAt: "desc" },
    select: { id: true, appliedAt: true },
  });
}

async function methodUsages(input: { workspaceId: string; userId: string; projectId: string; sourceAiRunId: string }) {
  const rows = await db.methodUsage.findMany({
    where: { userId: input.userId, projectId: input.projectId, aiRunId: input.sourceAiRunId, project: { workspaceId: input.workspaceId, createdById: input.userId }, methodAsset: { workspaceId: input.workspaceId, ownerUserId: input.userId }, aiRun: { id: input.sourceAiRunId, workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, action: "GENERATE_MOTHER_CONTENT", status: "SUCCEEDED", appliedAt: { not: null } } },
    orderBy: { createdAt: "asc" },
    include: usageInclude,
  });
  return rows.filter((row) => !isDefaultContentMethodPayload(row.methodVersion.steps));
}

async function existingFeedback(input: { userId: string; projectId: string; motherContentId: string; motherContentVersion: number }) {
  const feedback = await db.creationFeedback.findUnique({ where: { userId_projectId: { userId: input.userId, projectId: input.projectId } }, include: { methodFeedbacks: { include: { methodUsage: { include: usageInclude } } } } });
  return feedback?.motherContentId === input.motherContentId && feedback.motherContentVersion === input.motherContentVersion ? feedback : null;
}

function usageDTO(rows: UsageRow[], feedback: FeedbackRow | null): CreationFeedbackMethodDTO[] {
  const ratings = new Map((feedback?.methodFeedbacks ?? []).map((item) => [item.methodUsageId, item.rating]));
  return rows.map((row) => ({ methodUsageId: row.id, methodVersionId: row.methodVersion.id, methodVersion: row.methodVersion.version, title: row.methodVersion.title, rating: ratings.get(row.id) ?? null }));
}

export async function getCreationFeedbackContext(input: { workspaceId: string; userId: string; projectId: string }): Promise<CreationFeedbackContext> {
  const project = await ownedProject(input);
  const mother = project.motherContent;
  if (!mother || mother.origin !== "KIMI" || !mother.body.trim()) return { available: false, projectId: project.id, motherContentId: mother?.id ?? null, motherContentVersion: mother?.version ?? null, sourceAiRunId: null, methods: [], feedback: null, unavailableReason: "MOTHER_NOT_READY" };
  const run = await appliedGeneration(input);
  if (!run) return { available: false, projectId: project.id, motherContentId: mother.id, motherContentVersion: mother.version, sourceAiRunId: null, methods: [], feedback: null, unavailableReason: "NO_APPLIED_GENERATION" };
  const [usages, feedback] = await Promise.all([
    methodUsages({ ...input, sourceAiRunId: run.id }),
    existingFeedback({ userId: input.userId, projectId: input.projectId, motherContentId: mother.id, motherContentVersion: mother.version }),
  ]);
  return { available: true, projectId: project.id, motherContentId: mother.id, motherContentVersion: mother.version, sourceAiRunId: run.id, methods: usageDTO(usages, feedback), feedback: feedback ? toFeedback(feedback) : null };
}

export async function upsertCreationFeedback(input: { workspaceId: string; userId: string; projectId: string; data: unknown }) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { role: true } });
  if (!member || member.role === "VIEWER") throw new CreationFeedbackError("FEEDBACK_FORBIDDEN", "当前权限不能保存反馈。");
  const parsed = upsertCreationFeedbackSchema.safeParse(input.data);
  if (!parsed.success) throw new CreationFeedbackError("FEEDBACK_INVALID_INPUT", "请选择稿件结果并检查方法反馈。");
  const project = await ownedProject(input);
  const mother = project.motherContent;
  if (!mother || mother.origin !== "KIMI" || !mother.body.trim()) throw new CreationFeedbackError("FEEDBACK_UNAVAILABLE", "当前口播稿还没有可反馈的生成记录。");
  if (mother.version !== parsed.data.motherContentVersion) throw new CreationFeedbackError("FEEDBACK_UNAVAILABLE", "口播稿已更新，请刷新后反馈当前版本。");
  const run = await appliedGeneration(input);
  if (!run) throw new CreationFeedbackError("FEEDBACK_UNAVAILABLE", "当前口播稿还没有可反馈的生成记录。");
  const ids = parsed.data.methodFeedbacks.map((item) => item.methodUsageId);
  const usageRows = ids.length ? await db.methodUsage.findMany({ where: { id: { in: ids }, userId: input.userId, projectId: input.projectId, aiRunId: run.id, project: { workspaceId: input.workspaceId, createdById: input.userId }, methodAsset: { workspaceId: input.workspaceId, ownerUserId: input.userId }, aiRun: { id: run.id, workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, action: "GENERATE_MOTHER_CONTENT", status: "SUCCEEDED", appliedAt: { not: null } } }, select: { id: true, methodVersionId: true, methodVersion: { select: { steps: true } } } }) : [];
  const usages = usageRows.filter((usage) => !isDefaultContentMethodPayload(usage.methodVersion.steps));
  if (usages.length !== ids.length) throw new CreationFeedbackError("FEEDBACK_METHOD_INVALID", "有方法不是本次生成中使用的版本。");
  const usageById = new Map(usages.map((usage) => [usage.id, usage]));
  await db.$transaction(async (tx) => {
    const existing = await tx.creationFeedback.findUnique({ where: { userId_projectId: { userId: input.userId, projectId: input.projectId } }, select: { id: true } });
    const feedback = await tx.creationFeedback.upsert({ where: { userId_projectId: { userId: input.userId, projectId: input.projectId } }, create: { workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, motherContentId: mother.id, motherContentVersion: mother.version, sourceAiRunId: run.id, outcome: parsed.data.outcome }, update: { motherContentId: mother.id, motherContentVersion: mother.version, sourceAiRunId: run.id, outcome: parsed.data.outcome } });
    if (ids.length) await tx.methodUsageFeedback.deleteMany({ where: { creationFeedbackId: feedback.id, methodUsageId: { notIn: ids } } });
    else await tx.methodUsageFeedback.deleteMany({ where: { creationFeedbackId: feedback.id } });
    for (const item of parsed.data.methodFeedbacks) {
      const usage = usageById.get(item.methodUsageId)!;
      await tx.methodUsageFeedback.upsert({ where: { creationFeedbackId_methodUsageId: { creationFeedbackId: feedback.id, methodUsageId: usage.id } }, create: { creationFeedbackId: feedback.id, methodUsageId: usage.id, methodVersionId: usage.methodVersionId, userId: input.userId, rating: item.rating }, update: { methodVersionId: usage.methodVersionId, userId: input.userId, rating: item.rating } });
    }
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: existing ? "creation_feedback.updated" : "creation_feedback.created", resourceType: "creation_feedback", resourceId: feedback.id, metadata: json({ projectId: input.projectId, motherContentId: mother.id, motherContentVersion: mother.version, sourceAiRunId: run.id, outcome: parsed.data.outcome, methodCount: ids.length }) } });
  });
  return getCreationFeedbackContext(input);
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
