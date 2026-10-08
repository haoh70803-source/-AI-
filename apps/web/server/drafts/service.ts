import "server-only";

import { db, type DraftRevisionOrigin, type MotherContentOrigin, type Prisma } from "@content-center/db";

type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export type DraftRevisionDTO = {
  id: string;
  revision: number;
  title: string;
  body: string;
  outline: string[];
  origin: DraftRevisionOrigin;
  originNote: string | null;
  createdAt: string;
  current: boolean;
};

export type DraftWorkingStateDTO = {
  title: string;
  body: string;
  outline: string[];
  origin: DraftRevisionOrigin;
  originNote: string | null;
  generateRunId: string | null;
};

export type DraftBranchDTO = {
  id: string;
  title: string;
  version: number;
  currentRevisionId: string | null;
  confirmedRevisionId: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  workingState: DraftWorkingStateDTO;
  currentRevision: DraftRevisionDTO | null;
};

export class DraftServiceError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "DRAFT_NOT_FOUND" | "DRAFT_FORBIDDEN" | "DRAFT_INVALID" | "DRAFT_VERSION_CONFLICT" | "DRAFT_PRIMARY_CONFLICT" | "DRAFT_PRIMARY_DELETE_FORBIDDEN" | "DRAFT_EMPTY") {
    const messages: Record<typeof code, string> = {
      PROJECT_NOT_FOUND: "项目不存在。",
      DRAFT_NOT_FOUND: "稿件不存在。",
      DRAFT_FORBIDDEN: "当前权限只能查看稿件。",
      DRAFT_INVALID: "请检查稿件内容。",
      DRAFT_VERSION_CONFLICT: "稿件已经在其他位置更新，请刷新后重试。",
      DRAFT_PRIMARY_CONFLICT: "当前主稿已经变化，请刷新后重试。",
      DRAFT_PRIMARY_DELETE_FORBIDDEN: "这是当前主稿，请先选择其他稿件作为主稿。",
      DRAFT_EMPTY: "稿件还没有可用内容。",
    };
    super(messages[code]);
    this.name = "DraftServiceError";
  }
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function draftOrigin(origin: MotherContentOrigin): DraftRevisionOrigin {
  return origin === "KIMI" ? "AI" : origin;
}

function motherOrigin(origin: DraftRevisionOrigin): MotherContentOrigin {
  return origin === "AI" ? "KIMI" : origin;
}

function revisionDTO(row: { id: string; revision: number; title: string; body: string; outline: unknown; origin: DraftRevisionOrigin; originNote: string | null; createdAt: Date }, currentRevisionId?: string | null): DraftRevisionDTO {
  return { id: row.id, revision: row.revision, title: row.title, body: row.body, outline: strings(row.outline), origin: row.origin, originNote: row.originNote, createdAt: row.createdAt.toISOString(), current: row.id === currentRevisionId };
}

const branchInclude = { currentRevision: true } satisfies Prisma.DraftBranchInclude;
type BranchRow = Prisma.DraftBranchGetPayload<{ include: typeof branchInclude }>;

function branchDTO(row: BranchRow, primaryDraftBranchId: string | null): DraftBranchDTO {
  return {
    id: row.id,
    title: row.title,
    version: row.version,
    currentRevisionId: row.currentRevisionId,
    confirmedRevisionId: row.confirmedRevisionId,
    isPrimary: row.id === primaryDraftBranchId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    workingState: { title: row.workingTitle, body: row.workingBody, outline: strings(row.workingOutline), origin: row.workingOrigin, originNote: row.workingOriginNote, generateRunId: row.workingGenerateRunId },
    currentRevision: row.currentRevision ? revisionDTO(row.currentRevision, row.currentRevisionId) : null,
  };
}

async function projectForUser(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
    select: { id: true, workspaceId: true, createdById: true, primaryDraftBranchId: true, primaryDraftBranch: { select: { id: true, currentRevisionId: true, version: true } }, motherContent: true, workspace: { select: { members: { where: { userId: input.userId }, take: 1, select: { role: true } } } } },
  });
  if (!project) throw new DraftServiceError("PROJECT_NOT_FOUND");
  return { ...project, role: project.workspace.members[0]?.role as WorkspaceRole | undefined };
}

function requireEdit(role: WorkspaceRole | undefined) {
  if (!role || role === "VIEWER") throw new DraftServiceError("DRAFT_FORBIDDEN");
}

async function ensurePrimaryBranch(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await projectForUser(input);
  if (project.primaryDraftBranchId && (project.primaryDraftBranch?.currentRevisionId || !project.motherContent)) return project;
  await db.$transaction(async (tx) => {
    const current = await tx.contentProject.findUnique({ where: { id: project.id }, select: { primaryDraftBranchId: true, primaryDraftBranch: { select: { id: true, currentRevisionId: true, version: true } }, motherContent: true } });
    if (!current) throw new DraftServiceError("PROJECT_NOT_FOUND");
    let branch = current.primaryDraftBranch;
    if (!branch) {
      branch = await tx.draftBranch.create({ data: { workspaceId: project.workspaceId, projectId: project.id, title: "主稿", createdById: project.createdById, updatedById: project.createdById }, select: { id: true, currentRevisionId: true, version: true } });
      const updated = await tx.contentProject.updateMany({ where: { id: project.id, primaryDraftBranchId: null }, data: { primaryDraftBranchId: branch.id } });
      if (updated.count !== 1) { await tx.draftBranch.delete({ where: { id: branch.id } }); return; }
    }
    if (!branch.currentRevisionId && current.motherContent) {
      const revision = await tx.draftRevision.create({ data: { workspaceId: project.workspaceId, projectId: project.id, draftBranchId: branch.id, revision: 1, title: current.motherContent.title, body: current.motherContent.body, outline: current.motherContent.outline as Prisma.InputJsonValue, origin: draftOrigin(current.motherContent.origin), originNote: current.motherContent.originNote, createdById: current.motherContent.createdById, createdAt: current.motherContent.updatedAt } });
      await tx.draftBranch.update({ where: { id: branch.id }, data: { workingTitle: revision.title, workingBody: revision.body, workingOutline: revision.outline as Prisma.InputJsonValue, workingOrigin: revision.origin, workingOriginNote: revision.originNote, currentRevisionId: revision.id, confirmedRevisionId: current.motherContent.confirmedVersion === current.motherContent.version ? revision.id : null, version: Math.max(1, branch.version), updatedById: current.motherContent.createdById } });
    }
  });
  return projectForUser(input);
}

async function writeRevision(tx: Prisma.TransactionClient, input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  branch: BranchRow;
  primaryDraftBranchId: string | null;
  data: { title: string; body: string; outline: string[]; origin: DraftRevisionOrigin; originNote?: string | null; generateRunId?: string | null; warningSnapshot?: unknown };
  expectedBranchVersion: number;
}) {
  if (input.branch.version !== input.expectedBranchVersion) throw new DraftServiceError("DRAFT_VERSION_CONFLICT");
  const content = { title: input.data.title.trim(), body: input.data.body, outline: input.data.outline };
  const sameAsCheckpoint = Boolean(input.branch.currentRevision
    && input.branch.currentRevision.title === content.title
    && input.branch.currentRevision.body === content.body
    && JSON.stringify(strings(input.branch.currentRevision.outline)) === JSON.stringify(content.outline));
  if (sameAsCheckpoint) {
    const branch = await tx.draftBranch.findUniqueOrThrow({ where: { id: input.branch.id }, include: branchInclude });
    const legacyContent = input.branch.id === input.primaryDraftBranchId ? await tx.motherContent.findUnique({ where: { projectId: input.projectId } }) : null;
    return { branch: branchDTO(branch, input.primaryDraftBranchId), revision: revisionDTO(input.branch.currentRevision!, input.branch.currentRevisionId), legacyContent, checkpointCreated: false };
  }
  if (!content.title && !content.body.trim() && content.outline.length === 0) {
    const branch = await tx.draftBranch.findUniqueOrThrow({ where: { id: input.branch.id }, include: branchInclude });
    return { branch: branchDTO(branch, input.primaryDraftBranchId), revision: null, legacyContent: null, checkpointCreated: false };
  }
  const maximum = await tx.draftRevision.aggregate({ where: { draftBranchId: input.branch.id }, _max: { revision: true } });
  const revision = await tx.draftRevision.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      draftBranchId: input.branch.id,
      revision: (maximum._max.revision ?? 0) + 1,
      title: content.title,
      body: content.body,
      outline: json(content.outline),
      origin: input.data.origin,
      originNote: input.data.originNote?.trim() || null,
      generateRunId: input.data.generateRunId ?? null,
      ...(input.data.warningSnapshot === undefined ? {} : { warningSnapshot: json(input.data.warningSnapshot) }),
      createdById: input.userId,
    },
  });
  const changed = await tx.draftBranch.updateMany({
    where: { id: input.branch.id, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null, version: input.expectedBranchVersion },
    data: { workingTitle: revision.title, workingBody: revision.body, workingOutline: revision.outline as Prisma.InputJsonValue, workingOrigin: revision.origin, workingOriginNote: revision.originNote, workingGenerateRunId: revision.generateRunId, currentRevisionId: revision.id, confirmedRevisionId: null, version: { increment: 1 }, updatedById: input.userId },
  });
  if (changed.count !== 1) throw new DraftServiceError("DRAFT_VERSION_CONFLICT");
  let legacyContent = null;
  if (input.branch.id === input.primaryDraftBranchId) {
    const existing = await tx.motherContent.findUnique({ where: { projectId: input.projectId } });
    legacyContent = existing
      ? await tx.motherContent.update({ where: { id: existing.id }, data: { title: revision.title, body: revision.body, outline: revision.outline as Prisma.InputJsonValue, origin: motherOrigin(revision.origin), originNote: revision.originNote, confirmedVersion: null, confirmedWarnings: { set: null }, ...(input.branch.currentRevision ? { version: { increment: 1 } } : {}) } })
      : await tx.motherContent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, title: revision.title, body: revision.body, outline: revision.outline as Prisma.InputJsonValue, origin: motherOrigin(revision.origin), originNote: revision.originNote, createdById: input.userId } });
  }
  await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "draft_revision.created", resourceType: "draft_revision", resourceId: revision.id, metadata: json({ projectId: input.projectId, draftBranchId: input.branch.id, revision: revision.revision, origin: revision.origin, primary: input.branch.id === input.primaryDraftBranchId }) } });
  const branch = await tx.draftBranch.findUniqueOrThrow({ where: { id: input.branch.id }, include: branchInclude });
  return { branch: branchDTO(branch, input.primaryDraftBranchId), revision: revisionDTO(revision, revision.id), legacyContent, checkpointCreated: true };
}

/** Internal transaction-scoped revision primitive shared by legacy drafts and Artifact-backed branches. */
export async function writeDraftRevisionInTransaction(tx: Prisma.TransactionClient, input: {
  workspaceId: string;
  userId: string;
  projectId: string;
  branchId: string;
  primaryDraftBranchId: string | null;
  expectedVersion: number;
  title: string;
  body: string;
  outline: string[];
  origin?: DraftRevisionOrigin;
  originNote?: string | null;
  generateRunId?: string | null;
  warningSnapshot?: unknown;
}) {
  const branch = await tx.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude });
  if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
  return writeRevision(tx, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    projectId: input.projectId,
    branch,
    primaryDraftBranchId: input.primaryDraftBranchId,
    expectedBranchVersion: input.expectedVersion,
    data: { title: input.title, body: input.body, outline: input.outline, origin: input.origin ?? "HUMAN", originNote: input.originNote, generateRunId: input.generateRunId, warningSnapshot: input.warningSnapshot },
  });
}

export async function listDraftBranches(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await ensurePrimaryBranch(input);
  const branches = await db.draftBranch.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude, orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }] });
  return branches.map((branch) => branchDTO(branch, project.primaryDraftBranchId));
}

export async function getDraftBranch(input: { workspaceId: string; userId: string; projectId: string; branchId: string }) {
  const project = await ensurePrimaryBranch(input);
  const branch = await db.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude });
  if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
  return branchDTO(branch, project.primaryDraftBranchId);
}

export async function getPrimaryDraft(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await ensurePrimaryBranch(input);
  if (!project.primaryDraftBranchId) throw new DraftServiceError("DRAFT_NOT_FOUND");
  return getDraftBranch({ ...input, branchId: project.primaryDraftBranchId });
}

export async function getDraftHistory(input: { workspaceId: string; userId: string; projectId: string; branchId: string }) {
  const branch = await getDraftBranch(input);
  const revisions = await db.draftRevision.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId, draftBranchId: input.branchId }, orderBy: [{ revision: "desc" }] });
  return revisions.map((revision) => revisionDTO(revision, branch.currentRevisionId));
}

export async function createDraftBranch(input: { workspaceId: string; userId: string; projectId: string; title: string; copyFromBranchId?: string | null }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  const title = input.title.trim();
  if (!title || title.length > 120) throw new DraftServiceError("DRAFT_INVALID");
  const source = input.copyFromBranchId ? await db.draftBranch.findFirst({ where: { id: input.copyFromBranchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude }) : null;
  if (input.copyFromBranchId && !source) throw new DraftServiceError("DRAFT_NOT_FOUND");
  return db.$transaction(async (tx) => {
    const sourceWorking = source ? { title: source.workingTitle, body: source.workingBody, outline: strings(source.workingOutline), origin: "HUMAN" as const, originNote: `从“${source.title}”复制` } : null;
    let branch = await tx.draftBranch.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, title, workingTitle: sourceWorking?.title ?? "", workingBody: sourceWorking?.body ?? "", workingOutline: json(sourceWorking?.outline ?? []), workingOrigin: sourceWorking?.origin ?? "HUMAN", workingOriginNote: sourceWorking?.originNote ?? null, createdById: input.userId, updatedById: input.userId }, include: branchInclude });
    if (sourceWorking) {
      const written = await writeRevision(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branch, primaryDraftBranchId: project.primaryDraftBranchId, expectedBranchVersion: 0, data: sourceWorking });
      branch = await tx.draftBranch.findUniqueOrThrow({ where: { id: written.branch.id }, include: branchInclude });
    }
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "draft_branch.created", resourceType: "draft_branch", resourceId: branch.id, metadata: json({ projectId: input.projectId, copiedFromBranchId: source?.id ?? null }) } });
    return branchDTO(branch, project.primaryDraftBranchId);
  });
}

export async function createDraftRevision(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedVersion: number; title: string; body: string; outline: string[]; origin?: DraftRevisionOrigin; originNote?: string | null; generateRunId?: string | null; warningSnapshot?: unknown }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  if (input.title.length > 2_000 || input.body.length > 1_000_000 || input.outline.length > 200) throw new DraftServiceError("DRAFT_INVALID");
  return db.$transaction((tx) => writeDraftRevisionInTransaction(tx, { ...input, primaryDraftBranchId: project.primaryDraftBranchId }));
}

export async function saveDraftWorkingState(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedVersion: number; title: string; body: string; outline: string[] }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  if (input.title.length > 2_000 || input.body.length > 1_000_000 || input.outline.length > 200) throw new DraftServiceError("DRAFT_INVALID");
  return db.$transaction(async (tx) => {
    const branch = await tx.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude });
    if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
    if (branch.version !== input.expectedVersion) throw new DraftServiceError("DRAFT_VERSION_CONFLICT");
    const working = { title: input.title.trim(), body: input.body, outline: input.outline };
    const unchanged = branch.workingTitle === working.title && branch.workingBody === working.body && JSON.stringify(strings(branch.workingOutline)) === JSON.stringify(working.outline);
    if (unchanged) {
      const legacyContent = branch.id === project.primaryDraftBranchId ? await tx.motherContent.findUnique({ where: { projectId: input.projectId } }) : null;
      return { branch: branchDTO(branch, project.primaryDraftBranchId), legacyContent, workingChanged: false };
    }
    const changed = await tx.draftBranch.updateMany({ where: { id: branch.id, version: input.expectedVersion }, data: { workingTitle: working.title, workingBody: working.body, workingOutline: json(working.outline), workingOrigin: "HUMAN", workingOriginNote: null, workingGenerateRunId: null, confirmedRevisionId: null, version: { increment: 1 }, updatedById: input.userId } });
    if (changed.count !== 1) throw new DraftServiceError("DRAFT_VERSION_CONFLICT");
    let legacyContent = null;
    if (branch.id === project.primaryDraftBranchId) {
      const mother = await tx.motherContent.findUnique({ where: { projectId: input.projectId } });
      legacyContent = mother
        ? await tx.motherContent.update({ where: { id: mother.id }, data: { title: working.title, body: working.body, outline: json(working.outline), origin: "HUMAN", originNote: null, confirmedVersion: null, confirmedWarnings: { set: null } } })
        : await tx.motherContent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, title: working.title, body: working.body, outline: json(working.outline), origin: "HUMAN", createdById: input.userId } });
    }
    const updated = await tx.draftBranch.findUniqueOrThrow({ where: { id: branch.id }, include: branchInclude });
    return { branch: branchDTO(updated, project.primaryDraftBranchId), legacyContent, workingChanged: true };
  });
}

export async function checkpointDraftBranch(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedVersion: number }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  return db.$transaction(async (tx) => {
    const branch = await tx.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude });
    if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
    return writeRevision(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branch, primaryDraftBranchId: project.primaryDraftBranchId, expectedBranchVersion: input.expectedVersion, data: { title: branch.workingTitle, body: branch.workingBody, outline: strings(branch.workingOutline), origin: branch.workingOrigin, originNote: branch.workingOriginNote, generateRunId: branch.workingGenerateRunId } });
  });
}

export async function renameDraftBranch(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedVersion: number; title: string }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  const title = input.title.trim();
  if (!title || title.length > 120) throw new DraftServiceError("DRAFT_INVALID");
  const changed = await db.draftBranch.updateMany({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null, version: input.expectedVersion }, data: { title, version: { increment: 1 }, updatedById: input.userId } });
  if (changed.count !== 1) {
    const exists = await db.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, select: { id: true } });
    throw new DraftServiceError(exists ? "DRAFT_VERSION_CONFLICT" : "DRAFT_NOT_FOUND");
  }
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "draft_branch.renamed", resourceType: "draft_branch", resourceId: input.branchId, metadata: json({ projectId: input.projectId }) } });
  return getDraftBranch(input);
}

export async function setPrimaryDraftBranch(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedPrimaryDraftBranchId: string }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  return db.$transaction(async (tx) => {
    let branch = await tx.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude });
    if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
    const checkpoint = await writeRevision(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branch, primaryDraftBranchId: null, expectedBranchVersion: branch.version, data: { title: branch.workingTitle, body: branch.workingBody, outline: strings(branch.workingOutline), origin: branch.workingOrigin, originNote: branch.workingOriginNote, generateRunId: branch.workingGenerateRunId } });
    if (!checkpoint.revision) throw new DraftServiceError("DRAFT_EMPTY");
    branch = await tx.draftBranch.findUniqueOrThrow({ where: { id: input.branchId }, include: branchInclude });
    const changed = await tx.contentProject.updateMany({ where: { id: input.projectId, workspaceId: input.workspaceId, primaryDraftBranchId: input.expectedPrimaryDraftBranchId }, data: { primaryDraftBranchId: branch.id } });
    if (changed.count !== 1) throw new DraftServiceError("DRAFT_PRIMARY_CONFLICT");
    const revision = branch.currentRevision;
    if (!revision) throw new DraftServiceError("DRAFT_EMPTY");
    const existing = await tx.motherContent.findUnique({ where: { projectId: input.projectId } });
    const confirmed = branch.confirmedRevisionId === revision.id;
    const legacyContent = existing
      ? await tx.motherContent.update({ where: { id: existing.id }, data: { title: revision.title, body: revision.body, outline: revision.outline as Prisma.InputJsonValue, origin: motherOrigin(revision.origin), originNote: revision.originNote, confirmedVersion: confirmed ? existing.version + 1 : null, confirmedWarnings: { set: null }, version: { increment: 1 } } })
      : await tx.motherContent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, title: revision.title, body: revision.body, outline: revision.outline as Prisma.InputJsonValue, origin: motherOrigin(revision.origin), originNote: revision.originNote, confirmedVersion: confirmed ? 1 : null, createdById: input.userId } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "draft_branch.primary_set", resourceType: "draft_branch", resourceId: branch.id, metadata: json({ projectId: input.projectId, previousDraftBranchId: input.expectedPrimaryDraftBranchId, legacyMotherVersion: legacyContent.version }) } });
    return { branch: branchDTO(branch, branch.id), legacyContent };
  });
}

export async function softDeleteDraftBranch(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedVersion: number }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  if (project.primaryDraftBranchId === input.branchId) throw new DraftServiceError("DRAFT_PRIMARY_DELETE_FORBIDDEN");
  const changed = await db.draftBranch.updateMany({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null, version: input.expectedVersion }, data: { deletedAt: new Date(), deletedById: input.userId, version: { increment: 1 }, updatedById: input.userId } });
  if (changed.count !== 1) {
    const exists = await db.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, select: { id: true } });
    throw new DraftServiceError(exists ? "DRAFT_VERSION_CONFLICT" : "DRAFT_NOT_FOUND");
  }
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "draft_branch.deleted", resourceType: "draft_branch", resourceId: input.branchId, metadata: json({ projectId: input.projectId }) } });
  return { deleted: true };
}

export async function confirmDraftRevision(input: { workspaceId: string; userId: string; projectId: string; branchId: string; expectedVersion: number; warningKeys: string[]; currentWarningKeys: string[] }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  const accepted = new Set(input.warningKeys);
  if (input.currentWarningKeys.some((key) => !accepted.has(key))) throw new DraftServiceError("DRAFT_INVALID");
  return db.$transaction(async (tx) => {
    const branch = await tx.draftBranch.findFirst({ where: { id: input.branchId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude });
    if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
    const checkpoint = await writeRevision(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branch, primaryDraftBranchId: project.primaryDraftBranchId, expectedBranchVersion: input.expectedVersion, data: { title: branch.workingTitle, body: branch.workingBody, outline: strings(branch.workingOutline), origin: branch.workingOrigin, originNote: branch.workingOriginNote, generateRunId: branch.workingGenerateRunId } });
    if (!checkpoint.revision) throw new DraftServiceError("DRAFT_EMPTY");
    const changed = await tx.draftBranch.updateMany({ where: { id: branch.id, version: checkpoint.branch.version }, data: { confirmedRevisionId: checkpoint.revision.id, version: { increment: 1 }, updatedById: input.userId } });
    if (changed.count !== 1) throw new DraftServiceError("DRAFT_VERSION_CONFLICT");
    let legacyContent = null;
    if (branch.id === project.primaryDraftBranchId) {
      const mother = await tx.motherContent.findUnique({ where: { projectId: input.projectId } });
      if (!mother) throw new DraftServiceError("DRAFT_EMPTY");
      legacyContent = await tx.motherContent.update({ where: { id: mother.id }, data: { confirmedVersion: mother.version, confirmedWarnings: input.warningKeys } });
    }
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "draft_revision.confirmed", resourceType: "draft_revision", resourceId: checkpoint.revision.id, metadata: json({ projectId: input.projectId, draftBranchId: branch.id, revision: checkpoint.revision.revision, legacyMotherVersion: legacyContent?.version ?? null }) } });
    const updated = await tx.draftBranch.findUniqueOrThrow({ where: { id: branch.id }, include: branchInclude });
    return { branch: branchDTO(updated, project.primaryDraftBranchId), legacyContent };
  });
}

export async function savePrimaryDraftFromLegacy(input: { workspaceId: string; userId: string; projectId: string; title: string; body: string; outline: string[]; expectedMotherVersion: number; origin?: MotherContentOrigin; originNote?: string | null; generateRunId?: string | null; auditAction?: "mother_content.updated" | "mother_content.imported_from_gpt_web"; preservePreviousVersion?: boolean }) {
  const project = await ensurePrimaryBranch(input);
  requireEdit(project.role);
  if (!project.primaryDraftBranchId) throw new DraftServiceError("DRAFT_NOT_FOUND");
  return db.$transaction(async (tx) => {
    const [branch, mother] = await Promise.all([
      tx.draftBranch.findFirst({ where: { id: project.primaryDraftBranchId!, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null }, include: branchInclude }),
      tx.motherContent.findUnique({ where: { projectId: input.projectId } }),
    ]);
    if (!branch) throw new DraftServiceError("DRAFT_NOT_FOUND");
    if ((mother?.version ?? 0) !== input.expectedMotherVersion) throw new DraftServiceError("DRAFT_VERSION_CONFLICT");
    const written = await writeRevision(tx, { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branch, primaryDraftBranchId: branch.id, expectedBranchVersion: branch.version, data: { title: input.title, body: input.body, outline: input.outline, origin: draftOrigin(input.origin ?? "HUMAN"), originNote: input.originNote, generateRunId: input.generateRunId } });
    if (!written.legacyContent) throw new DraftServiceError("DRAFT_EMPTY");
    if (mother && input.preservePreviousVersion && written.checkpointCreated) {
      const preservedCount = await tx.auditLog.count({ where: { workspaceId: input.workspaceId, resourceId: mother.id, action: "mother_content.version_preserved" } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "mother_content.version_preserved", resourceType: "mother_content", resourceId: mother.id, metadata: json({ projectId: input.projectId, snapshot: { title: mother.title, body: mother.body, outline: strings(mother.outline), version: preservedCount + 1, revision: mother.version, origin: mother.origin, originNote: mother.originNote, createdAt: mother.updatedAt.toISOString() } }) } });
    }
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: input.auditAction ?? "mother_content.updated", resourceType: "mother_content", resourceId: written.legacyContent.id, metadata: json({ projectId: input.projectId, resourceId: written.legacyContent.id, version: written.legacyContent.version, origin: written.legacyContent.origin, draftBranchId: branch.id, draftRevisionId: written.revision.id, changedFields: ["title", "body", "outline", "origin", "originNote"] }) } });
    return written;
  });
}
