import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { saveBrief, VersionConflictError } from "../server/brief-service";
import { createEvidence } from "../server/evidence-service";
import { saveMotherContent } from "../server/mother-content-service";
import { createProject, deleteProject, listProjects, restoreProject, transitionProjectStatus } from "../server/project-service";
import { hasSourceDeletionReferences } from "@content-center/db";

describe("content project service flow", () => {
  const runId = randomUUID();
  const userId = `project-service-${runId}`;
  let workspaceId = "";
  let sourceId = "";

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "Project Service User", email: `${userId}@example.test` } });
    const workspace = await db.workspace.create({ data: { name: "Project Service", slug: `project-service-${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Service source", rawText: "Service source body" } })).id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("archives idempotently, restores the prior state and preserves source assets on project deletion", async () => {
    const project = await createProject({ workspaceId, userId, title: "Lifecycle unit project", sourceItemId: sourceId });
    const scope = { workspaceId, userId, projectId: project.id };
    await db.contentProject.update({ where: { id: project.id }, data: { status: "WRITING" } });
    expect(await hasSourceDeletionReferences(db, sourceId)).toBe(true);
    await transitionProjectStatus({ ...scope, to: "ARCHIVED" });
    await transitionProjectStatus({ ...scope, to: "ARCHIVED" });
    expect(await db.auditLog.count({ where: { workspaceId, resourceId: project.id, action: "project.archived" } })).toBe(1);
    expect((await listProjects(workspaceId, { search: "Lifecycle unit" })).items).toHaveLength(0);
    expect((await listProjects(workspaceId, { search: "Lifecycle unit", status: "ARCHIVED" })).items).toHaveLength(1);
    await expect(restoreProject({ ...scope, workspaceId: "foreign-workspace" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect((await restoreProject(scope)).status).toBe("WRITING");
    expect((await restoreProject(scope)).status).toBe("WRITING");
    await deleteProject(scope);
    expect(await db.draftBranch.count({ where: { projectId: project.id } })).toBe(0);
    expect(await db.sourceItem.findUnique({ where: { id: sourceId } })).not.toBeNull();
  });

  it("sorts and filters before pagination and clamps a deleted last page", async () => {
    const z = await createProject({ workspaceId, userId, title: "Sort Z" });
    const a = await createProject({ workspaceId, userId, title: "Sort A" });
    const m = await createProject({ workspaceId, userId, title: "Sort M" });
    await db.contentProject.update({ where: { id: a.id }, data: { status: "WRITING" } });
    expect((await listProjects(workspaceId, { search: "Sort ", sort: "name", pageSize: "1" })).items[0]?.id).toBe(a.id);
    const drafts = await listProjects(workspaceId, { search: "Sort ", status: "UNSTARTED", sort: "name", pageSize: "1", page: "99" });
    expect(drafts.total).toBe(2);
    expect(drafts.page).toBe(2);
    expect(drafts.items[0]?.id).toBe(z.id);
    expect((await listProjects(workspaceId, { search: "Sort ", status: "ACTIVE" })).items.map((item) => item.id)).toEqual([a.id]);
    await deleteProject({ workspaceId, userId, projectId: z.id });
    const last = await listProjects(workspaceId, { search: "Sort ", status: "UNSTARTED", page: "2", pageSize: "1" });
    expect(last.page).toBe(1);
    expect(last.items[0]?.id).toBe(m.id);
  });

  it("creates and lists within a personal folder without leaking another user's organization", async () => {
    const folder = await db.projectFolder.create({ data: { workspaceId, userId, name: "Folder scope" } });
    const inside = await createProject({ workspaceId, userId, title: "Folder scope inside", folderId: folder.id });
    const outside = await createProject({ workspaceId, userId, title: "Folder scope outside" });
    expect((await listProjects(workspaceId, { search: "Folder scope" }, { userId, folderId: folder.id })).items.map((item) => item.id)).toEqual([inside.id]);
    expect((await listProjects(workspaceId, { search: "Folder scope" }, { userId, folderId: null })).items.map((item) => item.id)).toEqual([outside.id]);
    await expect(createProject({ workspaceId, userId: "another-user", title: "Denied folder creation", folderId: folder.id })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(await db.contentProject.count({ where: { workspaceId, title: "Denied folder creation" } })).toBe(0);
    await expect(listProjects(workspaceId, {}, { userId, folderId: "foreign-folder" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("links up to eight workspace sources and makes a repeated client request idempotent", async () => {
    const secondSourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Second source", rawText: "Second source body" } })).id;
    const request = { workspaceId, userId, title: "Idempotent home project", description: "明确的创作需求", sourceItemIds: [sourceId, secondSourceId], clientRequestId: randomUUID() };
    const [created, repeated] = await Promise.all([createProject(request), createProject(request)]);
    expect(repeated.id).toBe(created.id);
    expect(await db.contentProject.count({ where: { workspaceId, clientRequestId: request.clientRequestId } })).toBe(1);
    expect((await db.projectSource.findMany({ where: { projectId: created.id }, orderBy: { sortOrder: "asc" }, select: { sourceItemId: true } })).map(({ sourceItemId }) => sourceItemId)).toEqual(request.sourceItemIds);
    await expect(createProject({ ...request, title: "Changed request" })).rejects.toMatchObject({ code: "PROJECT_CONFLICT" });
    await expect(createProject({ ...request, clientRequestId: randomUUID(), sourceItemIds: Array.from({ length: 9 }, (_, index) => `source-${index}`) })).rejects.toMatchObject({ code: "SOURCE_LIMIT_EXCEEDED" });

    const outsider = await db.user.create({ data: { id: `foreign-source-${runId}`, name: "Foreign Source Owner", email: `foreign-source-${runId}@example.test` } });
    const otherWorkspace = await db.workspace.create({ data: { name: "Other source scope", slug: `other-source-${runId}`, members: { create: { userId: outsider.id, role: "OWNER" } } } });
    try {
      const foreignSource = await db.sourceItem.create({ data: { workspaceId: otherWorkspace.id, createdById: outsider.id, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Foreign", rawText: "Private" } });
      await expect(createProject({ ...request, clientRequestId: randomUUID(), sourceItemIds: [sourceId, foreignSource.id] })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    } finally {
      await db.workspace.delete({ where: { id: otherWorkspace.id } });
      await db.user.delete({ where: { id: outsider.id } });
    }
  });

  it("creates a source-linked project, evidence, brief and mother content through review", async () => {
    const project = await createProject({ workspaceId, userId, title: "Stage 4 service flow", sourceItemId: sourceId });
    expect(project.status).toBe("DRAFT");
    await expect(db.projectSource.count({ where: { projectId: project.id, sourceItemId: sourceId } })).resolves.toBe(1);
    await createEvidence({ workspaceId, userId, projectId: project.id, data: { type: "FACT", sourceItemId: sourceId, excerpt: "Evidence excerpt", claim: "Evidence claim" } });
    await transitionProjectStatus({ workspaceId, userId, projectId: project.id, to: "RESEARCHING" });
    const brief = await saveBrief({ workspaceId, userId, projectId: project.id, data: { topic: "A validated topic", angle: "Practical", audience: "Creators", coreMessage: "Use evidence before drafting", keyPoints: ["Point one"], structure: ["Opening", "Body"], tone: "Clear", risks: [], expectedVersion: 0 } });
    expect(brief.version).toBe(1);
    await expect(saveBrief({ workspaceId, userId, projectId: project.id, data: { topic: "Stale", angle: "", audience: "", coreMessage: "Stale", keyPoints: [], structure: [], tone: "", risks: [], expectedVersion: 0 } })).rejects.toBeInstanceOf(VersionConflictError);
    await transitionProjectStatus({ workspaceId, userId, projectId: project.id, to: "BRIEF_READY" });
    await transitionProjectStatus({ workspaceId, userId, projectId: project.id, to: "WRITING" });
    const mother = await saveMotherContent({ workspaceId, userId, projectId: project.id, data: { title: "Mother title", body: "A real persisted mother content body.", outline: ["Opening", "Body"], expectedVersion: 0 } });
    expect(mother.version).toBe(1);
    await expect(saveMotherContent({ workspaceId, userId, projectId: project.id, data: { title: "Stale", body: "stale", outline: [], expectedVersion: 0 } })).rejects.toBeInstanceOf(VersionConflictError);
    await transitionProjectStatus({ workspaceId, userId, projectId: project.id, to: "IN_REVIEW" });
    const stored = await db.contentProject.findUniqueOrThrow({ where: { id: project.id }, include: { evidenceItems: true, creativeBrief: true, motherContent: true } });
    expect(stored).toMatchObject({ status: "IN_REVIEW" });
    expect(stored.evidenceItems).toHaveLength(1);
    expect(stored.creativeBrief?.topic).toBe("A validated topic");
    expect(stored.motherContent?.body).toBe("A real persisted mother content body.");
    await db.platformVariant.create({ data: { workspaceId, projectId: project.id, motherContentId: stored.motherContent!.id, platform: "DOUYIN", title: "待审核版本", body: "待审核正文", hashtags: [], mediaPlan: {}, metadata: {}, status: "IN_REVIEW", sourceMotherVersion: stored.motherContent!.version, createdById: userId } });
    const pendingReview = await listProjects(workspaceId, { review: "pending" });
    expect(pendingReview.items.map((item) => item.id)).toContain(project.id);
    const actions = await db.auditLog.findMany({ where: { workspaceId, metadata: { path: ["projectId"], equals: project.id } }, select: { action: true, metadata: true } });
    expect(actions.map(({ action }) => action)).toEqual(expect.arrayContaining(["project.created", "project.source_added", "evidence.created", "brief.updated", "mother_content.updated", "project.status_changed"]));
    expect(JSON.stringify(actions)).not.toContain("A real persisted mother content body.");
  });
});
