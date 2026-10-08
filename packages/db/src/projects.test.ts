import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, findProjectForUser } from "./index";

describe("content project persistence", () => {
  const runId = randomUUID();
  const userAId = `project-a-${runId}`;
  const userBId = `project-b-${runId}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let projectBId = "";
  let sourceBId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: userAId, name: "Project User A", email: `${userAId}@example.test` },
      { id: userBId, name: "Project User B", email: `${userBId}@example.test` },
    ] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "Project A", slug: `project-a-${runId}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Project B", slug: `project-b-${runId}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id;
    workspaceBId = workspaceB.id;
    const [projectB, sourceB] = await Promise.all([
      db.contentProject.create({ data: { workspaceId: workspaceB.id, createdById: userBId, title: "Workspace B private project" } }),
      db.sourceItem.create({ data: { workspaceId: workspaceB.id, createdById: userBId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", rawText: "private source" } }),
    ]);
    projectBId = projectB.id;
    sourceBId = sourceB.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  it("does not expose another workspace project", async () => {
    await expect(findProjectForUser(db, { userId: userAId, workspaceId: workspaceAId, projectId: projectBId })).resolves.toBeNull();
  });

  it("enforces one source relation per project", async () => {
    await db.projectSource.create({ data: { projectId: projectBId, sourceItemId: sourceBId } });
    await expect(db.projectSource.create({ data: { projectId: projectBId, sourceItemId: sourceBId } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("loads only project-scoped material metadata, tags, and stored image assets", async () => {
    const source = await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "IMAGE", sourcePlatform: "GENERIC", status: "READY", title: "Project material", author: "Real author", description: "Real description" } });
    const tag = await db.contentTag.create({ data: { workspaceId: workspaceAId, name: "真实标签", slug: `material-${runId}` } });
    const project = await db.contentProject.create({ data: { workspaceId: workspaceAId, createdById: userAId, title: "Material project", sources: { create: { sourceItemId: source.id } } } });
    await Promise.all([
      db.sourceItemTag.create({ data: { sourceItemId: source.id, tagId: tag.id } }),
      db.sourceAsset.create({ data: { workspaceId: workspaceAId, sourceItemId: source.id, assetType: "IMAGE", sourceProvider: "TEST", status: "STORED", storageKey: `tests/${runId}/image.png`, mimeType: "image/png" } }),
    ]);
    const loaded = await findProjectForUser(db, { userId: userAId, workspaceId: workspaceAId, projectId: project.id });
    expect(loaded?.sources[0]?.sourceItem).toMatchObject({ id: source.id, author: "Real author", tags: [{ tag: { id: tag.id, name: "真实标签" } }], assets: [{ assetType: "IMAGE", status: "STORED" }] });
    await expect(findProjectForUser(db, { userId: userBId, workspaceId: workspaceBId, projectId: project.id })).resolves.toBeNull();
  });

  it("cascades project children while preserving source items", async () => {
    const source = await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", rawText: "keep me" } });
    const project = await db.contentProject.create({ data: { workspaceId: workspaceAId, createdById: userAId, title: "Cascade project", sources: { create: { sourceItemId: source.id } }, evidenceItems: { create: { workspaceId: workspaceAId, createdById: userAId, type: "FACT", claim: "A fact", sourceItemId: source.id } }, creativeBrief: { create: { workspaceId: workspaceAId, createdById: userAId, topic: "Topic", angle: "", audience: "", coreMessage: "Core", keyPoints: [], structure: [], tone: "", risks: [] } }, motherContent: { create: { workspaceId: workspaceAId, createdById: userAId, title: "", body: "Body", outline: [] } } } });
    await db.contentProject.delete({ where: { id: project.id } });
    await expect(db.sourceItem.findUnique({ where: { id: source.id } })).resolves.not.toBeNull();
    await expect(db.projectSource.count({ where: { projectId: project.id } })).resolves.toBe(0);
    await expect(db.evidenceItem.count({ where: { projectId: project.id } })).resolves.toBe(0);
    await expect(db.creativeBrief.count({ where: { projectId: project.id } })).resolves.toBe(0);
    await expect(db.motherContent.count({ where: { projectId: project.id } })).resolves.toBe(0);
  });
});
