import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { createResearchSession, executeResearchRun, getResearchSession, listResearchSessions, reserveResearchRun, saveResearchResult } from "../server/research/service";
import { getResearchResult, listResearchResults } from "../server/research/read-model";
import { validateResearchBlocks } from "../server/research/contracts";

describe("Research private session and durable result", () => {
  const suffix = randomUUID(); const owner = `research-owner-${suffix}`; const editor = `research-editor-${suffix}`; const viewer = `research-viewer-${suffix}`;
  let workspaceId = ""; let otherWorkspaceId = ""; let materialId = ""; let projectId = "";
  const actor = () => ({ workspaceId, userId: owner });
  const question = "这份资料有哪些可核实的观点？";
  const scope = () => ({ materialIds: [materialId], notes: "", useCreatorProfile: false });
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, editor, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Research test", slug: `research-${suffix}`, members: { create: [{ userId: owner, role: "OWNER" }, { userId: editor, role: "EDITOR" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    otherWorkspaceId = (await db.workspace.create({ data: { name: "Other", slug: `research-other-${suffix}`, members: { create: { userId: editor, role: "OWNER" } } } })).id;
    materialId = (await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourceType: "TEXT", title: "访谈记录", rawText: "团队先记录问题，再逐一核对证据。", status: "READY" } })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "Project background" } })).id;
  });
  afterAll(async () => { await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } }); await db.user.deleteMany({ where: { id: { in: [owner, editor, viewer] } } }); await db.$disconnect(); });
  const session = () => createResearchSession(actor(), { title: "核对访谈", requestKey: randomUUID(), projectId });
  it("keeps project-origin sessions private and enforces writer permission", async () => {
    const created = await session();
    expect(created.projectId).toBe(projectId);
    expect(await listResearchSessions({ workspaceId, userId: editor })).toEqual([]);
    await expect(getResearchSession({ workspaceId, userId: editor }, created.id)).rejects.toMatchObject({ status: 404 });
    await expect(getResearchSession({ workspaceId: otherWorkspaceId, userId: editor }, created.id)).rejects.toMatchObject({ status: 404 });
    await expect(createResearchSession({ workspaceId, userId: viewer }, { title: "Denied", requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(createResearchSession({ workspaceId: otherWorkspaceId, userId: editor }, { title: "Denied", requestKey: randomUUID(), projectId })).rejects.toMatchObject({ status: 404 });
  });
  it("requires source objects for specialized paid research modes", async () => {
    const breakdown = await createResearchSession(actor(), { title: "拆解", entryTemplate: "BREAKDOWN", requestKey: randomUUID() });
    await expect(reserveResearchRun(actor(), breakdown.id, { question, scope: { materialIds: [], benchmarkAccountIds: [], trendKeys: [], notes: "", useCreatorProfile: false }, requestKey: randomUUID() })).rejects.toMatchObject({ code: "MATERIAL_REQUIRED", status: 400 });
    const benchmark = await createResearchSession(actor(), { title: "对标", entryTemplate: "BENCHMARK", requestKey: randomUUID() });
    await expect(reserveResearchRun(actor(), benchmark.id, { question, scope: { materialIds: [materialId], benchmarkAccountIds: [], trendKeys: [], notes: "", useCreatorProfile: false }, requestKey: randomUUID() })).rejects.toMatchObject({ code: "BENCHMARK_REQUIRED", status: 400 });
  });
  it("rejects unreadable breakdown input before any paid provider execution", async () => {
    const empty = await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourceType: "IMAGE", title: "待理解图片", status: "READY" } });
    const created = await createResearchSession(actor(), { title: "无法拆解的资料", entryTemplate: "BREAKDOWN", requestKey: randomUUID() });
    const run = await reserveResearchRun(actor(), created.id, { question, scope: { materialIds: [empty.id], notes: "", useCreatorProfile: false }, requestKey: randomUUID() });
    let calls = 0;
    await executeResearchRun(actor(), created.id, run.run.id, { runtime: { provider: new MockLLMProvider(() => { calls++; throw new Error("Provider must not be called"); }), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" } });
    expect(calls).toBe(0);
    expect((await getResearchSession(actor(), created.id)).runs[0]).toMatchObject({ status: "FAILED", errorCode: "NO_READABLE_MATERIAL" });
  });
  it("executes concurrent duplicate requests once, saves without AI, and follows up without overwriting", async () => {
    const key = randomUUID(); const created = await createResearchSession(actor(), { title: "幂等研究", requestKey: key });
    expect((await createResearchSession(actor(), { title: "幂等研究", requestKey: key })).id).toBe(created.id);
    const requests = await Promise.all([1, 2].map(() => reserveResearchRun(actor(), created.id, { question, scope: scope(), requestKey: key })));
    expect(new Set(requests.map(result => result.run.id)).size).toBe(1);
    expect(requests.filter(result => result.created)).toHaveLength(1);
    await expect(reserveResearchRun(actor(), created.id, { question: "Changed", scope: scope(), requestKey: key })).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
    await expect(reserveResearchRun(actor(), created.id, { question, scope: scope(), requestKey: randomUUID() })).rejects.toMatchObject({ code: "RUN_ACTIVE" });
    let calls = 0;
    const runtime = { provider: new MockLLMProvider(() => { calls++; return { sections: [{ title: "可核对的观点", text: "团队先记录问题，再核对证据。", sourceRefs: ["M1"], limitation: "仅依据选定访谈正文，不代表全部团队。" }] }; }), providerName: "FIXTURE", model: "research-fixture", mode: "FIXTURE" as const };
    await Promise.all([1, 2].map(() => executeResearchRun(actor(), created.id, requests[0]!.run.id, { runtime })));
    expect(calls).toBe(1);
    const before = (await getResearchSession(actor(), created.id)).runs[0]!;
    expect(before.status).toBe("COMPLETED"); expect(before.coverage).toMatchObject({ requested: 1, readable: 1, aiSampleCount: 1, visual: 0 });
    expect(await listResearchResults(actor())).toEqual([]);
    await Promise.all([1, 2].map(() => saveResearchResult(actor(), created.id, before.id)));
    expect(calls).toBe(1); expect(await listResearchResults(actor())).toHaveLength(1);
    await expect(getResearchResult({ workspaceId, userId: editor }, before.id)).rejects.toMatchObject({ status: 404 });
    const second = await reserveResearchRun(actor(), created.id, { question: "还有哪些证据缺口？", requestKey: randomUUID() });
    await executeResearchRun(actor(), created.id, second.run.id, { runtime });
    expect(second.run.version).toBe(2); expect(calls).toBe(2);
    expect((await getResearchResult(actor(), before.id)).blocks).toEqual(before.blocks);
  });
  it("rejects invented refs, keeps failures visible and permits explicit retry", async () => {
    const created = await session(); const attempt = await reserveResearchRun(actor(), created.id, { question, scope: scope(), requestKey: randomUUID() });
    await executeResearchRun(actor(), created.id, attempt.run.id, { runtime: { provider: new MockLLMProvider(() => ({ sections: [{ title: "Invalid", text: "Missing evidence", sourceRefs: ["OTHER_WORKSPACE"], limitation: "unknown" }] })), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" } });
    expect((await getResearchSession(actor(), created.id)).runs[0]!.status).toBe("FAILED");
    await expect(saveResearchResult(actor(), created.id, attempt.run.id)).rejects.toMatchObject({ code: "NOT_COMPLETED" });
    expect((await reserveResearchRun(actor(), created.id, { question, scope: scope(), requestKey: randomUUID() })).created).toBe(true);
  });
  it("never reads another workspace's Material", async () => {
    const created = await createResearchSession({ workspaceId: otherWorkspaceId, userId: editor }, { title: "Own session", requestKey: randomUUID() });
    const run = await reserveResearchRun({ workspaceId: otherWorkspaceId, userId: editor }, created.id, { question, scope: scope(), requestKey: randomUUID() });
    const provider = new MockLLMProvider(() => { throw new Error("Provider must not be called"); });
    await executeResearchRun({ workspaceId: otherWorkspaceId, userId: editor }, created.id, run.run.id, { runtime: { provider, providerName: "FIXTURE", model: "fixture" } });
    const stored = await db.researchRun.findUniqueOrThrow({ where: { id: run.run.id } });
    expect(stored).toMatchObject({ status: "FAILED", errorCode: "SOURCE_NOT_FOUND", sourceRefs: [] });
  });
  it("keeps missing chart values null and rejects metrics without a denominator", () => {
    const block = { id: "counts", type: "metrics", title: "Counts", provenance: "COMPUTED", sourceRefs: [], limitation: null, items: [{ label: "Average", value: null, validCount: 0, denominator: 0, unit: "", method: "No available samples" }] };
    expect(validateResearchBlocks([block], [])[0]).toMatchObject({ items: [{ value: null }] });
    expect(() => validateResearchBlocks([{ ...block, items: [{ ...block.items[0], value: 0 }] }], [])).toThrow("RESEARCH_INVALID_COVERAGE");
  });
});
