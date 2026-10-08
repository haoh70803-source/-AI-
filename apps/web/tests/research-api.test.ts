import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/research/api", () => import("../server/research/api"));
vi.mock("@/server/research/service", () => import("../server/research/service"));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("../server/api-access", () => ({ getApiWorkspaceContext: vi.fn(), apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
import { after } from "next/server";
import { db } from "@content-center/db";
import { getApiWorkspaceContext } from "../server/api-access";
import { GET as list, POST as create } from "../app/api/research/sessions/route";
import { GET as detail } from "../app/api/research/sessions/[id]/route";
import { POST as start } from "../app/api/research/sessions/[id]/runs/route";
import { POST as save } from "../app/api/research/sessions/[id]/runs/[runId]/route";
import { getLegacyResearchResult } from "../server/research/legacy";
import { researchResultLibrary } from "../server/research/read-model";
import { shareLegacyStudyToProject } from "../server/research/sharing";
const request = (body: unknown) => new Request("http://localhost/api/research/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
describe("Research HTTP ownership and results adapters", () => {
  const suffix = randomUUID(); const owner = `research-api-owner-${suffix}`; const other = `research-api-other-${suffix}`; const viewer = `research-api-viewer-${suffix}`;
  let workspaceId = ""; let studyId = ""; let projectId = "";
  function asUser(userId: string, role: string) { vi.mocked(getApiWorkspaceContext).mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: userId } }, role } as never); }
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, other, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Research API", slug: suffix, members: { create: [{ userId: owner, role: "OWNER" }, { userId: other, role: "EDITOR" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "共享旧研究的项目" } })).id;
    const account = await db.benchmarkAccount.create({ data: { workspaceId, createdById: owner, name: "旧研究账号", platform: "DOUYIN", externalAccountId: suffix } });
    const material = await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourceType: "TEXT", title: "历史样本", status: "READY" } });
    const study = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: account.id, createdById: owner, version: 1, status: "COMPLETED", sampleCount: 1, insufficientSamples: true, samples: { create: { sourceItemId: material.id } } }, include: { samples: true } });
    studyId = study.id;
    await db.benchmarkStudy.update({ where: { id: study.id }, data: { output: { topicDirections: [{ name: "历史主题", summary: "历史结果保持来源", occurrenceSampleIds: [study.samples[0]!.id], exceptionSampleIds: [], evidence: [{ sampleId: study.samples[0]!.id, quote: "保留来源" }] }], openingPatterns: [], structures: [], persuasionMethods: [], expressionHabits: [], endings: [], commonMethods: [], exceptions: [], repeatedCaseNotes: [], stableMethodsFound: false, message: "旧记录" } } });
  });
  afterAll(async () => { await db.benchmarkStudy.deleteMany({ where: { workspaceId } }); await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, other, viewer] } } }); await db.$disconnect(); });
  it("returns 401 without a session and 403 for a viewer write", async () => {
    vi.mocked(getApiWorkspaceContext).mockResolvedValue(null); expect((await list()).status).toBe(401);
    asUser(viewer, "VIEWER"); expect((await create(request({ title: "Denied", requestKey: randomUUID() }))).status).toBe(403);
  });
  it("schedules an idempotent run once and denies another member all session endpoints", async () => {
    asUser(owner, "OWNER"); const created = await create(request({ title: "Private", requestKey: randomUUID() })); expect(created.status).toBe(201); const session = await created.json();
    const route = { params: Promise.resolve({ id: session.id }) }; const body = { question: "检查这个问题的证据缺口", requestKey: randomUUID() };
    const first = await start(request(body), route); const second = await start(request(body), route);
    expect(first.status).toBe(202); const run = await first.json(); expect((await second.json()).id).toBe(run.id); expect(after).toHaveBeenCalledTimes(1);
    expect((await save(request({}), { params: Promise.resolve({ id: session.id, runId: run.id }) })).status).toBe(409);
    asUser(other, "EDITOR"); expect((await detail(new Request("http://localhost/api/research"), route)).status).toBe(404); expect((await start(request({ ...body, requestKey: randomUUID() }), route)).status).toBe(404);
    expect((await save(request({}), { params: Promise.resolve({ id: session.id, runId: run.id }) })).status).toBe(404);
    expect((await (await list()).json()).items).toEqual([]);
  });
  it("adapts completed shared legacy studies without leaking private runs or running AI", async () => {
    const actor = { workspaceId, userId: other }; const library = await researchResultLibrary(actor, { library: "workspace" }); expect(library.items).toHaveLength(1); expect(library.items[0]).toMatchObject({ kind: "study", id: studyId });
    const result = await getLegacyResearchResult(actor, studyId); expect(result.blocks.some(block => block.type === "text" && block.text === "历史结果保持来源")).toBe(true);
    expect(result.blocks.find(block => block.type === "sources")).toMatchObject({ refs: [{ excerpt: "保留来源" }] });
    expect((await researchResultLibrary(actor, {})).items).toEqual([]);
    await expect(getLegacyResearchResult({ workspaceId: "another-workspace", userId: other }, studyId)).rejects.toMatchObject({ status: 403 });
  });
  it("shares one selected legacy study as a durable project Artifact", async () => {
    const actor = { workspaceId, userId: other };
    const artifact = await shareLegacyStudyToProject(actor, studyId, projectId);
    expect(artifact.content).toContain("历史结果保持来源");
    expect((await shareLegacyStudyToProject(actor, studyId, projectId)).artifactId).toBe(artifact.artifactId);
    expect(await db.artifact.count({ where: { projectId, sourceBenchmarkStudyId: studyId } })).toBe(1);
    await expect(shareLegacyStudyToProject({ workspaceId, userId: viewer }, studyId, projectId)).rejects.toMatchObject({ status: 403 });
  });
});
