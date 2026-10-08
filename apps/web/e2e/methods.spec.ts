import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { createContentIngestWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `methods-${runId}@example.test`;
const otherEmail = `methods-other-${runId}@example.test`;
const studioEmail = `methods-studio-${runId}@example.test`;
const journeyEmail = `methods-journey-${runId}@example.test`;
const creatorMethodsEmail = `creator-methods-${runId}@example.test`;
const creatorMethodsOtherEmail = `creator-methods-other-${runId}@example.test`;
const studioDefaultEmail = `studio-default-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let worker: ReturnType<typeof createContentIngestWorker>;
const prompts: string[] = [];

function analysisGeneration() {
  const evidence = [{ segmentIndex: 0 }];
  const section = { summary: "先说清问题，再进入处理方式。", evidence };
  return {
    whatItSays: { summary: "这条内容说明先确认问题，再给出处理方式。", keyPoints: ["先说问题", "再给方法"], evidence },
    expression: { audience: section, opening: section, progression: { summary: "从问题到方法逐步推进。", steps: ["问题", "解释", "方法"], evidence }, support: section, emotionalOrRhetoricalShift: section, ending: section },
    methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT", reason: "这条内容只提供一个可试用的方法草稿。", items: [{ title: "先说问题，再进入方案", howTo: ["先说清用户遇到的问题，再进入自己的处理方式。"], applicable: ["需要解释复杂问题时"], boundaries: ["只有一条素材依据，不能当作稳定规律。"], evidence }] },
    reusable: [{ content: "先拆信息再表达", whyUseful: "便于让复杂内容更容易理解。" }],
    doNotCopy: [{ content: "来源作者的经历", reason: "不能当成自己的事实。" }],
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
      prompts.push(prompt);
      const index = prompts.length;
      response.writeHead(request.headers.authorization === "Bearer methods-fixture-key" ? 200 : 401, { "content-type": "application/json", "x-request-id": `methods-${index}` });
      const output = prompt.includes("Action: ANALYZE_MATERIAL")
        ? analysisGeneration()
        : { recommendedAngle: "先说清问题", alternativeAngles: ["从误区切入"], recommendedTitle: `方法生成稿 ${index}`, alternativeTitles: ["为什么先说问题？", "一个问题的处理方式"], openingHook: "先把问题说清楚。", outline: ["问题", "方法"], body: "我从来没有做过加盟业务。先把问题说清楚，再给出自己的处理方式。", evidenceIds: [], sourceItemIds: [] };
      const send = () => response.end(JSON.stringify({ id: `methods-${index}`, model: "kimi-2.6-fixture", choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 120, completion_tokens: 55 } }));
      if (prompt.includes("Action: ANALYZE_MATERIAL")) setTimeout(send, 500);
      else send();
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Methods fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
  worker = createContentIngestWorker();
  await worker.waitUntilReady();
});

test.afterAll(async () => {
  await worker?.close();
  fixture.closeAllConnections();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const users = await db.user.findMany({ where: { email: { in: [email, otherEmail, studioEmail, journeyEmail, creatorMethodsEmail, creatorMethodsOtherEmail, studioDefaultEmail] } }, select: { id: true } });
  if (users.length) {
    const workspaces = await db.workspace.findMany({ where: { members: { some: { userId: { in: users.map(({ id }) => id) } } } }, select: { id: true } });
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: workspaces.map(({ id }) => id) } } });
    await db.benchmarkStudy.deleteMany({ where: { workspaceId: { in: workspaces.map(({ id }) => id) } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces.map(({ id }) => id) } } });
  }
  await db.user.deleteMany({ where: { email: { in: [email, otherEmail, studioEmail, journeyEmail, creatorMethodsEmail, creatorMethodsOtherEmail, studioDefaultEmail] } } });
  await db.$disconnect();
});

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1);
    const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

async function signIn(page: import("@playwright/test").Page, userEmail = email, name = "Methods Owner") {
  const response = await auth.api.signUpEmail({ body: { name, email: userEmail, password }, asResponse: true });
  expect(response.ok).toBe(true);
  const body = await response.clone().json() as { user: { id: string } };
  await ensurePersonalWorkspaceForUser(db, { userId: body.user.id });
  await page.context().addCookies(sessionCookies(response));
  return db.user.findUniqueOrThrow({ where: { id: body.user.id }, include: { workspaceMemberships: true } });
}

function understanding(quote: string) {
  const evidence = [{ quote, segmentIndex: 0, startMs: 1_000, endMs: 4_000 }];
  const section = { summary: "先说清问题，再进入处理方式。", evidence };
  return {
    whatItSays: { summary: "这条内容说明先确认问题，再给出处理方式。", keyPoints: ["先说问题", "再给方法"], evidence },
    expression: { audience: section, opening: section, progression: { summary: "从问题到方法逐步推进。", steps: ["问题", "解释", "方法"], evidence }, support: section, emotionalOrRhetoricalShift: section, ending: section },
    methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT" as const, reason: "这条内容提供了一个可试用的表达方法。", items: [{ title: "先说问题，再进入方案", howTo: ["先说清用户正在遇到的问题，再进入你的处理方式。"], applicable: ["需要解释复杂问题时"], boundaries: ["只有一条素材依据，不能当作稳定规律。"], evidence }] },
    reusable: [{ content: "先拆信息再表达", whyUseful: "便于让复杂内容更容易理解。" }],
    doNotCopy: [],
    uncertain: [],
  };
}

test("saves, edits, versions, and privately manages an M1 method", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const user = await signIn(page);
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const quote = "先说清用户正在遇到的问题，再进入你的处理方式。";
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "方法来源视频", status: "READY", transcript: { create: { workspaceId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: quote, segments: [{ startMs: 1_000, endMs: 4_000, text: quote }] } } } });
  const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
  const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: user.id, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: ["先说问题", "再给方法"], summary: "先确认问题，再给出处理方式。", understanding: understanding(quote), transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });

  await page.goto(`/library/${source.id}`);
  const card = page.getByTestId("material-analysis-card");
  await expect(card).toContainText("可复用的创作方法");
  await expect(card.getByRole("button", { name: "保存为创作方法" })).toBeVisible();
  await card.getByRole("button", { name: "保存为创作方法" }).click();
  await expect(card.getByRole("button", { name: "保存创作方法", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "保存创作方法", exact: true }).click();
  await expect(card).toContainText("已保存为创作方法");

  await page.getByRole("link", { name: "查看创作方法", exact: true }).click();
  await expect(page).toHaveURL(/\/library\/methods$/);
  await expect(page.getByRole("link", { name: /先说问题，再进入方案/ })).toBeVisible();
  await page.getByRole("link", { name: /先说问题，再进入方案/ }).click();
  const detail = page.getByTestId("method-detail");
  await expect(detail).toContainText("仅自己可见");
  await expect(detail).toContainText("方法来源视频");
  await expect(detail).toContainText("查看");
  await detail.getByRole("button", { name: "编辑方法" }).click();
  await detail.getByLabel("创作方法名称").fill("先说问题，再给方案");
  await detail.getByLabel("怎么用").fill("先说清问题\n再给出自己的处理方式");
  await detail.getByRole("button", { name: "保存创作方法", exact: true }).click();
  await expect(detail).toContainText("创作方法已保存，新版本已经保留");
  await expect(detail).toContainText("先说问题，再给方案");
  await expect(detail).toContainText("第 2 次修改");

  await detail.getByRole("button", { name: "试用中", exact: true }).click();
  await expect(detail).toContainText("试用中");
  await db.transcript.update({ where: { id: transcript.id }, data: { fullText: `${quote} 来源后来更新。` } });
  await page.reload();
  await expect(page.getByTestId("method-detail")).toContainText("来源文字稿后来更新过");
  await expect(page.getByTestId("method-detail")).toContainText("查看当前来源");
  await page.getByTestId("method-detail").getByRole("button", { name: "常用", exact: true }).click();
  await expect(page.getByTestId("method-detail")).toContainText("创作方法状态已更新");
  expect(await page.getByTestId("method-detail").innerText()).not.toMatch(/MethodAsset|MethodVersion|PRIVATE|STALE|workspaceId|Transcript ID|Database|optimistic/);

  const methodId = (await db.methodAsset.findFirstOrThrow({ where: { workspaceId, ownerUserId: user.id } })).id;
  const otherRegistration = await auth.api.signUpEmail({ body: { name: "Methods Other", email: otherEmail, password }, asResponse: true });
  const otherBody = await otherRegistration.clone().json() as { user: { id: string } };
  await db.workspaceMember.create({ data: { workspaceId, userId: otherBody.user.id, role: "EDITOR" } });
  const otherContext = await browser.newContext({ baseURL: process.env.APP_URL ?? "http://localhost:3000" });
  await otherContext.addCookies(sessionCookies(otherRegistration));
  const otherPage = await otherContext.newPage();
  expect((await otherPage.request.get(`/api/methods/${methodId}`)).status()).toBe(404);
  expect((await otherPage.goto(`/library/methods/${methodId}`))?.status()).toBe(404);
  await otherContext.close();

  const blockedDelete = await page.request.delete(`/api/source-items/${source.id}`);
  expect(blockedDelete.status()).toBe(409);
  await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, data: { role: "VIEWER" } });
  await page.reload();
  await expect(page.getByTestId("method-detail").getByRole("button", { name: "编辑方法" })).toHaveCount(0);
  expect((await page.request.patch(`/api/methods/${methodId}`, { data: { status: "TRIAL" } })).status()).toBe(403);
  await expect(db.methodAsset.count({ where: { workspaceId, ownerUserId: user.id } })).resolves.toBe(1);
  await expect(db.methodAsset.findUniqueOrThrow({ where: { id: methodId } })).resolves.toMatchObject({ status: "CORE" });
  await expect(db.methodVersion.count({ where: { assetId: methodId } })).resolves.toBe(2);
  expect(analysis.id).toBeTruthy();
});

test("uses explicit method versions in Studio and records each real generation attempt", async ({ page }) => {
  test.setTimeout(90_000);
  const user = await signIn(page, studioEmail, "Studio Methods Owner");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId: user.id, provider: "LLM", config: { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: fixtureOrigin, apiKey: "methods-fixture-key", apiModelId: "kimi-2.6-fixture" } });
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "Studio 方法来源", status: "READY", transcript: { create: { workspaceId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: "先说清问题，再进入处理方式。", segments: [{ startMs: 1_000, endMs: 4_000, text: "先说清问题，再进入处理方式。" }] } } } });
  const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
  const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: user.id, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: ["问题", "方法"], summary: "Studio 方法来源", understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
  const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: user.id, status: "SAVED" } });
  const oldVersion = await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: "先说问题（旧版）", steps: ["先说清问题"], applicableScenarios: ["需要解释问题时"], boundaries: ["不要虚构经历"], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [{ quote: "先说清问题，再进入处理方式。" }], editedById: user.id } });
  const latestVersion = await db.methodVersion.create({ data: { assetId: asset.id, version: 2, title: "先说问题（最新版）", steps: ["先说清问题，再给方法"], applicableScenarios: ["需要解释复杂问题时"], boundaries: ["不要虚构经历"], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [{ quote: "第三方客户和收入案例不应进入 Prompt" }], editedById: user.id } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "方法版本锁定项目", sources: { create: { sourceItemId: source.id, role: "REFERENCE" } } } });
  await db.creativeBrief.create({ data: { workspaceId, projectId: project.id, createdById: user.id, topic: "可靠表达", angle: "先讲事实", audience: "内容团队", coreMessage: "我从来没有做过加盟业务。", background: "", keyPoints: [], structure: [], tone: "直接", risks: [] } });

  await page.goto(`/projects/${project.id}/studio`);
  const selector = page.getByTestId("studio-method-selector");
  await expect(selector).toContainText("这次不额外选择私人创作方法，也会自动使用公司默认方法");
  await page.getByRole("button", { name: "生成我的口播稿" }).click();
  await expect(page.getByLabel("口播稿正文")).toHaveValue(/我从来没有做过加盟业务/);
  const zeroMethodRun = await db.aIRun.findFirstOrThrow({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT", status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } });
  await expect(db.methodUsage.count({ where: { aiRunId: zeroMethodRun.id } })).resolves.toBe(0);
  expect(prompts.at(-1)).not.toContain('"selectedMethods":');

  await db.projectMethodSelection.create({ data: { projectId: project.id, methodAssetId: asset.id, methodVersionId: oldVersion.id, selectedByUserId: user.id } });
  await page.reload();
  await expect(selector).toContainText("这个创作方法后来修改过");
  await selector.getByRole("button", { name: "选择创作方法" }).click();
  const drawer = page.getByRole("dialog", { name: "选择创作方法" });
  const latest = drawer.locator("article").filter({ hasText: "先说问题（最新版）" });
  await expect(latest.getByRole("button", { name: "选择", exact: true })).toBeDisabled();
  await expect(latest.getByRole("button", { name: "已选择", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "取消", exact: true }).click();
  await expect(selector.getByRole("button", { name: "换用最新版", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "重新生成我的口播稿" }).click();
  await expect(page.getByLabel("口播稿标题")).toHaveValue("方法生成稿 2");
  await expect.poll(() => db.methodUsage.count({ where: { projectId: project.id, methodVersionId: oldVersion.id } })).toBe(1);
  expect(prompts.at(-1)).toContain("先说问题（旧版）");
  expect(prompts.at(-1)).not.toContain("第三方客户和收入案例");
  await selector.getByRole("button", { name: "换用最新版", exact: true }).click();
  await expect(selector).toContainText("先说问题（最新版）");
  await page.getByRole("button", { name: "重新生成我的口播稿" }).click();
  await expect(page.getByLabel("口播稿标题")).toHaveValue("方法生成稿 3");
  await expect.poll(() => db.methodUsage.count({ where: { projectId: project.id, methodVersionId: latestVersion.id } })).toBe(1);
  await page.getByLabel("口播稿正文").fill("人工修改后的口播稿。");
  await expect.poll(async () => (await db.motherContent.findUniqueOrThrow({ where: { projectId: project.id } })).body).toBe("人工修改后的口播稿。");

  await page.goto(`/library/methods/${asset.id}`);
  await page.getByTestId("method-detail").getByRole("button", { name: "已停用", exact: true }).click();
  await page.goto(`/projects/${project.id}/studio`);
  await expect(page.getByTestId("studio-method-selector")).toContainText("这个创作方法已经停用");
  const runCount = await db.aIRun.count({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT" } });
  await page.getByRole("button", { name: "重新生成我的口播稿" }).click();
  await expect(page.getByLabel("口播稿标题")).toHaveValue("方法生成稿 4");
  await expect.poll(() => db.aIRun.count({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT" } })).toBe(runCount + 1);
  const disabledRun = await db.aIRun.findFirstOrThrow({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT" }, orderBy: { createdAt: "desc" } });
  await expect(db.methodUsage.count({ where: { aiRunId: disabledRun.id } })).resolves.toBe(0);
  expect(prompts.at(-1)).not.toContain('"selectedMethods":');
  expect(await page.getByTestId("studio-method-selector").innerText()).not.toMatch(/ProjectMethodSelection|MethodUsage|MethodVersion|AIRun|context block|CORE|TRIAL|DISABLED|workspaceId|ownerUserId|version mismatch|stale method/);
});

test("completes one continuous first-phase journey from transcript to an editable saved draft", async ({ page }) => {
  test.setTimeout(120_000);
  const user = await signIn(page, journeyEmail, "First Phase Journey Owner");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId: user.id, provider: "LLM", config: { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: fixtureOrigin, apiKey: "methods-fixture-key", apiModelId: "kimi-2.6-fixture" } });
  const sourceFact = "来源作者在上海服务了三百家门店。";
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "连续旅程参考视频", status: "READY", transcript: { create: { workspaceId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: `${sourceFact}先说清用户遇到的问题，再进入自己的处理方式。`, segments: [{ startMs: 1_000, endMs: 5_000, text: `${sourceFact}先说清用户遇到的问题，再进入自己的处理方式。` }] } } } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "连续旅程创作", sources: { create: { sourceItemId: source.id, role: "REFERENCE" } } } });
  await db.creativeBrief.create({ data: { workspaceId, projectId: project.id, createdById: user.id, topic: "把复杂问题讲清楚", angle: "", audience: "", coreMessage: "", background: "", keyPoints: [], structure: [], tone: "", risks: [] } });

  await page.goto(`/library/${source.id}`);
  await expect(page.getByRole("heading", { name: "文字稿" })).toBeVisible();
  await expect(page.getByText(sourceFact, { exact: false })).toBeVisible();
  const analysisCard = page.getByTestId("material-analysis-card");
  await expect(analysisCard).toContainText("尚未理解");
  await analysisCard.getByRole("button", { name: "内容理解" }).dblclick();
  await expect(analysisCard).toContainText(/等待|处理中|正在整理内容理解/);
  await page.reload();
  await expect(page.getByTestId("material-analysis-card")).toContainText("这条内容是怎么讲的", { timeout: 20_000 });
  await expect(db.ingestJob.count({ where: { sourceItemId: source.id, jobType: "ANALYZE_MATERIAL" } })).resolves.toBe(1);

  const completedCard = page.getByTestId("material-analysis-card");
  await completedCard.getByText(/查看原文依据/).first().click();
  await expect(completedCard.getByText(sourceFact, { exact: false }).first()).toBeVisible();
  await completedCard.getByRole("button", { name: "保存为创作方法" }).click();
  await completedCard.getByRole("button", { name: "保存创作方法", exact: true }).dblclick();
  await expect(completedCard).toContainText("已保存为创作方法");
  await expect(db.methodAsset.count({ where: { workspaceId, ownerUserId: user.id } })).resolves.toBe(1);

  await completedCard.getByRole("link", { name: "查看创作方法" }).click();
  await page.getByRole("link", { name: /先说问题，再进入方案/ }).click();
  let detail = page.getByTestId("method-detail");
  await detail.getByRole("button", { name: "编辑方法" }).click();
  await detail.getByLabel("创作方法名称").fill("连续旅程方法");
  await detail.getByRole("button", { name: "保存创作方法", exact: true }).click();
  await expect(detail).toContainText("创作方法已保存，新版本已经保留");
  await detail.getByRole("button", { name: "试用中", exact: true }).click();
  await page.reload();
  detail = page.getByTestId("method-detail");
  await expect(detail).toContainText("连续旅程方法");
  await expect(detail).toContainText("试用中");
  await expect(detail).toContainText("可以在“我的创作”中按需选择");
  await detail.getByRole("link", { name: "去创作" }).click();

  await page.getByRole("link", { name: "连续旅程创作", exact: true }).click();
  await expect(page.getByRole("heading", { name: "连续旅程创作" })).toBeVisible();
  await page.getByLabel("我的核心观点").fill("我从来没有做过加盟业务。先讲清实际问题。 ");
  await page.getByLabel("给谁看").fill("普通内容团队成员");
  await page.getByLabel("有什么只有我们能讲的？").fill("我们只验证过两次内部流程，这是我自己的事实。");
  await page.getByRole("button", { name: "保存我的补充" }).click();
  await expect(page.getByText("我的补充已保存", { exact: false })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "创作上下文" }).click();
  const contextDrawer = page.getByRole("dialog", { name: "创作上下文" });
  const selector = contextDrawer.getByTestId("studio-method-selector");
  await selector.getByRole("button", { name: "选择创作方法" }).click();
  const drawer = page.getByRole("dialog", { name: "选择创作方法" });
  await expect(drawer).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const methodOption = drawer.locator("article").filter({ hasText: "连续旅程方法" });
  await methodOption.getByRole("button", { name: "选择", exact: true }).click();
  await drawer.getByRole("button", { name: "保存选择" }).click();
  await expect(selector).toContainText("连续旅程方法");
  await expect.poll(() => db.projectMethodSelection.count({ where: { projectId: project.id, selectedByUserId: user.id } })).toBe(1);
  await contextDrawer.getByRole("button", { name: "关闭" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.getByTestId("studio-method-selector")).toContainText("连续旅程方法");
  await expect(page.getByLabel("我的核心观点")).toHaveValue(/我从来没有做过加盟业务/);

  const runCount = await db.aIRun.count({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT" } });
  await page.getByRole("button", { name: "生成我的口播稿" }).dblclick();
  await expect(page.getByLabel("口播稿正文")).toHaveValue(/我从来没有做过加盟业务/, { timeout: 20_000 });
  await expect.poll(() => db.aIRun.count({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT" } })).toBe(runCount + 1);
  expect(prompts.at(-1)).toContain("连续旅程方法");
  expect(prompts.at(-1)).toContain("我们只验证过两次内部流程");
  expect(prompts.at(-1)).not.toContain(sourceFact);

  await page.getByLabel("口播稿正文").fill("人工修改并保存的连续旅程口播稿。");
  await expect.poll(async () => (await db.motherContent.findUniqueOrThrow({ where: { projectId: project.id } })).body).toBe("人工修改并保存的连续旅程口播稿。");
  const method = await db.methodAsset.findFirstOrThrow({ where: { workspaceId, ownerUserId: user.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  const generation = await db.aIRun.findFirstOrThrow({ where: { projectId: project.id, action: "GENERATE_MOTHER_CONTENT" }, orderBy: { createdAt: "desc" } });
  await expect(db.methodUsage.count({ where: { aiRunId: generation.id, methodVersionId: method.versions[0]!.id } })).resolves.toBe(1);

  await page.reload();
  await expect(page.getByLabel("口播稿正文")).toHaveValue("人工修改并保存的连续旅程口播稿。");
  await expect(page.getByTestId("studio-method-selector")).toContainText("连续旅程方法");
  await expect(page.getByLabel("有什么只有我们能讲的？")).toHaveValue("我们只验证过两次内部流程，这是我自己的事实。");
  expect(await page.locator("main.app-main").innerText()).not.toMatch(/MaterialAnalysis|IngestJob|Queue|Worker|AIRun|ApiUsage|Workspace|Provider|MethodAsset|MethodVersion|MethodUsage|ProjectMethodSelection|Transcript ID|SourceItem ID|enum|JSON|Schema|Prompt|context|token|stale|version mismatch|optimistic lock/i);
});

test("shows personal method status and real 30-day usage without inferring a habit", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const user = await signIn(page, creatorMethodsEmail, "Creator Methods Owner");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "单条内容方法来源", status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: "可靠的方法来源。", segments: [] } } } });
  const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
  const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: user.id, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
  const singleSource = { sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt };
  async function singleMethod(status: "CORE" | "TRIAL" | "SAVED" | "DISABLED", title: string) {
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: user.id, status } });
    const version = await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title, steps: ["先说清问题"], applicableScenarios: ["需要解释时"], boundaries: ["不要虚构事实"], ...singleSource, evidence: [], editedById: user.id } });
    return { asset, version };
  }
  const core = await singleMethod("CORE", "我确认的常用方法");
  const trial = await singleMethod("TRIAL", "我正在试的方法");
  const disabled = await singleMethod("DISABLED", "我已停用的方法");

  const benchmark = await db.benchmarkAccount.create({ data: { workspaceId, platform: "DOUYIN", externalAccountId: `creator-methods-${runId}`, name: "方法来源账号", createdById: user.id } });
  const samples: Array<{ sourceItemId: string; materialAnalysisId: string }> = [];
  for (let index = 0; index < 6; index += 1) {
    const item = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", externalId: `creator-method-source-${runId}-${index}`, title: `账号代表内容 ${index + 1}`, status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: `账号依据 ${index + 1}`, segments: [] } } } });
    const itemTranscript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: item.id } });
    const itemAnalysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: item.id, createdById: user.id, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: itemTranscript.updatedAt } });
    samples.push({ sourceItemId: item.id, materialAnalysisId: itemAnalysis.id });
  }
  const study = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmark.id, createdById: user.id, version: 1, status: "COMPLETED", sampleCount: 6, insufficientSamples: false, output: {}, samples: { create: samples } } });
  const savedAsset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: user.id, status: "SAVED" } });
  await db.methodVersion.create({ data: { assetId: savedAsset.id, version: 1, title: "刚收藏的对标方法", steps: ["只作为表达参考"], applicableScenarios: ["需要时"], boundaries: ["不复制来源事实"], sourceBenchmarkStudyId: study.id, evidence: [], editedById: user.id } });

  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "最近使用项目" } });
  async function run(status: "SUCCEEDED" | "FAILED") { return db.aIRun.create({ data: { workspaceId, projectId: project.id, userId: user.id, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status, inputSummary: {}, createdAt: new Date(), finishedAt: new Date() } }); }
  const [coreRun, trialRun, disabledRun] = await Promise.all([run("SUCCEEDED"), run("FAILED"), run("SUCCEEDED")]);
  await run("SUCCEEDED");
  await db.methodUsage.createMany({ data: [
    { projectId: project.id, methodAssetId: core.asset.id, methodVersionId: core.version.id, aiRunId: coreRun.id, userId: user.id },
    { projectId: project.id, methodAssetId: trial.asset.id, methodVersionId: trial.version.id, aiRunId: trialRun.id, userId: user.id },
    { projectId: project.id, methodAssetId: disabled.asset.id, methodVersionId: disabled.version.id, aiRunId: disabledRun.id, userId: user.id },
  ] });

  await page.goto("/projects");
  await page.getByRole("link", { name: "查看创作方法" }).click();
  await expect(page.getByRole("heading", { name: "创作方法", exact: true })).toBeVisible();
  await expect(page.getByText(/不会因为一次收藏或一次生成/)).toBeVisible();
  await expect(page.getByTestId("creator-methods-summary")).toContainText("4 次口播稿生成记录");
  await expect(page.getByTestId("core-methods")).toContainText("我确认的常用方法");
  await expect(page.getByTestId("core-methods")).not.toContainText("刚收藏的对标方法");
  await expect(page.getByTestId("trial-methods")).toContainText("我正在试的方法");
  await expect(page.getByTestId("saved-methods")).toContainText("刚收藏的对标方法");
  await expect(page.getByTestId("saved-methods")).toContainText("来源：方法来源账号 · 本次 6 条代表内容研究");
  const recent = page.getByTestId("recently-used-methods");
  await expect(recent).toContainText("实际尝试 1 次 · 成功生成 1 次 · 生成失败 0 次");
  await expect(recent).toContainText("实际尝试 1 次 · 成功生成 0 次 · 生成失败 1 次");
  await page.getByTestId("disabled-methods").locator("summary").click();
  await expect(page.getByTestId("disabled-methods")).toContainText("我已停用的方法");
  await expect(page.getByTestId("disabled-methods")).toContainText("过去使用过，当前已停用");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("main.app-main").innerText()).not.toMatch(/CreatorMethodProfile|PersonalMethodProfile|MethodUsage|AIRun|MethodAsset|MethodVersion|CORE|TRIAL|DISABLED|Workspace|ownerUserId|usage count query|aggregation|score|confidence/i);

  const otherRegistration = await auth.api.signUpEmail({ body: { name: "Creator Methods Other", email: creatorMethodsOtherEmail, password }, asResponse: true });
  const other = await otherRegistration.clone().json() as { user: { id: string } };
  await db.workspaceMember.create({ data: { workspaceId, userId: other.user.id, role: "EDITOR" } });
  const otherContext = await browser.newContext({ baseURL: process.env.APP_URL ?? "http://localhost:3000" });
  await otherContext.addCookies(sessionCookies(otherRegistration));
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/projects/methods");
  await expect(otherPage.getByText("还没有自己的创作方法")).toBeVisible();
  expect(await otherPage.locator("main.app-main").innerText()).not.toContain("我确认的常用方法");
  await otherContext.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId("core-methods").getByRole("link", { name: "查看/调整方法" }).click();
  await page.getByTestId("method-detail").getByRole("button", { name: "试用中", exact: true }).click();
  await expect(page.getByTestId("method-detail")).toContainText("创作方法状态已更新");
  await page.goto("/projects/methods");
  await expect(page.getByTestId("core-methods")).not.toContainText("我确认的常用方法");
  await expect(page.getByTestId("trial-methods")).toContainText("我确认的常用方法");
});

test("shows the published company method compactly in Studio without calling AI", async ({ page }) => {
  const user = await signIn(page, studioDefaultEmail, "Studio Default Method");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const codes = ["AUDIENCE", "TOPIC", "OPENING", "BODY", "EVIDENCE", "ENDING", "BOUNDARY"] as const;
  const labels = { AUDIENCE: "我们主要给谁做内容", TOPIC: "什么样的选题优先做", OPENING: "开头怎么进入", BODY: "正文怎么讲", EVIDENCE: "案例和数据怎么用", ENDING: "怎么收尾", BOUNDARY: "哪些事情不要做" } as const;
  const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: user.id, status: "CORE" } });
  await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: "鑫世界默认创作方法", workspaceDefaultKey: "DEFAULT_CONTENT", steps: { kind: "WORKSPACE_DEFAULT_CONTENT_METHOD", schemaVersion: "workspace-default-content-method-v1", publicationStatus: "PUBLISHED", origin: "HUMAN", createdFromVersion: null, publishedAt: new Date().toISOString(), publishedById: user.id, sections: codes.map((code) => ({ code, items: [{ text: `${labels[code]}的内部指南。`, sourceRefs: [{ type: "OWN_EXPERIENCE", referenceId: `internal-${code}`, label: `内部依据 ${code}` }] }] })) }, applicableScenarios: [], boundaries: [], evidence: [], editedById: user.id } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "默认方法 Studio", motherContent: { create: { workspaceId, title: "测试口播稿", body: "测试开头\n\n测试正文", outline: ["开头", "正文"], createdById: user.id } } } });

  await page.goto(`/projects/${project.id}/studio`);
  const method = page.getByTestId("studio-default-method");
  await expect(method).toContainText("鑫世界默认创作方法 · V1");
  await expect(method).toContainText("已自动应用");
  await expect(method).toContainText("根据当前内容状态推荐");
  for (const action of ["改开头", "更像本人说话", "先写观点版", "换个不用数据的角度", "补真实证据", "检查事实风险"]) await expect(method.getByRole("button", { name: action, exact: true })).toBeVisible();
  await method.getByText("更多基础动作", { exact: true }).click();
  for (const action of ["想选题", "重写正文", "精简一点", "按鑫世界方法优化"]) await expect(method.getByRole("button", { name: action, exact: true })).toBeVisible();
  await expect(method).not.toContainText("我们主要给谁做内容的内部指南");
  await method.getByRole("button", { name: "查看完整方法" }).click();
  const drawer = page.getByRole("dialog", { name: "鑫世界默认创作方法 V1" });
  for (const label of Object.values(labels)) await expect(drawer.getByRole("heading", { name: label })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("main.app-main").innerText()).not.toMatch(/MethodVersion|Provider|Schema|model selector/i);
});
