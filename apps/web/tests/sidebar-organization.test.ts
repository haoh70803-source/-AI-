import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { createBasicProject } from "../server/sidebar/basic-project";
import {
  SidebarServiceError,
  createProjectFolder,
  deleteProjectFolder,
  getProjectListView,
  recordProjectOpened,
  updateProjectFolder,
  updateProjectPreference,
} from "../server/sidebar/service";

describe("sidebar project organization", () => {
  const suffix = randomUUID();
  const ownerId = `sidebar-owner-${suffix}`;
  const viewerId = `sidebar-viewer-${suffix}`;
  const otherOwnerId = `sidebar-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectA = "";
  let projectB = "";
  let projectC = "";
  let foreignProjectId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Sidebar Owner", email: `${ownerId}@example.test` },
      { id: viewerId, name: "Sidebar Viewer", email: `${viewerId}@example.test` },
      { id: otherOwnerId, name: "Sidebar Other", email: `${otherOwnerId}@example.test` },
    ] });
    const workspace = await db.workspace.create({ data: { name: "Sidebar Workspace", slug: `sidebar-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } });
    const otherWorkspace = await db.workspace.create({ data: { name: "Sidebar Other Workspace", slug: `sidebar-other-${suffix}`, members: { create: { userId: otherOwnerId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
    const [a, b, c, foreign] = await Promise.all([
      db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Alpha Project", updatedAt: new Date("2026-01-01T00:00:00.000Z") } }),
      db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Beta Project", updatedAt: new Date("2026-02-01T00:00:00.000Z") } }),
      db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Gamma Project", updatedAt: new Date("2026-03-01T00:00:00.000Z") } }),
      db.contentProject.create({ data: { workspaceId: otherWorkspace.id, createdById: otherOwnerId, title: "Foreign Project" } }),
    ]);
    projectA = a.id;
    projectB = b.id;
    projectC = c.id;
    foreignProjectId = foreign.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (otherWorkspaceId) await db.workspace.delete({ where: { id: otherWorkspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId, otherOwnerId] } } });
    await db.$disconnect();
  });

  it("keeps pin and recent preferences isolated per user and allows Viewer preferences", async () => {
    const initial = await getProjectListView({ workspaceId, userId: ownerId });
    expect(initial.canCreateProject).toBe(true);
    expect(initial.recent[0]).toMatchObject({ projectId: projectC, recentSource: "UPDATED_FALLBACK" });

    const projectBefore = await db.contentProject.findUniqueOrThrow({ where: { id: projectA }, select: { updatedAt: true } });
    const ownerPinned = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectA, command: { action: "PIN" } });
    expect(ownerPinned.pinned.map(({ projectId }) => projectId)).toEqual([projectA]);
    const firstPinnedAt = (await db.userProjectPreference.findUniqueOrThrow({ where: { workspaceId_userId_projectId: { workspaceId, userId: ownerId, projectId: projectA } } })).pinnedAt;
    await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectA, command: { action: "PIN" } });
    const secondPinnedAt = (await db.userProjectPreference.findUniqueOrThrow({ where: { workspaceId_userId_projectId: { workspaceId, userId: ownerId, projectId: projectA } } })).pinnedAt;
    expect(secondPinnedAt).toEqual(firstPinnedAt);

    const viewerBefore = await getProjectListView({ workspaceId, userId: viewerId });
    expect(viewerBefore.canCreateProject).toBe(false);
    expect(viewerBefore.pinned).toHaveLength(0);
    const viewerPinned = await updateProjectPreference({ workspaceId, userId: viewerId, projectId: projectB, command: { action: "PIN" } });
    expect(viewerPinned.pinned.map(({ projectId }) => projectId)).toEqual([projectB]);
    expect((await getProjectListView({ workspaceId, userId: ownerId })).pinned.map(({ projectId }) => projectId)).toEqual([projectA]);

    const opened = await recordProjectOpened({ workspaceId, userId: ownerId, projectId: projectA });
    expect(opened.updated).toBe(true);
    const throttled = await recordProjectOpened({ workspaceId, userId: ownerId, projectId: projectA });
    expect(throttled).toMatchObject({ updated: false, lastOpenedAt: opened.lastOpenedAt });
    expect((await getProjectListView({ workspaceId, userId: ownerId })).recent[0]).toMatchObject({ projectId: projectA, recentSource: "OPENED" });
    expect((await getProjectListView({ workspaceId, userId: viewerId })).recent.find(({ projectId }) => projectId === projectA)?.recentSource).toBe("UPDATED_FALLBACK");
    expect((await db.contentProject.findUniqueOrThrow({ where: { id: projectA }, select: { updatedAt: true } })).updatedAt).toEqual(projectBefore.updatedAt);

    const preferenceCount = await db.userProjectPreference.count({ where: { workspaceId, userId: ownerId, projectId: projectA } });
    expect(preferenceCount).toBe(1);
    const unpinned = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectA, command: { action: "UNPIN" } });
    expect(unpinned.pinned).toHaveLength(0);
    const ownerPreference = await db.userProjectPreference.findUniqueOrThrow({ where: { workspaceId_userId_projectId: { workspaceId, userId: ownerId, projectId: projectA } } });
    expect(ownerPreference.pinnedAt).toBeNull();
  });

  it("creates personal folders, moves and reorders projects, and ungroups on delete", async () => {
    const firstView = await createProjectFolder({ workspaceId, userId: ownerId, name: "Client Folder" });
    const folderOne = firstView.folders.find(({ label }) => label === "Client Folder")!;
    const secondView = await createProjectFolder({ workspaceId, userId: ownerId, name: "内部项目" });
    const folderTwo = secondView.folders.find(({ label }) => label === "内部项目")!;
    await expect(createProjectFolder({ workspaceId, userId: ownerId, name: "Client Folder" })).rejects.toMatchObject({ code: "SIDEBAR_FOLDER_CONFLICT" });
    await expect(createProjectFolder({ workspaceId, userId: ownerId, name: "client folder" })).rejects.toMatchObject({ code: "SIDEBAR_FOLDER_CONFLICT" });

    await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectA, command: { action: "MOVE", folderId: folderOne.folderId } });
    let view = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectB, command: { action: "MOVE", folderId: folderOne.folderId } });
    expect(view.folders.find(({ folderId }) => folderId === folderOne.folderId)?.projects.map(({ projectId }) => projectId)).toEqual([projectA, projectB]);

    view = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectB, command: { action: "MOVE_TOP" } });
    expect(view.folders.find(({ folderId }) => folderId === folderOne.folderId)?.projects.map(({ projectId }) => projectId)).toEqual([projectB, projectA]);
    view = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectB, command: { action: "MOVE_DOWN" } });
    expect(view.folders.find(({ folderId }) => folderId === folderOne.folderId)?.projects.map(({ projectId }) => projectId)).toEqual([projectA, projectB]);
    view = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectB, command: { action: "MOVE_UP" } });
    expect(view.folders.find(({ folderId }) => folderId === folderOne.folderId)?.projects.map(({ projectId }) => projectId)).toEqual([projectB, projectA]);

    view = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectA, command: { action: "MOVE", folderId: folderTwo.folderId } });
    expect(view.folders.find(({ folderId }) => folderId === folderOne.folderId)?.projects.map(({ projectId }) => projectId)).toEqual([projectB]);
    expect(view.folders.find(({ folderId }) => folderId === folderTwo.folderId)?.projects.map(({ projectId }) => projectId)).toEqual([projectA]);
    view = await updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectA, command: { action: "MOVE", folderId: null } });
    expect(view.ungrouped.map(({ projectId }) => projectId)).toContain(projectA);

    view = await updateProjectFolder({ workspaceId, userId: ownerId, folderId: folderTwo.folderId, command: { action: "MOVE_TOP" } });
    expect(view.folders[0]?.folderId).toBe(folderTwo.folderId);
    view = await updateProjectFolder({ workspaceId, userId: ownerId, folderId: folderTwo.folderId, command: { action: "MOVE_DOWN" } });
    expect(view.folders.at(-1)?.folderId).toBe(folderTwo.folderId);
    view = await updateProjectFolder({ workspaceId, userId: ownerId, folderId: folderTwo.folderId, command: { action: "MOVE_UP" } });
    expect(view.folders[0]?.folderId).toBe(folderTwo.folderId);
    view = await updateProjectFolder({ workspaceId, userId: ownerId, folderId: folderTwo.folderId, command: { action: "RENAME", name: "归档前分组" } });
    expect(view.folders.find(({ folderId }) => folderId === folderTwo.folderId)?.label).toBe("归档前分组");

    view = await deleteProjectFolder({ workspaceId, userId: ownerId, folderId: folderOne.folderId });
    expect(view.folders.some(({ folderId }) => folderId === folderOne.folderId)).toBe(false);
    expect(view.ungrouped.map(({ projectId }) => projectId)).toEqual(expect.arrayContaining([projectA, projectB, projectC]));
    expect(await db.contentProject.findUnique({ where: { id: projectB } })).not.toBeNull();
    const ungroupedPreferences = await db.userProjectPreference.findMany({ where: { workspaceId, userId: ownerId, folderId: null, project: { status: { not: "ARCHIVED" } } }, orderBy: { sortOrder: "asc" } });
    expect(ungroupedPreferences.map(({ sortOrder }) => sortOrder)).toEqual(ungroupedPreferences.map((_, index) => index));
  });

  it("rejects cross-user folders and cross-workspace projects without leaking scope", async () => {
    const viewerFolder = (await createProjectFolder({ workspaceId, userId: viewerId, name: "Viewer Folder" })).folders[0]!;
    await expect(updateProjectPreference({ workspaceId, userId: ownerId, projectId: projectC, command: { action: "MOVE", folderId: viewerFolder.folderId } })).rejects.toBeInstanceOf(SidebarServiceError);
    await expect(updateProjectPreference({ workspaceId, userId: ownerId, projectId: foreignProjectId, command: { action: "PIN" } })).rejects.toMatchObject({ code: "SIDEBAR_NOT_FOUND" });
    await expect(updateProjectFolder({ workspaceId, userId: ownerId, folderId: viewerFolder.folderId, command: { action: "MOVE_TOP" } })).rejects.toMatchObject({ code: "SIDEBAR_NOT_FOUND" });
  });

  it("creates a lightweight project and its personal folder preference in one transaction", async () => {
    const folder = (await createProjectFolder({ workspaceId, userId: ownerId, name: "Basic Project Folder" })).folders.find((item) => item.label === "Basic Project Folder")!;
    const created = await createBasicProject({ workspaceId, userId: ownerId, title: "Sidebar Basic", description: "Only a description", folderId: folder.folderId });
    expect(created).toMatchObject({ title: "Sidebar Basic", description: "Only a description", goal: null, audience: null });
    expect(await db.userProjectPreference.findFirst({ where: { workspaceId, userId: ownerId, projectId: created.id } })).toMatchObject({ folderId: folder.folderId });
    expect(await db.draftBranch.findFirst({ where: { id: created.primaryDraftBranchId, projectId: created.id } })).not.toBeNull();
    await expect(createBasicProject({ workspaceId, userId: viewerId, title: "Viewer denied", folderId: folder.folderId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createBasicProject({ workspaceId, userId: ownerId, title: "Foreign folder", folderId: "not-owned" })).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
    expect(await db.contentProject.count({ where: { workspaceId, title: "Foreign folder" } })).toBe(0);
  });
});
