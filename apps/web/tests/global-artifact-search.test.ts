import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("../server/api-access", () => ({
  getApiWorkspaceContext: mocks.context,
  apiError: (error: string, status: number) => Response.json({ error }, { status }),
}));
import { db } from "@content-center/db";
import { GET } from "../app/api/search/route";

describe("global artifact search (isolated review)", () => {
  const suffix = randomUUID(), ownerId = "workbench-w1-owner-" + suffix, viewerId = "workbench-w1-viewer-" + suffix;
  const title = "可找回稿件 " + suffix;
  let workspaceId = "", otherWorkspaceId = "", projectId = "", sourceId = "", artifactId = "", branchId = "";
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || url.port !== "55436" || url.pathname !== "/content_center_upgrade_review" || process.env.LOCAL_REVIEW_OFFLINE !== "true") throw Error("ISOLATED_REVIEW_REQUIRED");
    await db.user.createMany({ data: [{ id: ownerId, name: "W1 owner", email: ownerId + "@example.test" }, { id: viewerId, name: "W1 viewer", email: viewerId + "@example.test" }] });
    workspaceId = (await db.workspace.create({ data: { name: "W1", slug: "workbench-w1-" + suffix, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
    otherWorkspaceId = (await db.workspace.create({ data: { name: "W1 foreign", slug: "workbench-w1-other-" + suffix } })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title } })).id;
    sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, title, sourceType: "TEXT", sourcePlatform: "GENERIC", rawText: "Private body never returned by search." } })).id;
    async function seed(ws: string, archived = false, deleted = false) {
      const project = ws === workspaceId && !archived && !deleted ? projectId : (await db.contentProject.create({ data: { workspaceId: ws, createdById: ownerId, title, status: archived ? "ARCHIVED" : "DRAFT" } })).id;
      const branch = await db.draftBranch.create({ data: { workspaceId: ws, projectId: project, title, version: 3, workingBody: "Private artifact body", createdById: ownerId, updatedById: ownerId, deletedAt: deleted ? new Date() : null } });
      const artifact = await db.artifact.create({ data: { workspaceId: ws, projectId: project, draftBranchId: branch.id, createdById: ownerId, title, type: "TEXT" } });
      return { artifact, branch };
    }
    const current = await seed(workspaceId); artifactId = current.artifact.id; branchId = current.branch.id;
    await seed(otherWorkspaceId); await seed(workspaceId, true); await seed(workspaceId, false, true);
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
    await db.$disconnect();
  });
  beforeEach(() => mocks.context.mockReset().mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: ownerId } }, role: "OWNER" }));
  async function search(scope = "ARTIFACT", q = title) {
    const response = await GET(new Request("http://localhost:3030/api/search?scope=" + scope + "&q=" + encodeURIComponent(q)));
    return { status: response.status, body: await response.json() as { items: Array<{ id: string; type: string; title: string; href: string; projectTitle?: string; version?: number }> } };
  }
  it("finds a manuscript by title with its project and current version without returning its body", async () => {
    const result = await search();
    expect(result.status).toBe(200);
    expect(result.body.items).toEqual([{ id: artifactId, title, type: "ARTIFACT", href: "/dashboard?project=" + projectId + "&node=artifact:" + artifactId, projectTitle: title, version: 3, date: expect.any(String) }]);
    expect(JSON.stringify(result.body)).not.toContain("Private artifact body");
    expect(JSON.stringify(result.body)).not.toContain("Private body never");
  });
  it("keeps project, text material and artifact identities separate in all results", async () => {
    const result = await search("ALL");
    expect(result.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: projectId, type: "PROJECT" }), expect.objectContaining({ id: sourceId, type: "TEXT" }), expect.objectContaining({ id: artifactId, type: "ARTIFACT" })]));
    expect((await search("TEXT")).body.items.some(item => item.type === "ARTIFACT")).toBe(false);
    expect((await search("PROJECT")).body.items.some(item => item.type === "ARTIFACT")).toBe(false);
  });
  it("excludes foreign workspace, archived project and deleted branch artifacts", async () => {
    expect((await search()).body.items.map(item => item.id)).toEqual([artifactId]);
  });
  it("returns the latest version rather than claiming an old revision was opened", async () => {
    await db.draftBranch.update({ where: { id: branchId }, data: { version: 4 } });
    expect((await search()).body.items[0]?.version).toBe(4);
    await db.draftBranch.update({ where: { id: branchId }, data: { version: 3 } });
  });
  it("permits an enabled viewer to find existing shared project artifacts", async () => {
    mocks.context.mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: viewerId } }, role: "VIEWER" });
    expect((await search()).body.items[0]?.id).toBe(artifactId);
  });
  it("rejects anonymous access before searching", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await search()).status).toBe(401);
  });
  it("does not trust a workspace without membership even if supplied by the test context", async () => {
    mocks.context.mockResolvedValue({ workspace: { id: otherWorkspaceId }, session: { user: { id: ownerId } }, role: "OWNER" });
    expect((await search()).body.items).toEqual([]);
  });
  it.each(["member", "user", "workspace"] as const)("excludes artifacts for a disabled %s", async target => {
    try {
      if (target === "member") await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { disabledAt: new Date() } });
      if (target === "user") await db.user.update({ where: { id: ownerId }, data: { disabledAt: new Date() } });
      if (target === "workspace") await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: new Date() } });
      expect((await search()).body.items).toEqual([]);
    } finally {
      if (target === "member") await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { disabledAt: null } });
      if (target === "user") await db.user.update({ where: { id: ownerId }, data: { disabledAt: null } });
      if (target === "workspace") await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: null } });
    }
  });
});
