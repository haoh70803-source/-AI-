import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { createContentIngestWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";
import { defaultContentMethodMinimumItems, defaultContentMethodSectionCodes } from "../server/default-content-method/schemas";

const runId = randomUUID();
const email = `material-analysis-${runId}@example.test`;
const unconfiguredEmail = `material-analysis-unconfigured-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let calls = 0;
let worker: ReturnType<typeof createContentIngestWorker>;

function result() {
  calls += 1;
  const quote = "内容团队常常收集很多视频";
  const section = { summary: "先指出问题，再逐步给出处理方式。", evidence: [{ quote }] };
  return {
    whatItSays: { summary: "这条素材说明了创作前先整理内容的价值。", keyPoints: ["先整理素材", "再开始表达"], evidence: [{ quote }] },
    expression: {
      audience: section,
      opening: { summary: "先说内容团队面对的信息损耗问题。", evidence: [{ quote }] },
      progression: { summary: "从问题进入解释，再落到处理方式。", steps: ["提出问题", "解释原因", "给出方法"], evidence: [{ quote }] },
      support: section,
      emotionalOrRhetoricalShift: { summary: "先制造需要解决的问题，再转向理性说明。", evidence: [{ quote }] },
      ending: { summary: "回到可执行的整理动作。", evidence: [{ quote }] },
    },
    methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT", reason: "这条内容提供了一个可试用的表达方法。", items: [{ title: calls > 1 ? "先说问题，再进入方案（新版）" : "先说问题，再进入方案", howTo: ["开头先说清用户正在遇到的问题，再进入你的观点或处理方式。"], applicable: ["需要解释复杂内容时"], boundaries: ["只有一条素材依据，不能当作稳定规律。"], evidence: [{ quote }] }] },
    reusable: [{ content: "先拆信息再表达", whyUseful: "可以帮助团队减少创作前的重复阅读。" }],
    doNotCopy: [{ content: "原作者的具体经历", reason: "这是来源作者的内容，不是当前创作者的事实。" }],
    uncertain: [],
  };
}

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const prompt = parsed.messages.at(-1)?.content ?? "";
      const benchmarkTopics = prompt.includes("基于外部启发生成");
      if (!benchmarkTopics) {
        expect(prompt).toContain("ANALYZE_MATERIAL");
        expect(prompt).toContain("segmentIndex");
        expect(prompt).toContain("Never return timestamps");
      }
      response.writeHead(request.headers.authorization === "Bearer material-analysis-key" ? 200 : 401, { "content-type": "application/json", "x-request-id": `material-analysis-${calls + 1}` });
      const output = benchmarkTopics ? { summary: "已形成四个不同选题。", topics: [
        { title: "家长问价格时，校长为什么不该马上发价格表", angle: "经营问题", why: "从具体销售动作切入。", ourTake: "先判断家长是否看懂课程差异。", evidenceNeed: "NONE", evidenceHint: null },
        { title: "假设内容发了很久，真正客户还是不来问", angle: "假设场景", why: "用执行和结果的落差制造冲突。", ourTake: "假设一家机构持续发内容，可以先检查吸引来的是谁。", evidenceNeed: "NONE", evidenceHint: null },
        { title: "同行先讲工具，我们为什么先看经营问题", angle: "观点冲突", why: "把外部做法与我方判断进行对比。", ourTake: "先看经营问题，再决定是否需要工具。", evidenceNeed: "OPTIONAL", evidenceHint: "有真实咨询记录会更有说服力" },
        { title: "报价之前，最值得先确认的是什么", angle: "客户认知", why: "从客户理解程度切入。", ourTake: "可以先讲判断，不虚构客户案例。", evidenceNeed: "REQUIRED", evidenceHint: "建议补真实案例" },
      ] } : result();
      response.end(JSON.stringify({ id: `material-analysis-${calls + 1}`, model: "kimi-2.6-fixture", choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 120, completion_tokens: 55 } }));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Material analysis fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
  worker = createContentIngestWorker();
  await worker.waitUntilReady();
});

test.afterAll(async () => {
  await worker?.close();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const users = await db.user.findMany({ where: { email: { in: [email, unconfiguredEmail] } }, select: { id: true } });
  const ids = users.map(({ id }) => id);
  if (ids.length) {
    const workspaceIds = (await db.workspaceMember.findMany({ where: { userId: { in: ids } }, select: { workspaceId: true } })).map(({ workspaceId }) => workspaceId);
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  }
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

async function register(page: import("@playwright/test").Page, userEmail: string, name: string) {
  const response = await auth.api.signUpEmail({ body: { name, email: userEmail, password }, asResponse: true });
  expect(response.ok).toBe(true);
  const result = await response.clone().json() as { user: { id: string } };
  await ensurePersonalWorkspaceForUser(db, { userId: result.user.id });
  const cookieHeaders = response.headers.getSetCookie();
  await page.context().addCookies(cookieHeaders.map((header) => {
    const [pair] = header.split(";", 1);
    const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  }));
  await page.goto("/dashboard");
  return db.user.findUniqueOrThrow({ where: { id: result.user.id }, include: { workspaceMemberships: true } });
}

test("material detail supports the persisted asynchronous analysis flow", async ({ page }) => {
  test.setTimeout(90_000);
  const user = await register(page, email, "Material Analysis Owner");
  const membership = user.workspaceMemberships[0]!;
  await new IntegrationService().saveIntegrationConfig({ workspaceId: membership.workspaceId, userId: user.id, provider: "LLM", config: { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: fixtureOrigin, apiKey: "material-analysis-key", apiModelId: "kimi-2.6-fixture" } });
  const source = await db.sourceItem.create({ data: { workspaceId: membership.workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "待拆解视频", status: "READY", transcript: { create: { workspaceId: membership.workspaceId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: "内容团队常常收集很多视频，但如果不先整理主题和观点，真正创作时仍然要重新阅读。", segments: [] } } } });
  const defaultAsset = await db.methodAsset.create({ data: { workspaceId: membership.workspaceId, ownerUserId: user.id, status: "CORE" } });
  await db.methodVersion.create({ data: { assetId: defaultAsset.id, version: 1, title: "鑫世界默认创作方法", workspaceDefaultKey: "DEFAULT_CONTENT", steps: { kind: "WORKSPACE_DEFAULT_CONTENT_METHOD", schemaVersion: "workspace-default-content-method-v1", publicationStatus: "PUBLISHED", origin: "HUMAN", createdFromVersion: null, publishedAt: new Date().toISOString(), publishedById: user.id, sections: defaultContentMethodSectionCodes.map((code) => ({ code, items: Array.from({ length: defaultContentMethodMinimumItems[code] }, (_, index) => ({ text: `${code} 指南 ${index + 1}`, sourceRefs: [{ type: "OWN_EXPERIENCE", referenceId: `${code}-${index}`, label: "内部依据" }] })) })) }, applicableScenarios: [], boundaries: [], evidence: [], editedById: user.id } });

  await page.goto(`/library/${source.id}`);
  const card = page.getByTestId("material-analysis-card");
  await expect(page.getByRole("heading", { name: "文字稿" })).toBeVisible();
  await expect(page.getByText("内容团队常常收集很多视频，但如果不先整理主题和观点，真正创作时仍然要重新阅读。", { exact: true })).toBeVisible();
  await expect(card).toContainText("内容理解");
  await expect(page.getByRole("button", { name: "内容理解" })).toBeVisible();
  await page.getByRole("button", { name: "内容理解" }).click();
  await expect(card).toContainText(/正在整理内容理解|这条内容是怎么讲的/);
  await expect(card).toContainText("这条内容是怎么讲的", { timeout: 15_000 });
  await expect(card).toContainText("可复用的创作方法");
  await expect(card).toContainText("仅根据这一条内容总结，建议先试用");
  await expect(card).toContainText("查看原文依据");
  await expect(card).toContainText("内容团队常常收集很多视频");
  expect(await card.innerText()).not.toMatch(/MaterialAnalysis|ANALYZE_MATERIAL|SINGLE_SOURCE_DRAFT|INSUFFICIENT|Queue|Worker|Workspace|Provider|AIRun|ApiUsage|Job ID|attempt|Token|Schema/);
  const firstAnalysis = await db.materialAnalysis.findFirstOrThrow({ where: { sourceItemId: source.id, status: "COMPLETED" }, include: { aiRun: true } });
  expect(firstAnalysis.aiRun).toMatchObject({ status: "SUCCEEDED", inputSummary: { transcriptId: expect.any(String), schemaVersion: "content-breakdown-v1" }, metadata: { schemaVersion: "content-breakdown-v1" } });
  await expect(db.apiUsage.findFirst({ where: { requestId: firstAnalysis.aiRunId!, operation: "ANALYZE_MATERIAL", success: true } })).resolves.toBeTruthy();
  await page.reload();
  await expect(page.getByTestId("material-analysis-card")).toContainText("这条内容是怎么讲的");

  const callsBeforeProject = calls;
  await page.getByRole("tab", { name: "创作" }).click();
  await page.getByRole("button", { name: "基于这条资料创作" }).click();
  await expect(page).toHaveURL(/\/projects\/.+\/studio$/);
  await expect(page.getByRole("heading", { name: "待拆解视频" })).toBeVisible();
  expect(calls).toBe(callsBeforeProject);
  await page.goto(`/library/${source.id}`);

  await page.getByRole("tab", { name: "创作" }).click();
  await page.getByRole("button", { name: "用这条找选题" }).click();
  const topicDrawer = page.getByRole("dialog", { name: "我们可以做什么选题" });
  await expect(topicDrawer.getByText("已形成四个不同选题。")).toBeVisible({ timeout: 15_000 });
  await expect(topicDrawer.getByRole("heading", { name: "家长问价格时，校长为什么不该马上发价格表" })).toBeVisible();
  await topicDrawer.getByRole("button", { name: "选这个题去创作" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+\/studio$/);
  await expect(page.getByRole("heading", { name: "家长问价格时，校长为什么不该马上发价格表" })).toBeVisible();
  const selectedProject = await db.contentProject.findFirstOrThrow({ where: { workspaceId: membership.workspaceId, title: "家长问价格时，校长为什么不该马上发价格表" }, include: { creativeBrief: true, sources: true } });
  expect(selectedProject.sources).toEqual([expect.objectContaining({ sourceItemId: source.id, role: "INSPIRATION" })]);
  expect(selectedProject.creativeBrief?.metadata).toMatchObject({ handoff: "BENCHMARK_TOPIC", source: { type: "VIDEO", id: source.id, basis: "M1" } });
  await page.goto(`/library/${source.id}`);

  const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
  const failedAnalysis = await db.materialAnalysis.create({ data: { workspaceId: membership.workspaceId, sourceItemId: source.id, createdById: user.id, version: 2, status: "FAILED", tags: [], keywords: [], keyPoints: [], transcriptUpdatedAtAtAnalysis: transcript.updatedAt, errorCode: "FIXTURE_FAILURE", errorMessage: "模拟任务失败。" } });
  await db.ingestJob.create({ data: { workspaceId: membership.workspaceId, sourceItemId: source.id, requestedById: user.id, jobType: "ANALYZE_MATERIAL", provider: "LLM", providerMode: "REAL", status: "FAILED", errorCode: "FIXTURE_FAILURE", errorMessage: "模拟任务失败。", finishedAt: new Date(), metadata: { materialAnalysisId: failedAnalysis.id } } });
  await page.reload();
  await expect(card).toContainText("这次没有处理成功");
  await expect(card).toContainText("这条内容是怎么讲的");
  await page.getByRole("button", { name: "重新理解" }).click();
  await expect(card).toContainText("新版", { timeout: 15_000 });
  await expect(db.materialAnalysis.count({ where: { sourceItemId: source.id, status: "COMPLETED" } })).resolves.toBe(2);
  await expect(card).toContainText("历史内容理解");

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
  await page.reload();
  await expect(page.getByRole("button", { name: "重新理解" })).toHaveCount(0);
  const forbidden = await page.request.post(`/api/source-items/${source.id}/material-analysis`);
  expect(forbidden.status()).toBe(403);
});

test("unconfigured Kimi is explicit and never creates a fake analysis", async ({ page }) => {
  const user = await register(page, unconfiguredEmail, "Material Analysis Unconfigured");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "未配置素材", status: "READY", transcript: { create: { workspaceId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: "已有视频文字稿，但没有配置内容拆解服务。", segments: [] } } } });
  await page.goto(`/library/${source.id}`);
  await expect(page.getByTestId("material-analysis-card")).toContainText("暂时没有可用的内容理解结果");
  await expect(page.getByRole("button", { name: "内容理解" })).toHaveCount(0);
  await expect(db.materialAnalysis.count({ where: { sourceItemId: source.id } })).resolves.toBe(0);
});
