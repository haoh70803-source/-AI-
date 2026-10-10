import "server-only";

import { db, type Prisma } from "@content-center/db";
import { DraftServiceError, writeDraftRevisionInTransaction } from "../drafts/service";
import { artifactSummaryView, artifactView, type ArtifactSummaryView, type ArtifactView } from "./view-model";

type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export type ArtifactServiceErrorCode = "ARTIFACT_INVALID_INPUT" | "ARTIFACT_RESULT_NOT_APPLICABLE" | "ARTIFACT_MESSAGE_MISMATCH" | "ARTIFACT_FORBIDDEN" | "ARTIFACT_NOT_FOUND" | "ARTIFACT_VERSION_CONFLICT";

export class ArtifactServiceError extends Error {
  constructor(readonly code: ArtifactServiceErrorCode, message: string) {
    super(message);
    this.name = "ArtifactServiceError";
  }
}

const artifactInclude = { draftBranch: { select: { version: true, workingBody: true, confirmedRevisionId: true } } } satisfies Prisma.ArtifactInclude;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function projectForUser(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { disabledAt: null, members: { some: { userId: input.userId, disabledAt: null, user: { disabledAt: null } } } } },
    select: { id: true, primaryDraftBranchId: true, workspace: { select: { members: { where: { userId: input.userId }, take: 1, select: { role: true } } } } },
  });
  if (!project) throw new ArtifactServiceError("ARTIFACT_NOT_FOUND", "产出不存在。");
  return { ...project, role: project.workspace.members[0]?.role as WorkspaceRole | undefined };
}

function requireWrite(role: WorkspaceRole | undefined) {
  if (!role || role === "VIEWER") throw new ArtifactServiceError("ARTIFACT_FORBIDDEN", "当前权限只能查看产出。");
}

async function scopedArtifact(input: { workspaceId: string; userId: string; projectId: string; artifactId: string }) {
  await projectForUser(input);
  const artifact = await db.artifact.findFirst({ where: { id: input.artifactId, workspaceId: input.workspaceId, projectId: input.projectId, draftBranch: { deletedAt: null } }, include: artifactInclude });
  if (!artifact) throw new ArtifactServiceError("ARTIFACT_NOT_FOUND", "产出不存在。");
  return artifact;
}

function textFromCompletedMessage(message: { content: string; metadata: unknown }) {
  const structured = record(record(message.metadata).structuredResult);
  const value = structured.type === "REWRITE" && typeof structured.aiVersion === "string" ? structured.aiVersion.trim() : message.content.trim();
  if (!value) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "这条回复没有可保存的文本内容。");
  return value;
}

function rewriteFromCompletedMessage(message: { metadata: unknown }) {
  const structured = record(record(message.metadata).structuredResult);
  const value = structured.type === "REWRITE" && typeof structured.aiVersion === "string" ? structured.aiVersion : "";
  if (!value.trim()) throw new ArtifactServiceError("ARTIFACT_RESULT_NOT_APPLICABLE", "这条回复没有可应用的完整修改结果。");
  return value;
}

export async function listArtifacts(input: { workspaceId: string; userId: string; projectId: string }): Promise<ArtifactSummaryView[]> {
  await projectForUser(input);
  const rows = await db.artifact.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId, draftBranch: { deletedAt: null } }, include: artifactInclude, orderBy: { updatedAt: "desc" } });
  return rows.map(artifactSummaryView);
}

export async function getArtifactForUser(input: { workspaceId: string; userId: string; projectId: string; artifactId: string }): Promise<ArtifactView> {
  return artifactView(await scopedArtifact(input));
}

export const getArtifact = getArtifactForUser;
export const getArtifactContext = getArtifactForUser;

export async function getArtifactHistoryPage(input: { workspaceId: string; userId: string; projectId: string; artifactId: string; beforeRevision?: number }) {
  const artifact = await scopedArtifact(input);
  if (input.beforeRevision !== undefined && (!Number.isSafeInteger(input.beforeRevision) || input.beforeRevision < 1)) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "历史版本位置无效。");
  const rows = await db.draftRevision.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId, draftBranchId: artifact.draftBranchId, ...(input.beforeRevision ? { revision: { lt: input.beforeRevision } } : {}) }, orderBy: { revision: "desc" }, take: 101, select: { id: true, revision: true, title: true, body: true, createdAt: true } });
  const items = rows.slice(0, 100);
  return { items, nextCursor: rows.length > 100 ? items.at(-1)!.revision : null };
}

export async function getArtifactHistory(input: { workspaceId: string; userId: string; projectId: string; artifactId: string }) {
  return (await getArtifactHistoryPage(input)).items;
}

export async function restoreArtifactRevision(input: { workspaceId: string; userId: string; projectId: string; artifactId: string; revisionId: string; expectedVersion: number }) {
  const artifact = await scopedArtifact(input);
  const revision = await db.draftRevision.findFirst({ where: { id: input.revisionId, workspaceId: input.workspaceId, projectId: input.projectId, draftBranchId: artifact.draftBranchId } });
  if (!revision) throw new ArtifactServiceError("ARTIFACT_NOT_FOUND", "历史版本不存在。");
  // Restoration appends a new revision; no history is deleted or overwritten.
  return saveTextArtifact({ ...input, title: revision.title, body: revision.body });
}

export async function setArtifactLocked(input: { workspaceId: string; userId: string; projectId: string; artifactId: string; expectedVersion: number; locked: boolean }) {
  const project = await projectForUser(input);
  requireWrite(project.role);
  await db.$transaction(async tx => {
    const member = await tx.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, userId: input.userId, disabledAt: null, role: { not: "VIEWER" }, workspace: { disabledAt: null }, user: { disabledAt: null } } });
    if (!member) throw new ArtifactServiceError("ARTIFACT_FORBIDDEN", "当前账号没有修改权限。");
    const artifact = await tx.artifact.findFirst({ where: { id: input.artifactId, workspaceId: input.workspaceId, projectId: input.projectId, draftBranch: { deletedAt: null } }, include: { draftBranch: true } });
    if (!artifact) throw new ArtifactServiceError("ARTIFACT_NOT_FOUND", "成果不存在。");
    if (artifact.draftBranchId === project.primaryDraftBranchId) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "请在主稿入口管理主稿确认状态。");
    if (input.locked && !artifact.draftBranch.currentRevisionId) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "请先保存成果。");
    if (input.locked && /【需要确认】|【待核实】/u.test(artifact.draftBranch.workingBody)) throw new ArtifactServiceError("ARTIFACT_RESULT_NOT_APPLICABLE", "成果含待核实内容，请核对来源并修改后再确认锁定；当前内容可保留为草稿。");
    const changed = await tx.draftBranch.updateMany({ where: { id: artifact.draftBranchId, version: input.expectedVersion }, data: { confirmedRevisionId: input.locked ? artifact.draftBranch.currentRevisionId : null, version: { increment: 1 }, updatedById: input.userId } });
    if (changed.count !== 1) throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "成果已变化，请重新打开。");
    await tx.artifact.update({ where: { id: artifact.id }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: input.locked ? "artifact.locked" : "artifact.unlocked", resourceType: "artifact", resourceId: artifact.id, metadata: { previousVersion: input.expectedVersion } } });
  });
  return getArtifactForUser(input);
}

export async function createTextArtifact(input: { workspaceId: string; userId: string; projectId: string; title: string; sourceMessageId: string }): Promise<ArtifactView> {
  const title = input.title.trim();
  if (!title || title.length > 200) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "请输入 1 到 200 个字的产出标题。");
  const project = await projectForUser(input);
  requireWrite(project.role);
  const sourceMessage = await db.assistantMessage.findFirst({
    where: { id: input.sourceMessageId, role: "ASSISTANT", status: "COMPLETED", thread: { workspaceId: input.workspaceId, projectId: input.projectId, canvasObjectId: null, createdById: input.userId } },
    select: { id: true, content: true, metadata: true, artifactId: true },
  });
  if (!sourceMessage) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "这条回复不存在或还没有完成。");
  if (sourceMessage.artifactId) return getArtifactForUser({ ...input, artifactId: sourceMessage.artifactId });
  const body = textFromCompletedMessage(sourceMessage);

  const artifactId = await db.$transaction(async (tx) => {
    const branch = await tx.draftBranch.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, title, createdById: input.userId, updatedById: input.userId } });
    await writeDraftRevisionInTransaction(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branchId: branch.id, primaryDraftBranchId: project.primaryDraftBranchId, expectedVersion: branch.version, title, body, outline: [], origin: "AI", originNote: "由项目 Conversation 保存为通用文本产出" });
    const artifact = await tx.artifact.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, draftBranchId: branch.id, createdById: input.userId, type: "TEXT", title } });
    const linked = await tx.assistantMessage.updateMany({ where: { id: sourceMessage.id, artifactId: null }, data: { artifactId: artifact.id } });
    if (linked.count !== 1) throw new ArtifactServiceError("ARTIFACT_MESSAGE_MISMATCH", "这条回复已经关联其他产出。");
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "artifact.created", resourceType: "artifact", resourceId: artifact.id, metadata: json({ projectId: input.projectId, draftBranchId: branch.id, sourceMessageId: sourceMessage.id, type: "TEXT" }) } });
    return artifact.id;
  }, { isolationLevel: "Serializable" });
  return getArtifactForUser({ ...input, artifactId });
}

export async function applyTextArtifactRevision(input: { workspaceId: string; userId: string; projectId: string; artifactId: string; sourceMessageId: string; expectedVersion: number }): Promise<ArtifactView> {
  const project = await projectForUser(input);
  requireWrite(project.role);
  const message = await db.assistantMessage.findFirst({
    where: { id: input.sourceMessageId, role: "ASSISTANT", status: "COMPLETED", thread: { workspaceId: input.workspaceId, projectId: input.projectId, canvasObjectId: null, createdById: input.userId } },
    select: { id: true, artifactId: true, metadata: true, aiRunId: true },
  });
  if (!message) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "这条修改结果不存在或还没有完成。");
  if (message.artifactId !== input.artifactId) throw new ArtifactServiceError("ARTIFACT_MESSAGE_MISMATCH", "这条修改结果不属于当前产出。");
  const body = rewriteFromCompletedMessage(message);

  try {
    await db.$transaction(async (tx) => {
      const artifact = await tx.artifact.findFirst({ where: { id: input.artifactId, workspaceId: input.workspaceId, projectId: input.projectId, draftBranch: { deletedAt: null } }, include: { draftBranch: { include: { currentRevision: true } } } });
      if (!artifact) throw new ArtifactServiceError("ARTIFACT_NOT_FOUND", "产出不存在。");
      if (artifact.draftBranchId === project.primaryDraftBranchId) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "当前产出不能使用 legacy primary draft。");
      if (artifact.draftBranch.version !== input.expectedVersion) throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "产出已经在其他位置更新，请刷新后重试。");
      if (artifact.draftBranch.confirmedRevisionId) throw new ArtifactServiceError("ARTIFACT_FORBIDDEN", "成果已锁定，请先解锁。");
      const metadata = record(message.metadata);
      if (typeof metadata.sourceArtifactVersion === "number" && metadata.sourceArtifactVersion !== input.expectedVersion) throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "这条修改基于旧版本，请重新生成。");
      let editBase = artifact.draftBranch.workingBody;
      if (typeof metadata.baseProposalMessageId === "string") {
        const previous = await tx.assistantMessage.findFirst({ where: { id: metadata.baseProposalMessageId, artifactId: artifact.id, role: "ASSISTANT", status: "COMPLETED", thread: { workspaceId: input.workspaceId, projectId: input.projectId, createdById: input.userId, canvasObjectId: null } }, select: { metadata: true } });
        if (!previous || record(previous.metadata).sourceArtifactVersion !== input.expectedVersion) throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "上轮修改的基稿已经变化，请重新生成。");
        editBase = rewriteFromCompletedMessage(previous);
      }
      const scope = record(metadata.editScope);
      if (typeof scope.start === "number" && typeof scope.end === "number" && (!body.startsWith(editBase.slice(0, scope.start)) || !body.endsWith(editBase.slice(scope.end)))) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "局部修改结果改变了未选中内容，不能应用。");
      await writeDraftRevisionInTransaction(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branchId: artifact.draftBranchId, primaryDraftBranchId: project.primaryDraftBranchId, expectedVersion: input.expectedVersion, title: artifact.title, body, outline: strings(artifact.draftBranch.workingOutline), origin: "AI", originNote: "由项目 Conversation 修改通用文本产出", generateRunId: message.aiRunId });
      await tx.artifact.update({ where: { id: artifact.id }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "artifact.revision_applied", resourceType: "artifact", resourceId: artifact.id, metadata: json({ projectId: input.projectId, draftBranchId: artifact.draftBranchId, sourceMessageId: message.id, previousVersion: input.expectedVersion, nextVersion: input.expectedVersion + 1 }) } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof ArtifactServiceError) throw error;
    if (error instanceof DraftServiceError && error.code === "DRAFT_VERSION_CONFLICT") throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "产出已经在其他位置更新，请刷新后重试。");
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "产出已经在其他位置更新，请刷新后重试。");
    throw error;
  }
  return getArtifactForUser(input);
}

/** Manual editing reuses the same versioned branch primitive as AI revisions. */
export async function saveTextArtifact(input: { workspaceId: string; userId: string; projectId: string; artifactId: string; expectedVersion: number; title: string; body: string }): Promise<ArtifactView> {
  const title = input.title.trim();
  if (!title || title.length > 200 || input.body.length > 1_000_000 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "请检查成果标题、正文和版本。");
  const project = await projectForUser(input); requireWrite(project.role);
  try {
    await db.$transaction(async tx => {
      const artifact = await tx.artifact.findFirst({ where: { id: input.artifactId, workspaceId: input.workspaceId, projectId: input.projectId, draftBranch: { deletedAt: null } }, include: { draftBranch: true } });
      if (!artifact) throw new ArtifactServiceError("ARTIFACT_NOT_FOUND", "成果不存在或不可访问。");
      if (artifact.draftBranchId === project.primaryDraftBranchId) throw new ArtifactServiceError("ARTIFACT_INVALID_INPUT", "请在项目稿件中修改当前主稿。");
      if (artifact.draftBranch.version !== input.expectedVersion) throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "成果已经更新，请重新打开后再保存；当前编辑内容仍保留。");
      if (artifact.draftBranch.confirmedRevisionId) throw new ArtifactServiceError("ARTIFACT_FORBIDDEN", "成果已锁定，请先解锁。");
      await writeDraftRevisionInTransaction(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branchId: artifact.draftBranchId, primaryDraftBranchId: project.primaryDraftBranchId, expectedVersion: input.expectedVersion, title, body: input.body, outline: strings(artifact.draftBranch.workingOutline), origin: "HUMAN", originNote: "手动修改通用文本成果" });
      await tx.artifact.update({ where: { id: artifact.id }, data: { title, updatedAt: new Date() } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "artifact.manually_saved", resourceType: "artifact", resourceId: artifact.id, metadata: json({ projectId: input.projectId, previousVersion: input.expectedVersion }) } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof ArtifactServiceError) throw error;
    if (error instanceof DraftServiceError && error.code === "DRAFT_VERSION_CONFLICT" || error && typeof error === "object" && "code" in error && error.code === "P2034") throw new ArtifactServiceError("ARTIFACT_VERSION_CONFLICT", "成果已经更新，请重新打开后再保存；当前编辑内容仍保留。");
    throw error;
  }
  return getArtifactForUser(input);
}
