import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { researchBenchmarkDossier, researchBenchmarkWork } from "../server/research/benchmark-dossier";

describe("account dossier real read boundary", () => {
  const key = randomUUID(); const owner = `dossier-owner-${key}`; const other = `dossier-other-${key}`; const outsider = `dossier-outside-${key}`;
  let workspaceId = ""; let accountId = ""; let sourceId = ""; let workId = "";
  const actor = () => ({ workspaceId, userId: owner });
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, other, outsider].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Dossier", slug: key, members: { create: [{ userId: owner, role: "OWNER" }, { userId: other, role: "VIEWER" }] } } })).id;
    accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: owner, platform: "DOUYIN", name: "真实读取测试", externalAccountId: key } })).id;
    sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId: key, sourceType: "VIDEO", rawText: "用户人工补充的可读文字", status: "READY" } })).id;
    workId = (await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId: key, title: "可核验的作品", url: "https://example.test/work", coverUrl: "https://example.test/cover.jpg", metadata: { metrics: { likes: 0, comments: null } }, publishedAt: new Date("2026-09-01") } })).id;
  });
  afterAll(async () => { await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, other, outsider] } } }); await db.$disconnect(); });
  it("reads actual covers, metadata and Material availability without generating classifications", async () => {
    const data = await researchBenchmarkDossier(actor(), accountId);
    expect(data).toMatchObject({ total: 1, limited: false, analysis: null, cards: [], classifications: { count: 0 } });
    expect(data.works[0]).toMatchObject({ id: workId, coverUrl: "https://example.test/cover.jpg", readable: true, topic: null, counts: { likes: 0, comments: null } });
  });
  it("opens a scoped work through the unified readable-content boundary", async () => {
    expect(await researchBenchmarkWork(actor(), accountId, workId)).toMatchObject({ sourceItemId: sourceId, text: "用户人工补充的可读文字" });
    await expect(researchBenchmarkWork(actor(), "another-account", workId)).rejects.toMatchObject({ status: 404 });
    await expect(researchBenchmarkWork({ workspaceId, userId: outsider }, accountId, workId)).rejects.toMatchObject({ status: 403 });
  });
  it("does not expose a same-workspace member's private research", async () => {
    const session = await db.researchSession.create({ data: { workspaceId, createdById: owner, title: "Private", entryTemplate: "BENCHMARK", requestKey: randomUUID() } });
    const accountRun = await db.researchRun.create({ data: { workspaceId, sessionId: session.id, requestedById: owner, requestKey: randomUUID(), requestHash: key, question: "Private", version: 1, status: "COMPLETED", savedAt: new Date(), inputScope: { benchmarkAccountIds: [accountId] }, blocks: [] } });
    await db.researchRun.create({ data: { workspaceId, sessionId: session.id, requestedById: owner, requestKey: randomUUID(), requestHash: key, question: "Single work", version: 2, status: "COMPLETED", savedAt: new Date(Date.now() + 1000), inputScope: { benchmarkAccountIds: [accountId], benchmarkWorkId: workId, researchProfile: "WORK_DEEP", researchDepth: "DEEP" }, blocks: [] } });
    expect((await researchBenchmarkDossier(actor(), accountId)).analysis).toMatchObject({ kind: "run", id: accountRun.id });
    expect((await researchBenchmarkDossier({ workspaceId, userId: other }, accountId)).analysis).toBeNull();
  });
  it("does not present an archived Material as readable in the dossier or drawer", async () => {
    await db.sourceItem.update({ where: { id: sourceId }, data: { status: "ARCHIVED" } });
    expect((await researchBenchmarkDossier(actor(), accountId)).works[0]?.readable).toBe(false);
    expect((await researchBenchmarkWork(actor(), accountId, workId)).text).toBeNull();
  });
});
