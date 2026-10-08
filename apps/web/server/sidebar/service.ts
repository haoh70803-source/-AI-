import "server-only";

import { db, type Prisma } from "@content-center/db";
import { projectListView, type ProjectListView } from "./view-model";

type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
type Scope = { workspaceId: string; userId: string };
type ProjectScope = Scope & { projectId: string };
type FolderScope = Scope & { folderId: string };
type ReorderAction = "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";

export type FolderCommand =
  | { action: "RENAME"; name: string }
  | { action: ReorderAction };

export type ProjectPreferenceCommand =
  | { action: "PIN" }
  | { action: "UNPIN" }
  | { action: "MOVE"; folderId: string | null }
  | { action: ReorderAction };

export type SidebarServiceErrorCode =
  | "SIDEBAR_NOT_FOUND"
  | "SIDEBAR_INVALID_INPUT"
  | "SIDEBAR_FOLDER_CONFLICT";

export class SidebarServiceError extends Error {
  constructor(readonly code: SidebarServiceErrorCode, message: string) {
    super(message);
    this.name = "SidebarServiceError";
  }
}

async function membership(input: Scope) {
  const row = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    select: { role: true },
  });
  if (!row) throw new SidebarServiceError("SIDEBAR_NOT_FOUND", "当前工作区不存在。");
  return row.role as WorkspaceRole;
}

async function transactionMembership(tx: Prisma.TransactionClient, input: Scope) {
  const row = await tx.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    select: { role: true },
  });
  if (!row) throw new SidebarServiceError("SIDEBAR_NOT_FOUND", "当前工作区不存在。");
  return row.role as WorkspaceRole;
}

async function scopedProject(tx: Prisma.TransactionClient, input: ProjectScope) {
  const project = await tx.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, status: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (!project) throw new SidebarServiceError("SIDEBAR_NOT_FOUND", "项目不存在。");
  return project;
}

async function scopedFolder(tx: Prisma.TransactionClient, input: FolderScope) {
  const folder = await tx.projectFolder.findFirst({
    where: { id: input.folderId, workspaceId: input.workspaceId, userId: input.userId },
    select: { id: true, sortOrder: true },
  });
  if (!folder) throw new SidebarServiceError("SIDEBAR_NOT_FOUND", "项目文件夹不存在。");
  return folder;
}

function normalizedFolderName(value: string) {
  const name = value.trim();
  if (!name || name.length > 80) throw new SidebarServiceError("SIDEBAR_INVALID_INPUT", "文件夹名称需要为 1 到 80 个字。");
  return name;
}

async function assertFolderNameAvailable(tx: Prisma.TransactionClient, input: Scope & { name: string; excludeFolderId?: string }) {
  const duplicate = await tx.projectFolder.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      name: { equals: input.name, mode: "insensitive" },
      ...(input.excludeFolderId ? { id: { not: input.excludeFolderId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new SidebarServiceError("SIDEBAR_FOLDER_CONFLICT", "已经有同名项目文件夹。");
}

function reorder(ids: string[], id: string, action: ReorderAction) {
  const currentIndex = ids.indexOf(id);
  if (currentIndex < 0) return ids;
  const nextIndex = action === "MOVE_TOP" ? 0
    : action === "MOVE_UP" ? Math.max(0, currentIndex - 1)
      : Math.min(ids.length - 1, currentIndex + 1);
  if (nextIndex === currentIndex) return ids;
  const next = [...ids];
  next.splice(currentIndex, 1);
  next.splice(nextIndex, 0, id);
  return next;
}

async function canonicalProjectIds(tx: Prisma.TransactionClient, input: Scope & { folderId: string | null }) {
  const [projects, preferences] = await Promise.all([
    tx.contentProject.findMany({
      where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    tx.userProjectPreference.findMany({
      where: { workspaceId: input.workspaceId, userId: input.userId },
      select: { projectId: true, folderId: true, sortOrder: true },
    }),
  ]);
  const preferenceByProject = new Map(preferences.map((preference) => [preference.projectId, preference]));
  return projects
    .filter((project) => (preferenceByProject.get(project.id)?.folderId ?? null) === input.folderId)
    .sort((left, right) => {
      const leftPreference = preferenceByProject.get(left.id);
      const rightPreference = preferenceByProject.get(right.id);
      const leftOrder = leftPreference?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = rightPreference?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder
        || right.updatedAt.getTime() - left.updatedAt.getTime()
        || left.title.localeCompare(right.title, "zh-CN")
        || left.id.localeCompare(right.id);
    })
    .map(({ id }) => id);
}

async function writeDenseProjectOrder(tx: Prisma.TransactionClient, input: Scope & { folderId: string | null; projectIds: string[] }) {
  for (const [sortOrder, projectId] of input.projectIds.entries()) {
    await tx.userProjectPreference.upsert({
      where: { workspaceId_userId_projectId: { workspaceId: input.workspaceId, userId: input.userId, projectId } },
      create: { workspaceId: input.workspaceId, userId: input.userId, projectId, folderId: input.folderId, sortOrder },
      update: { folderId: input.folderId, sortOrder },
    });
  }
}

async function denseFolderOrder(tx: Prisma.TransactionClient, input: Scope, folderIds: string[]) {
  for (const [sortOrder, folderId] of folderIds.entries()) {
    await tx.projectFolder.updateMany({
      where: { id: folderId, workspaceId: input.workspaceId, userId: input.userId },
      data: { sortOrder },
    });
  }
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function getProjectListView(input: Scope): Promise<ProjectListView> {
  const role = await membership(input);
  const [projects, folders, preferences] = await Promise.all([
    db.contentProject.findMany({
      where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    db.projectFolder.findMany({
      where: { workspaceId: input.workspaceId, userId: input.userId },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    }),
    db.userProjectPreference.findMany({
      where: { workspaceId: input.workspaceId, userId: input.userId, project: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" } } },
      select: { projectId: true, folderId: true, pinnedAt: true, sortOrder: true, lastOpenedAt: true },
    }),
  ]);
  return projectListView({ workspaceId: input.workspaceId, role, projects, folders, preferences });
}

export async function createProjectFolder(input: Scope & { name: string }) {
  const name = normalizedFolderName(input.name);
  try {
    await db.$transaction(async (tx) => {
      await transactionMembership(tx, input);
      await assertFolderNameAvailable(tx, { ...input, name });
      const maximum = await tx.projectFolder.aggregate({
        where: { workspaceId: input.workspaceId, userId: input.userId },
        _max: { sortOrder: true },
      });
      await tx.projectFolder.create({
        data: { workspaceId: input.workspaceId, userId: input.userId, name, sortOrder: (maximum._max.sortOrder ?? -1) + 1 },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof SidebarServiceError) throw error;
    if (isUniqueConstraint(error)) throw new SidebarServiceError("SIDEBAR_FOLDER_CONFLICT", "已经有同名项目文件夹。");
    throw error;
  }
  return getProjectListView(input);
}

export async function updateProjectFolder(input: FolderScope & { command: FolderCommand }) {
  try {
    await db.$transaction(async (tx) => {
      await transactionMembership(tx, input);
      const folder = await scopedFolder(tx, input);
      if (input.command.action === "RENAME") {
        const name = normalizedFolderName(input.command.name);
        await assertFolderNameAvailable(tx, { ...input, name, excludeFolderId: folder.id });
        await tx.projectFolder.update({ where: { id: folder.id }, data: { name } });
        return;
      }
      const folders = await tx.projectFolder.findMany({
        where: { workspaceId: input.workspaceId, userId: input.userId },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      });
      await denseFolderOrder(tx, input, reorder(folders.map(({ id }) => id), folder.id, input.command.action));
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof SidebarServiceError) throw error;
    if (isUniqueConstraint(error)) throw new SidebarServiceError("SIDEBAR_FOLDER_CONFLICT", "已经有同名项目文件夹。");
    throw error;
  }
  return getProjectListView(input);
}

export async function deleteProjectFolder(input: FolderScope) {
  await db.$transaction(async (tx) => {
    await transactionMembership(tx, input);
    const folder = await scopedFolder(tx, input);
    const [ungroupedIds, folderPreferences] = await Promise.all([
      canonicalProjectIds(tx, { ...input, folderId: null }),
      tx.userProjectPreference.findMany({
        where: { workspaceId: input.workspaceId, userId: input.userId, folderId: folder.id },
        select: { projectId: true },
        orderBy: [{ sortOrder: "asc" }, { projectId: "asc" }],
      }),
    ]);
    await tx.userProjectPreference.updateMany({
      where: { workspaceId: input.workspaceId, userId: input.userId, folderId: folder.id },
      data: { folderId: null, sortOrder: 0 },
    });
    const movedIds = folderPreferences.map(({ projectId }) => projectId);
    await writeDenseProjectOrder(tx, {
      ...input,
      folderId: null,
      projectIds: [...ungroupedIds.filter((projectId) => !movedIds.includes(projectId)), ...movedIds],
    });
    await tx.projectFolder.delete({ where: { id: folder.id } });
    const remainingFolders = await tx.projectFolder.findMany({
      where: { workspaceId: input.workspaceId, userId: input.userId },
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    await denseFolderOrder(tx, input, remainingFolders.map(({ id }) => id));
  }, { isolationLevel: "Serializable" });
  return getProjectListView(input);
}

export async function updateProjectPreference(input: ProjectScope & { command: ProjectPreferenceCommand }) {
  await db.$transaction(async (tx) => {
    await transactionMembership(tx, input);
    await scopedProject(tx, input);
    const preference = await tx.userProjectPreference.findUnique({
      where: { workspaceId_userId_projectId: { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId } },
      select: { id: true, folderId: true, pinnedAt: true, sortOrder: true },
    });
    const currentFolderId = preference?.folderId ?? null;
    if (input.command.action === "PIN") {
      if (preference?.pinnedAt) return;
      const currentIds = await canonicalProjectIds(tx, { ...input, folderId: currentFolderId });
      await tx.userProjectPreference.upsert({
        where: { workspaceId_userId_projectId: { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId } },
        create: { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, folderId: currentFolderId, sortOrder: Math.max(0, currentIds.indexOf(input.projectId)), pinnedAt: new Date() },
        update: { pinnedAt: new Date() },
      });
      return;
    }
    if (input.command.action === "UNPIN") {
      if (!preference?.pinnedAt) return;
      await tx.userProjectPreference.update({ where: { id: preference.id }, data: { pinnedAt: null } });
      return;
    }
    if (input.command.action === "MOVE") {
      const targetFolderId = input.command.folderId;
      if (targetFolderId) await scopedFolder(tx, { ...input, folderId: targetFolderId });
      if (targetFolderId === currentFolderId) return;
      const [sourceIds, targetIds] = await Promise.all([
        canonicalProjectIds(tx, { ...input, folderId: currentFolderId }),
        canonicalProjectIds(tx, { ...input, folderId: targetFolderId }),
      ]);
      await writeDenseProjectOrder(tx, {
        ...input,
        folderId: currentFolderId,
        projectIds: sourceIds.filter((projectId) => projectId !== input.projectId),
      });
      await writeDenseProjectOrder(tx, {
        ...input,
        folderId: targetFolderId,
        projectIds: [...targetIds.filter((projectId) => projectId !== input.projectId), input.projectId],
      });
      return;
    }
    const projectIds = await canonicalProjectIds(tx, { ...input, folderId: currentFolderId });
    await writeDenseProjectOrder(tx, {
      ...input,
      folderId: currentFolderId,
      projectIds: reorder(projectIds, input.projectId, input.command.action),
    });
  }, { isolationLevel: "Serializable" });
  return getProjectListView(input);
}

export async function recordProjectOpened(input: ProjectScope) {
  const result = await db.$transaction(async (tx) => {
    await transactionMembership(tx, input);
    await scopedProject(tx, input);
    const preference = await tx.userProjectPreference.findUnique({
      where: { workspaceId_userId_projectId: { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId } },
      select: { id: true, lastOpenedAt: true },
    });
    const threshold = Date.now() - 5 * 60 * 1_000;
    if (preference?.lastOpenedAt && preference.lastOpenedAt.getTime() >= threshold) {
      return { projectId: input.projectId, lastOpenedAt: preference.lastOpenedAt, updated: false };
    }
    const now = new Date();
    if (preference) {
      await tx.userProjectPreference.update({ where: { id: preference.id }, data: { lastOpenedAt: now } });
    } else {
      const ungroupedIds = await canonicalProjectIds(tx, { ...input, folderId: null });
      await tx.userProjectPreference.create({
        data: { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, sortOrder: Math.max(0, ungroupedIds.indexOf(input.projectId)), lastOpenedAt: now },
      });
    }
    return { projectId: input.projectId, lastOpenedAt: now, updated: true };
  }, { isolationLevel: "Serializable" });
  return { ...result, lastOpenedAt: result.lastOpenedAt.toISOString() };
}
