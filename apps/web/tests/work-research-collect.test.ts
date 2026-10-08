import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { collect } = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock("../server/discovery/service", () => ({ collectExternalContent: collect }));
import { db } from "@content-center/db";
import { collectWorkSourceForResearch } from "../server/research/work-research-service";

describe("collect a scoped benchmark work before deep research", () => {
  const suffix = randomUUID(); const owner = `collect-owner-${suffix}`; const viewer = `collect-viewer-${suffix}`;
  let workspaceId = ""; let accountId = ""; let workId = "";
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Collect work", slug: suffix, members: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: owner, platform: "DOUYIN", name: "测试账号", externalAccountId: suffix } })).id;
    workId = (await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId: `${suffix}-work`, title: "真实标题", url: "https://example.test/saved-work", metadata: { durationMs: 12000, metrics: { likes: 42 } } } })).id;
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }); await db.$disconnect(); });
  it("passes only the server-owned work identity and metadata to the existing importer", async () => {
    collect.mockResolvedValueOnce({ sourceItem: { id: "collected-source", status: "PENDING" }, created: true });
    expect(await collectWorkSourceForResearch({ workspaceId, userId: owner }, accountId, workId)).toEqual({ sourceItemId: "collected-source", created: true, status: "PENDING" });
    expect(collect).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, userId: owner, content: expect.objectContaining({ externalId: `${suffix}-work`, originalUrl: "https://example.test/saved-work", title: "真实标题", sourceProvider: "REDFOX" }) }));
  });
  it("rejects viewers, foreign accounts and archived duplicates", async () => {
    await expect(collectWorkSourceForResearch({ workspaceId, userId: viewer }, accountId, workId)).rejects.toMatchObject({ status: 403 });
    await expect(collectWorkSourceForResearch({ workspaceId, userId: owner }, "foreign-account", workId)).rejects.toMatchObject({ status: 404 });
    collect.mockResolvedValueOnce({ sourceItem: { id: "archived", status: "ARCHIVED" }, created: false });
    await expect(collectWorkSourceForResearch({ workspaceId, userId: owner }, accountId, workId)).rejects.toMatchObject({ status: 409 });
  });
});
