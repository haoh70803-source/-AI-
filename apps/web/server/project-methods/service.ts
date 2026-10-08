import "server-only";

import { db, type Prisma } from "@content-center/db";
import { listMethods } from "../methods/service";
import { z } from "zod";
import { isDefaultContentMethodPayload, parseDefaultContentMethodPayload } from "../default-content-method/schemas";
import type { WorkflowSkillContract } from "../workflow-skill/contract";

const methodVersionId = z.string().trim().min(1).max(200);
export const methodSelectionSchema = z.object({
  methodVersionIds: z.array(methodVersionId).max(20).transform((ids) => [...new Set(ids)]).refine((ids) => ids.length <= 3, "当前版本最多加载 3 个 Skill（兼容限制）。"),
}).strict();

export class ProjectMethodError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "METHOD_SELECTION_INVALID" | "METHOD_SELECTION_FORBIDDEN", message: string) {
    super(message);
    this.name = "ProjectMethodError";
  }
}

export type ProjectMethodAvailableDTO = {
  methodAssetId: string;
  methodVersionId: string;
  title: string;
  summary: string;
  applicableScenarios: string[];
  status: "SAVED" | "TRIAL" | "CORE";
};

export type ProjectMethodSelectedDTO = Omit<ProjectMethodAvailableDTO, "status"> & {
  status: "SAVED" | "TRIAL" | "CORE" | "DISABLED";
  selectionId: string;
  steps: string[];
  applicableScenarios: string[];
  boundaries: string[];
  latestVersionId: string;
  latestTitle: string;
  isOutdated: boolean;
  isDisabled: boolean;
};

export type ProjectMethodStateDTO = {
  selected: ProjectMethodSelectedDTO[];
  available: ProjectMethodAvailableDTO[];
};

export type SelectedGenerationMethod = {
  methodAssetId: string;
  methodVersionId: string;
  version: number;
  title: string;
  steps: string[];
  applicableScenarios: string[];
  boundaries: string[];
  workflowContract: WorkflowSkillContract | null;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function strings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function projectForUser(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } }, select: { id: true } });
  if (!project) throw new ProjectMethodError("PROJECT_NOT_FOUND", "创作不存在。");
  return project;
}

function selectedDTO(row: {
  id: string;
  methodAssetId: string;
  methodVersionId: string;
  methodAsset: { status: "SAVED" | "TRIAL" | "CORE" | "DISABLED"; versions: Array<{ id: string; title: string }> };
  methodVersion: { title: string; steps: Prisma.JsonValue; applicableScenarios: Prisma.JsonValue; boundaries: Prisma.JsonValue };
}): ProjectMethodSelectedDTO {
  const latest = row.methodAsset.versions[0] ?? { id: row.methodVersionId, title: row.methodVersion.title };
  const status = row.methodAsset.status;
  return {
    selectionId: row.id,
    methodAssetId: row.methodAssetId,
    methodVersionId: row.methodVersionId,
    title: row.methodVersion.title,
    summary: strings(row.methodVersion.steps)[0] || "已保存的方法内容",
    status,
    steps: strings(row.methodVersion.steps),
    applicableScenarios: strings(row.methodVersion.applicableScenarios),
    boundaries: strings(row.methodVersion.boundaries),
    latestVersionId: latest.id,
    latestTitle: latest.title,
    isOutdated: latest.id !== row.methodVersionId,
    isDisabled: status === "DISABLED",
  };
}

export async function getProjectMethodState(input: { workspaceId: string; userId: string; projectId: string }): Promise<ProjectMethodStateDTO> {
  await projectForUser(input);
  const [selectedRows, available] = await Promise.all([
    db.projectMethodSelection.findMany({
      where: { projectId: input.projectId, selectedByUserId: input.userId, project: { workspaceId: input.workspaceId }, methodAsset: { workspaceId: input.workspaceId, ownerUserId: input.userId } },
      orderBy: { createdAt: "asc" },
      include: { methodAsset: { select: { status: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, title: true } } } }, methodVersion: { select: { title: true, steps: true, applicableScenarios: true, boundaries: true } } },
    }),
    listMethods({ workspaceId: input.workspaceId, ownerUserId: input.userId }),
  ]);
  return {
    selected: selectedRows.filter((row) => !isDefaultContentMethodPayload(row.methodVersion.steps)).map(selectedDTO),
    available: available.flatMap((method) => method.status === "DISABLED" ? [] : [{ methodAssetId: method.id, methodVersionId: method.current.id, title: method.current.title, summary: method.current.steps[0] || "已保存的方法内容", applicableScenarios: method.current.applicableScenarios, status: method.status }]),
  };
}

export async function setProjectMethodSelections(input: { workspaceId: string; userId: string; projectId: string; methodVersionIds: string[] }) {
  await projectForUser(input);
  const membership = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { role: true } });
  if (!membership || membership.role === "VIEWER") throw new ProjectMethodError("METHOD_SELECTION_FORBIDDEN", "当前用户不能修改方法选择。");
  const ids = [...new Set(input.methodVersionIds)];
  if (ids.length > 3) throw new ProjectMethodError("METHOD_SELECTION_INVALID", "当前版本最多加载 3 个 Skill（兼容限制）。");
  const rows = ids.length ? await db.methodVersion.findMany({ where: { id: { in: ids }, asset: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: { not: "DISABLED" } }, }, select: { id: true, assetId: true, steps: true } }) : [];
  const versions = rows.filter(({ steps }) => !isDefaultContentMethodPayload(steps));
  if (versions.length !== ids.length || new Set(versions.map(({ assetId }) => assetId)).size !== versions.length) throw new ProjectMethodError("METHOD_SELECTION_FORBIDDEN", "只能选择自己的可用方法。");
  await db.$transaction(async (tx) => {
    await tx.projectMethodSelection.deleteMany({ where: { projectId: input.projectId, selectedByUserId: input.userId } });
    if (versions.length) await tx.projectMethodSelection.createMany({ data: versions.map(({ id: methodVersionId, assetId: methodAssetId }) => ({ projectId: input.projectId, methodAssetId, methodVersionId, selectedByUserId: input.userId })) });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "project.methods_updated", resourceType: "content_project", resourceId: input.projectId, metadata: json({ methodCount: versions.length, methodVersionIds: versions.map(({ id }) => id) }) } });
  }, { isolationLevel: "Serializable" });
  return getProjectMethodState(input);
}

export async function getSelectedGenerationMethods(input: { workspaceId: string; userId: string; projectId: string }): Promise<SelectedGenerationMethod[]> {
  await projectForUser(input);
  const rows = await db.projectMethodSelection.findMany({
    where: { projectId: input.projectId, selectedByUserId: input.userId, project: { workspaceId: input.workspaceId }, methodAsset: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: { not: "DISABLED" } } },
    orderBy: { createdAt: "asc" },
    include: { methodVersion: { select: { version: true, title: true, steps: true, applicableScenarios: true, boundaries: true, workflowContract: true } } },
  });
  if (rows.length > 3) throw new ProjectMethodError("METHOD_SELECTION_INVALID", "本次选择的 Skill 超过当前兼容上限 3 个，请刷新后重试。");
  return rows.filter(({ methodVersion }) => !isDefaultContentMethodPayload(methodVersion.steps)).map(({ methodAssetId, methodVersionId, methodVersion }) => ({ methodAssetId, methodVersionId, version: methodVersion.version, title: methodVersion.title, steps: strings(methodVersion.steps), applicableScenarios: strings(methodVersion.applicableScenarios), boundaries: strings(methodVersion.boundaries), workflowContract: methodVersion.workflowContract && typeof methodVersion.workflowContract === "object" && !Array.isArray(methodVersion.workflowContract) ? methodVersion.workflowContract as unknown as WorkflowSkillContract : null }));
}

export async function recordSelectedMethodUsages(input: { workspaceId: string; userId: string; projectId: string; aiRunId: string; methodVersionIds: string[] }) {
  return recordGenerationMethodUsages({ ...input, selectedMethodVersionIds: input.methodVersionIds });
}

export async function recordGenerationMethodUsages(input: { workspaceId: string; userId: string; projectId: string; aiRunId: string; selectedMethodVersionIds: string[]; defaultMethodVersionId?: string }) {
  await projectForUser(input);
  const ids = [...new Set(input.selectedMethodVersionIds)];
  if (ids.length > 3) throw new ProjectMethodError("METHOD_SELECTION_INVALID", "本次选择的 Skill 超过当前兼容上限 3 个，请刷新后重试。");
  if (!ids.length && !input.defaultMethodVersionId) return [];
  return db.$transaction(async (tx) => {
    const run = await tx.aIRun.findFirst({ where: { id: input.aiRunId, workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, status: "RUNNING" }, select: { id: true } });
    if (!run) throw new ProjectMethodError("METHOD_SELECTION_INVALID", "本次生成记录不存在或不属于当前创作。请刷新后重试。");
    const rows = await tx.projectMethodSelection.findMany({
      where: { projectId: input.projectId, selectedByUserId: input.userId, methodVersionId: { in: ids }, project: { workspaceId: input.workspaceId }, methodAsset: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: { not: "DISABLED" } } },
      select: { methodAssetId: true, methodVersionId: true, methodVersion: { select: { assetId: true, steps: true } } },
    });
    if (rows.length !== ids.length || new Set(rows.map(({ methodAssetId }) => methodAssetId)).size !== rows.length || rows.some(({ methodAssetId, methodVersion }) => methodAssetId !== methodVersion.assetId || isDefaultContentMethodPayload(methodVersion.steps))) throw new ProjectMethodError("METHOD_SELECTION_INVALID", "本次选择的方法已变化，请刷新后重试。");
    const defaultVersion = input.defaultMethodVersionId ? await tx.methodVersion.findFirst({ where: { id: input.defaultMethodVersionId, workspaceDefaultKey: "DEFAULT_CONTENT", asset: { workspaceId: input.workspaceId } }, select: { id: true, assetId: true, steps: true } }) : null;
    const parsedDefault = defaultVersion ? parseDefaultContentMethodPayload(defaultVersion.steps) : null;
    if (input.defaultMethodVersionId && (!defaultVersion || !parsedDefault?.success || parsedDefault.data.publicationStatus !== "PUBLISHED")) throw new ProjectMethodError("METHOD_SELECTION_INVALID", "公司默认方法版本已变化，请刷新后重试。");
    const usages = [...rows.map(({ methodAssetId, methodVersionId }) => ({ methodAssetId, methodVersionId })), ...(defaultVersion ? [{ methodAssetId: defaultVersion.assetId, methodVersionId: defaultVersion.id }] : [])];
    await tx.methodUsage.createMany({ data: usages.map(({ methodAssetId, methodVersionId }) => ({ projectId: input.projectId, methodAssetId, methodVersionId, aiRunId: input.aiRunId, userId: input.userId })) });
    return usages;
  }, { isolationLevel: "Serializable" });
}
