import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/api-access", () => ({ getApiWorkspaceContext: vi.fn(), apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
const knowledge = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../server/knowledge/feishu-context", () => ({ feishuContextItems: knowledge.read, feishuLinks: () => "" }));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { getApiWorkspaceContext } from "../server/api-access";
import { shareResearchRunToProject } from "../server/research/sharing";
import { getProjectAssistantThread, runProjectAssistant } from "../server/assistant/service";
import { getArtifactForUser } from "../server/artifacts/service";
import { GET, POST } from "../app/api/research/results/[runId]/share/route";

const suffix = randomUUID(), owner = `handoff-${suffix}`, viewer = `handoff-viewer-${suffix}`, outsider = `handoff-outsider-${suffix}`;
let workspaceId = "", foreignWorkspace = "", projectId = "", runId = "", emptyRunId = "";
const actor = () => ({ workspaceId, userId: owner });
const reportText = "证据标记HANDOFF_REPORT：先提出表达困境，再给具体做法，用产品案例支撑，最后回到主线。";
const context = () => ({ params: Promise.resolve({ runId }) });
const request = (body: unknown) => new Request("http://localhost/api/research/results/test/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  await db.user.createMany({ data: [owner, viewer, outsider].map(id => ({ id, name: id, email: id + "@example.test" })) });
  workspaceId = (await db.workspace.create({ data: { name: "隔离研究交接", slug: owner, members: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] } } })).id;
  foreignWorkspace = (await db.workspace.create({ data: { name: "其他工作空间", slug: outsider, members: { create: { userId: outsider, role: "OWNER" } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "已有创作项目" } })).id;
  const session = await db.researchSession.create({ data: { workspaceId, createdById: owner, title: "私人拆解", entryTemplate: "TEARDOWN", requestKey: randomUUID() } });
  const source = { ref: "M1", kind: "MATERIAL", objectId: "fixture", title: "原作品", href: null, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: null, excerpt: "先把问题说清楚，再给一个具体案例。", version: null };
  const blocks = [
    { id: "finding", type: "text", title: "主线与表达结构", provenance: "AI_INTERPRETATION", sourceRefs: ["M1"], limitation: "传播作用为分析判断。", text: reportText },
    { id: "sources", type: "sources", title: "依据", provenance: "REAL_DATA", sourceRefs: ["M1"], limitation: null, refs: [source] },
  ];
  for (const empty of [false, true]) {
    const run = await db.researchRun.create({ data: { workspaceId, sessionId: session.id, requestedById: owner, requestKey: randomUUID(), requestHash: "fixture", version: empty ? 2 : 1, question: "拆解表达结构", resultTitle: "如何把产品讲清楚", status: "COMPLETED", stage: "COMPLETED", savedAt: new Date(), inputScope: { materialIds: [], benchmarkAccountIds: [], trendKeys: [], notes: "PRIVATE_NOTE_MUST_NOT_SHARE", useOwnArtifacts: false, useCreatorProfile: false }, blocks: empty ? [] : blocks, sourceRefs: [source] } });
    if (empty) emptyRunId = run.id; else runId = run.id;
  }
  knowledge.read.mockResolvedValue([]);
});
afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (foreignWorkspace) await db.workspace.delete({ where: { id: foreignWorkspace } });
  await db.user.deleteMany({ where: { id: { in: [owner, viewer, outsider] } } });
  await db.$disconnect();
});

it("atomically creates one project and one report for concurrent retries", async () => {
  const target = { title: "从拆解开始的新项目", clientRequestId: randomUUID() };
  const [first, replay] = await Promise.all([shareResearchRunToProject(actor(), runId, target, undefined, 1), shareResearchRunToProject(actor(), runId, target, undefined, 1)]);
  expect(first.projectId).toBe(replay.projectId); expect(first.artifactId).toBe(replay.artifactId);
  expect(await db.contentProject.count({ where: { workspaceId, clientRequestId: target.clientRequestId } })).toBe(1);
  expect(await db.artifact.count({ where: { projectId: first.projectId } })).toBe(1);
  expect(first.content).toContain(reportText); expect(first.content).not.toContain("PRIVATE_NOTE_MUST_NOT_SHARE");
  await expect(shareResearchRunToProject(actor(), runId, { ...target, title: "更改重复请求" })).rejects.toMatchObject({ code: "PROJECT_CONFLICT" });
});

it("rolls back project creation when report sharing fails and rejects stale reports", async () => {
  const target = { title: "不应留下空项目", clientRequestId: randomUUID() };
  await expect(shareResearchRunToProject(actor(), emptyRunId, target)).rejects.toMatchObject({ code: "NO_SHAREABLE_BLOCKS" });
  expect(await db.contentProject.count({ where: { workspaceId, clientRequestId: target.clientRequestId } })).toBe(0);
  await expect(shareResearchRunToProject(actor(), runId, target, undefined, 2)).rejects.toMatchObject({ code: "RESULT_CHANGED" });
  expect(await db.contentProject.count({ where: { workspaceId, clientRequestId: target.clientRequestId } })).toBe(0);
});

it("validates API targets, authenticates preview and keeps sharing scoped", async () => {
  vi.mocked(getApiWorkspaceContext).mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/share"), context())).status).toBe(401);
  vi.mocked(getApiWorkspaceContext).mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: owner } }, role: "OWNER" } as never);
  expect((await (await GET(new Request("http://localhost/share"), context())).json()).body).toContain(reportText);
  expect((await POST(request({ projectId, newProject: { title: "冲突", clientRequestId: randomUUID() } }), context())).status).toBe(400);
  const response = await POST(request({ projectId, expectedVersion: 1 }), context());
  expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ projectId, projectTitle: "已有创作项目" });
  await expect(shareResearchRunToProject({ workspaceId, userId: viewer }, runId, projectId)).rejects.toMatchObject({ status: 403 });
  await expect(shareResearchRunToProject({ workspaceId: foreignWorkspace, userId: outsider }, runId, { title: "跨空间", clientRequestId: randomUUID() })).rejects.toMatchObject({ status: 404 });
});

it("reads the shared report for generation, retains it for revisions, and honors explicit removal", async () => {
  const shared = await shareResearchRunToProject(actor(), runId, projectId);
  const prompts: string[] = [];
  const provider = new MockLLMProvider(input => { prompts.push(input.prompt); return "口播稿：开头先提出一个具体问题，再用自己的案例说明方法。"; });
  const runtime = { provider, providerName: "FIXTURE", model: "handoff-fixture", mode: "FIXTURE" as const };
  const first = await runProjectAssistant({ ...actor(), projectId, content: "根据这份分析报告生成60秒口播稿", references: [{ sourceType: "ARTIFACT", sourceId: shared.artifactId }] }, () => undefined, { runtime });
  expect(first.status).toBe("COMPLETED"); expect(first.artifactId).toBeNull(); expect(first.actions).toContain("CREATE_ARTIFACT");
  expect(prompts[0]).toContain(reportText);
  await runProjectAssistant({ ...actor(), projectId, content: "短一点" }, () => undefined, { runtime });
  expect(prompts[1]).toContain(reportText);
  expect((await getProjectAssistantThread({ ...actor(), projectId })).activeReferences).toEqual([expect.objectContaining({ sourceType: "ARTIFACT", sourceId: shared.artifactId })]);
  expect((await getArtifactForUser({ ...actor(), projectId, artifactId: shared.artifactId })).content).toBe(shared.content);
  await runProjectAssistant({ ...actor(), projectId, content: "再短一点", references: [] }, () => undefined, { runtime });
  expect((await getProjectAssistantThread({ ...actor(), projectId })).activeReferences).toEqual([]);
  const lastUser = await db.assistantMessage.findFirstOrThrow({ where: { role: "USER", thread: { projectId } }, orderBy: { createdAt: "desc" } });
  expect(lastUser.metadata).toMatchObject({ references: [] });
});

it("combines report context with authorized knowledge only when requested", async () => {
  const shared = await shareResearchRunToProject(actor(), runId, projectId);
  knowledge.read.mockClear();
  knowledge.read.mockResolvedValue([{ objectType: "SOURCE_ITEM", objectId: "knowledge-fixture", ownership: "EXTERNAL", provenance: "feishu_authorized_document", whySelected: "测试授权知识", version: "1", truncated: false, content: "KNOWLEDGE_FIXTURE：我们的服务适用于小商家。" }]);
  let prompt = "";
  const runtime = { provider: new MockLLMProvider(input => { prompt = input.prompt; return "口播稿：给小商家的一份表达建议。"; }), providerName: "FIXTURE", model: "knowledge-fixture", mode: "FIXTURE" as const };
  await runProjectAssistant({ ...actor(), projectId, content: "结合报告和知识库，写一份面向小商家的口播稿", references: [{ sourceType: "ARTIFACT", sourceId: shared.artifactId }] }, () => undefined, { runtime });
  expect(prompt).toContain(reportText); expect(prompt).toContain("KNOWLEDGE_FIXTURE");
  expect(knowledge.read).toHaveBeenCalledWith(expect.objectContaining(actor()), expect.stringContaining("如何把产品讲清楚"));
  knowledge.read.mockClear();
  await runProjectAssistant({ ...actor(), projectId, content: "短一点" }, () => undefined, { runtime });
  expect(knowledge.read).not.toHaveBeenCalled();
  knowledge.read.mockResolvedValue([]);
});

it("refuses cross-project report references before invoking the model", async () => {
  const shared = await shareResearchRunToProject(actor(), runId, projectId);
  const other = await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "未加入报告的项目" } });
  const generated = vi.fn(() => "不应执行");
  await runProjectAssistant({ ...actor(), projectId: other.id, content: "根据报告生成文案", references: [{ sourceType: "ARTIFACT", sourceId: shared.artifactId }] }, () => undefined, { runtime: { provider: new MockLLMProvider(generated), providerName: "FIXTURE", model: "scope-fixture", mode: "FIXTURE" } }).catch(() => undefined);
  expect(generated).not.toHaveBeenCalled();
});
