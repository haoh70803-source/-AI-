import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { test, expect, type BrowserContext } from "@playwright/test";
import { auth } from "../lib/auth";

let fixture: Server; let workspaceId = ""; let userId = ""; let accountId = ""; let trendKey = ""; let projectId = ""; let legacyStudyId = ""; let visualSessionId = ""; let visualResultId = ""; let calls = 0;
let cookieValues: Parameters<BrowserContext["addCookies"]>[0] = [];
test.beforeAll(async () => {
  fixture = createServer(async (request, response) => {
    let input = ""; for await (const chunk of request) input += chunk.toString();
    const accountResearch = input.includes("BENCHMARK_WORK");
    const trendResearch = input.includes("TREND_SNAPSHOT");
    const breakdownResearch = input.includes("breakdowns");
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    const answer = accountResearch ? { sections: [{ title: "账号样本观察", text: "选定作品的正文记录了观众的问题，需要更多作品才能判断账号整体策略。", sourceRefs: ["B2"], limitation: "仅覆盖已保存的当前时间窗口样本。" }], accountFindings: [{ accountId, sampleScope: "WINDOW", audienceTask: "理解受众问题", themes: "选定作品讨论了一个问题", openings: "缺少开头边界", structure: "无法从单条推断全账号结构", directionChange: "没有连续样本，无法判断", transferable: "核对论据", doNotCopy: "不复制独特文案", sourceRefs: ["B1", "B2"], limitation: "仅当前窗口样本" }] }
      : trendResearch ? { sections: [{ title: "趋势观察边界", text: "已保存榜单快照，但尚无代表作品证据。", sourceRefs: ["T1"], limitation: "只有榜单数据，缺少作品与作者记录。" }], topics: [{ title: "核实真实问题", audienceTask: "确认观众需求", coreBenefit: "提供可核对的问题解释", angle: "先找代表作品", whyNow: "保存的榜单提示仍有关注", trendRefs: ["T1"], benchmarkRefs: [], historyRefs: [], profileRefs: [], evidenceGaps: ["没有代表作品"], nextValidation: "主动查询并收录作品", evergreen: false, sourceRefs: ["T1"], limitation: "榜单不是内容证据" }] }
        : breakdownResearch ? { sections: [{ title: "材料观察边界", text: "访谈记录说明了一个问题。", sourceRefs: ["M1"], limitation: "只有一份材料" }], breakdowns: [{ materialRef: "M1", audienceTask: "了解问题", openingPromise: "说明问题", structure: "先记录再核对", coreClaims: "观点待核实", evidence: "访谈正文", turn: "转向验证", cta: "继续核对", conditions: "仅此访谈", doNotCopy: "个人表达", sourceRefs: ["M1"], limitation: "单条资料" }] }
        : { sections: [{ title: "访谈中的可核对观点", text: "先记录真实问题，再逐一核对证据。", sourceRefs: ["M1"], limitation: "本结果来自本地测试访谈，仅验证产品链路。" }] };
    response.end(JSON.stringify({ id: "research-e2e-fixture", model: "deepseek-v4-flash", choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 20 } }));
  });
  await new Promise<void>(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address(); if (!address || typeof address === "string") throw new Error("Fixture unavailable");
  const signup = await auth.api.signUpEmail({ body: { name: "Research E2E", email: `research-ui-${randomUUID()}@example.test`, password: "research-safe-fixture-password" }, asResponse: true });
  userId = (await signup.clone().json() as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "研究交接验收项目" } })).id;
  const primaryBranch = await db.draftBranch.create({ data: { workspaceId, projectId, title: "主稿", createdById: userId, updatedById: userId } });
  await db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: primaryBranch.id } });
  cookieValues = signup.headers.getSetCookie().map(value => { const pair = value.split(";")[0]!; const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; });
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { provider: "DEEPSEEK", modelId: "deepseek-v4-flash", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-research-fixture" } });
  const interview = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", title: "验收用访谈记录", rawText: "先记录真实问题，再逐一核对证据。", status: "READY" } });
  const account = await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: `research-ui-${randomUUID()}`, name: "验收用对标账号", researchCategory: "知识" } });
  accountId = account.id;
  const externalId = `work-${randomUUID()}`;
  const work = await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId, title: "验收用真实作品", url: "https://example.test/benchmark-work", publishedAt: new Date("2026-09-01"), metadata: {} } });
  await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "DOUYIN", externalId, title: "验收作品正文", rawText: "观察到的作品正文", status: "READY" } });
  const batch = await db.benchmarkCollectionRun.create({ data: { workspaceId, benchmarkAccountId: accountId, requestedById: userId, status: "COMPLETED", rangeStart: new Date("2026-08-01"), rangeEnd: new Date("2026-09-20"), seenCount: 1, inRangeCount: 1, items: { create: { snapshotId: work.id, titleSnapshot: work.title, urlSnapshot: work.url, metadataSnapshot: {}, publishedAt: work.publishedAt, inRange: true } } } });
  await db.benchmarkMetricObservation.create({ data: { snapshotId: work.id, collectionRunId: batch.id, metrics: { likes: 12, comments: null } } });
  const legacyAccount = await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: `legacy-ui-${randomUUID()}`, name: "验收用历史研究账号" } });
  const legacyMaterial = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "DOUYIN", externalId: `legacy-work-${randomUUID()}`, title: "历史研究来源作品", rawText: "旧研究样本中实际保存的文字", status: "READY" } });
  const legacyStudy = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: legacyAccount.id, createdById: userId, version: 1, status: "COMPLETED", sampleCount: 1, insufficientSamples: true, samples: { create: { sourceItemId: legacyMaterial.id } } }, include: { samples: true } });
  legacyStudyId = legacyStudy.id;
  await db.benchmarkStudy.update({ where: { id: legacyStudyId }, data: { output: { topicDirections: [{ name: "历史观察", summary: "旧研究结论有明确的样本来源", occurrenceSampleIds: [legacyStudy.samples[0]!.id], exceptionSampleIds: [], evidence: [{ sampleId: legacyStudy.samples[0]!.id, quote: "旧研究样本中实际保存的文字" }] }], openingPatterns: [], structures: [], persuasionMethods: [], expressionHabits: [], endings: [], commonMethods: [], exceptions: [], repeatedCaseNotes: [], stableMethodsFound: false, message: "保存的旧研究" } } });
  const externalKey = `trend-${randomUUID()}`;
  trendKey = Buffer.from(JSON.stringify(["REDFOX", "DOUYIN", "HOT", externalKey])).toString("base64url");
  await db.trendSnapshot.createMany({ data: [
    { workspaceId, provider: "REDFOX", platform: "DOUYIN", trendType: "HOT", externalKey, title: "验收用历史趋势", keyword: "历史趋势", rank: 10, metrics: { likes: 5, comments: null }, windowStart: new Date("2025-03-01"), windowEnd: new Date("2025-03-07"), observedAt: new Date("2025-03-08") },
    { workspaceId, provider: "REDFOX", platform: "DOUYIN", trendType: "HOT", externalKey, title: "验收用历史趋势", keyword: "历史趋势", rank: 4, metrics: { likes: 12, comments: null }, windowStart: new Date("2025-04-01"), windowEnd: new Date("2025-04-07"), observedAt: new Date("2025-04-08") },
  ] });
  const visualSession = await db.researchSession.create({ data: { workspaceId, createdById: userId, title: "已保存的可核验研究", entryTemplate: "DIRECT", requestKey: randomUUID() } });
  visualSessionId = visualSession.id;
  const refs = [{ ref: "M1", kind: "MATERIAL", objectId: interview.id, title: interview.title, href: `/library/${interview.id}`, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: "资料正文", excerpt: "先记录真实问题，再逐一核对证据。", version: null }];
  const visualBlocks = [
    { id: "finding", type: "text", title: "访谈中的证据", text: "先记录问题，再核对来源与局限。", provenance: "AI_INTERPRETATION", sourceRefs: ["M1"], limitation: "仅依据一条访谈正文。" },
    { id: "count", type: "metrics", title: "当前样本计数", provenance: "COMPUTED", sourceRefs: ["M1"], limitation: "只计当前选中的资料", items: [{ label: "有正文资料", value: 1, unit: "条", validCount: 1, denominator: 1, method: "按实际读取的资料记录计数" }] },
    { id: "table", type: "table", title: "资料覆盖", provenance: "REAL_DATA", sourceRefs: ["M1"], limitation: null, columns: ["资料", "正文"], rows: [{ cells: ["验收用访谈记录", "已读取"], sourceRefs: ["M1"] }] },
    { id: "bars", type: "bar_chart", title: "资料数量", provenance: "COMPUTED", sourceRefs: ["M1"], limitation: "仅当前资料", unit: "条", method: "按资料记录计数", points: [{ label: "当前选中", value: 1, sourceRefs: ["M1"] }], lowerIsBetter: false },
    { id: "line", type: "line_chart", title: "样本读取", provenance: "COMPUTED", sourceRefs: ["M1"], limitation: "单一时间点，不构成增长趋势", unit: "条", method: "读取记录计数", points: [{ label: "本次", value: 1, sourceRefs: ["M1"] }], lowerIsBetter: false },
    { id: "sources", type: "sources", title: "来源", provenance: "REAL_DATA", sourceRefs: ["M1"], limitation: null, refs },
  ];
  visualResultId = (await db.researchRun.create({ data: { workspaceId, sessionId: visualSessionId, requestedById: userId, requestKey: randomUUID(), requestHash: "visual-fixture", question: "这条访谈如何核对证据？", version: 1, status: "COMPLETED", stage: "COMPLETED", savedAt: new Date(), inputScope: { materialIds: [interview.id], benchmarkAccountIds: [], trendKeys: [], notes: "", useCreatorProfile: false, useOwnArtifacts: false }, sourceRefs: refs, coverage: { requested: 1, observed: 1, readable: 1, timed: 0, visual: 0, aiSampleCount: 1, truncated: false, sampling: "SELECTED", timeRange: { from: null, to: null }, gaps: ["没有直接画面检视"] }, blocks: visualBlocks } })).id;
});

test("legacy benchmark result remains readable and can be explicitly shared without AI", async ({ page }) => {
  test.setTimeout(180000); calls = 0;
  await page.context().addCookies(cookieValues);
  await page.goto(`/research/results/study/${legacyStudyId}`);
  await expect(page.getByRole("heading", { name: "验收用历史研究账号 · 历史研究 1" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("heading", { name: "历史样本范围" })).toBeVisible();
  await expect(page.getByText("旧研究结论有明确的样本来源", { exact: true })).toBeVisible();
  await expect(page.getByText("旧研究样本中实际保存的文字", { exact: true })).toBeVisible();
  await page.getByText("审阅将加入项目的完整内容", { exact: false }).click();
  await page.getByLabel("我已检查将共享的完整预览").check();
  await page.getByLabel("目标项目").selectOption(projectId);
  await page.getByRole("button", { name: "加入项目", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开项目产出" })).toBeVisible();
  expect(calls).toBe(0);
});

test("historical trend list, stable detail and explicit opportunity research", async ({ page }, info) => {
  test.setTimeout(180000); calls = 0;
  await page.context().addCookies(cookieValues);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto("/research/trends");
  await expect(page.getByRole("heading", { name: "趋势", exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("heading", { name: "验收用历史趋势" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("trend-list-1680.png") });
  await page.goto(`/research/trends/${trendKey}`);
  await expect(page.getByRole("heading", { name: "排名与快照历史" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("共 2 次观察")).toBeVisible();
  await page.getByRole("button", { name: "关注趋势", exact: true }).click();
  await expect(page.getByRole("button", { name: "已关注 · 取消关注" })).toBeVisible();
  await page.getByRole("button", { name: "主动查询相关作品" }).click();
  await expect(page.locator(".research-error[role=alert]")).toContainText(/未配置|不可用/);
  await expect(page.getByText("共 2 次观察")).toBeVisible();
  await page.screenshot({ path: info.outputPath("trend-detail-1680.png") });
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("trend-detail-390.png") });
  await page.getByRole("link", { name: "研究此趋势 / 找选题" }).click();
  await expect(page.getByText("趋势：验收用历史趋势")).toBeVisible();
  await expect(page.getByRole("form", { name: "开始研究", exact: true })).toHaveAttribute("data-ready", "true");
  await page.getByLabel("你想研究什么？").fill("这个趋势有哪些证据缺口？");
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  await expect(page).toHaveURL(/\/research\/session\//, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "选题：核实真实问题" })).toBeVisible({ timeout: 60000 });
  expect(calls).toBe(1);
  await page.goto("/research/trends?state=FOLLOWED");
  await expect(page.getByRole("heading", { name: "验收用历史趋势" })).toBeVisible();
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "最近查看的趋势" })).toBeVisible();
  await expect(page.getByRole("link", { name: /验收用历史趋势/ })).toBeVisible();
});

test("content breakdown uses readable Material and renders its cited fields", async ({ page }) => {
  test.setTimeout(180000); calls = 0;
  await page.context().addCookies(cookieValues);
  await page.goto("/research");
  await expect(page.getByRole("form", { name: "开始研究", exact: true })).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "内容拆解", exact: true }).click();
  await page.getByLabel("你想研究什么？").fill("这份访谈怎样提出问题和证据？");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await page.getByLabel("验收用访谈记录", { exact: true }).check();
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  await expect(page).toHaveURL(/\/research\/session\//, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "内容拆解：验收用访谈记录" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("观众任务：了解问题", { exact: false })).toBeVisible();
  expect(calls).toBe(1);
});

test("benchmark account list, four tabs and scoped research launch render real saved data", async ({ page }, info) => {
  test.setTimeout(180000);
  calls = 0;
  await page.context().addCookies(cookieValues);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto("/research/benchmarks");
  await expect(page.getByRole("heading", { name: "对标账号", exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("验收用对标账号", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("benchmark-list-1680.png") });
  await page.getByText("发现并添加账号", { exact: true }).click();
  await page.getByLabel("账号名称或关键词").fill("测试账号");
  await page.getByRole("button", { name: "查询账号" }).click();
  await expect(page.locator(".research-benchmark-add .research-error")).toContainText(/未配置|不可用/);
  await expect(page.getByText("验收用对标账号", { exact: true })).toBeVisible();
  await page.goto(`/research/benchmarks/${accountId}`);
  await expect(page.getByText("当前观察范围")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("当前页可读正文")).toBeVisible();
  await page.screenshot({ path: info.outputPath("benchmark-overview-1680.png") });
  await page.getByRole("link", { name: "作品", exact: true }).click();
  await expect(page.getByRole("link", { name: "验收用真实作品" })).toBeVisible();
  await expect(page.getByText("缺失", { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: info.outputPath("benchmark-works-1366.png") });
  await page.getByRole("link", { name: "数据与规律" }).click();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "账号详情" }).getByRole("link", { name: "研究成果" }).click();
  await expect(page.getByText("尚无已保存的账号研究")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/research/benchmarks/${accountId}`);
  await expect(page.getByText("当前观察范围")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("benchmark-overview-390.png") });
  await page.getByRole("link", { name: "研究这个账号" }).click();
  await expect(page).toHaveURL(new RegExp(`accounts=${accountId}`));
  await expect(page.getByText("对标账号：验收用对标账号")).toBeVisible();
  await expect(page.getByRole("form", { name: "开始研究", exact: true })).toHaveAttribute("data-ready", "true");
  expect(calls).toBe(0);
  await page.getByLabel("你想研究什么？").fill("这个账号有哪些可核验的内容规律？");
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  await expect(page).toHaveURL(/\/research\/session\//, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "账号研究：验收用对标账号" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("观察到的作品正文", { exact: false }).first()).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "保存本次成果" }).click();
  await page.getByRole("link", { name: "阅读已保存成果" }).click();
  await expect(page).toHaveURL(/\/research\/results\/run\//);
  expect(calls).toBe(1);
});
test.afterAll(async () => { if (legacyStudyId) await db.benchmarkStudy.delete({ where: { id: legacyStudyId } }); if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); if (userId) await db.user.delete({ where: { id: userId } }); if (fixture) await new Promise<void>(resolve => fixture.close(() => resolve())); await db.$disconnect(); });

test("private research question, follow-up, save and durable reading from the UI", async ({ page }, info) => {
  test.setTimeout(180000);
  calls = 0;
  await page.context().addCookies(cookieValues);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "开始一次研究" })).toBeVisible();
  await expect(page.getByRole("form", { name: "开始研究", exact: true })).toHaveAttribute("data-ready", "true");
  expect(calls).toBe(0);
  await page.screenshot({ path: info.outputPath("research-home-1680.png") });
  await page.getByLabel("你想研究什么？").fill("这段访谈说明了什么？");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await page.getByLabel("验收用访谈记录", { exact: true }).check();
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  await expect(page).toHaveURL(/\/research\/session\//, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "访谈中的可核对观点" })).toBeVisible({ timeout: 60000 });
  expect(calls).toBe(1);
  await expect(page.getByText("AI 判断", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("research-session-1680.png") });
  await page.getByRole("button", { name: "保存本次成果" }).click();
  await page.getByRole("link", { name: "阅读已保存成果" }).click();
  await expect(page).toHaveURL(/\/research\/results\/run\//);
  const resultUrl = page.url();
  await expect(page.getByText("先记录真实问题，再逐一核对证据。", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "本次数据范围" })).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByText("审阅将加入项目的完整内容", { exact: false })).toBeVisible();
  await page.getByText("审阅将加入项目的完整内容", { exact: false }).click();
  await page.getByLabel("我已检查将共享的完整预览").check();
  await page.getByLabel("目标项目").selectOption(projectId);
  await page.getByRole("button", { name: "加入项目", exact: true }).click();
  await page.getByRole("link", { name: "打开项目产出" }).click();
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.getByText("访谈中的可核对观点", { exact: false }).first()).toBeVisible({ timeout: 60000 });
  expect(calls).toBe(1);
  await page.getByRole("link", { name: "从此项目开始研究" }).click();
  await expect(page).toHaveURL(new RegExp(`projectId=${projectId}`));
  await expect(page.getByRole("heading", { name: "开始一次研究" })).toBeVisible();
  await page.goto(resultUrl);
  await page.getByText("审阅将加入项目的完整内容", { exact: false }).click();
  await page.getByLabel("我已检查将共享的完整预览").check();
  await page.getByLabel("目标项目").selectOption(projectId);
  await page.getByRole("button", { name: "加入项目并开始创作" }).click();
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  expect(calls).toBe(1);
  await page.goto(resultUrl);
  await page.getByRole("link", { name: "继续研究", exact: true }).click();
  await page.getByLabel("继续追问", { exact: true }).fill("还应该核实什么？");
  await page.getByRole("button", { name: "继续研究", exact: true }).click();
  await expect(page.getByRole("heading", { name: "访谈中的可核对观点" })).toHaveCount(2, { timeout: 60000 });
  expect(calls).toBe(2);
  await page.goto("/research/results");
  await expect(page.getByRole("heading", { name: "这段访谈说明了什么？", exact: true })).toBeVisible();
  await page.goto(resultUrl);
  await expect(page.getByRole("heading", { name: "这段访谈说明了什么？", exact: true })).toBeVisible();
  for (const width of [1366, 390]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); if (width === 390) await expect.poll(async () => (await page.locator(".research-main-pane").boundingBox())?.width ?? 0).toBeGreaterThan(300); await page.screenshot({ path: info.outputPath(`research-result-${width}.png`) }); }
  expect(calls).toBe(2);
});

test("all eight Research pages render at desktop, laptop and narrow widths", async ({ page }, info) => {
  test.setTimeout(240000);
  const renderErrors: string[] = [];
  page.on("pageerror", error => renderErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") renderErrors.push(message.text()); });
  await page.context().addCookies(cookieValues);
  const routes = [
    { name: "home", path: "/research", heading: "开始一次研究" },
    { name: "trends", path: "/research/trends", heading: "趋势" },
    { name: "trend-detail", path: `/research/trends/${trendKey}`, heading: "验收用历史趋势" },
    { name: "benchmarks", path: "/research/benchmarks", heading: "对标账号" },
    { name: "benchmark-detail", path: `/research/benchmarks/${accountId}`, heading: "验收用对标账号" },
    { name: "results", path: "/research/results", heading: "研究成果" },
    { name: "result-detail", path: `/research/results/run/${visualResultId}`, heading: "这条访谈如何核对证据？" },
    { name: "session", path: `/research/session/${visualSessionId}`, heading: "已保存的可核验研究" },
  ];
  for (const width of [1680, 1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading, exact: true }).first()).toBeVisible({ timeout: 60000 });
      if (route.name === "result-detail") { await expect(page.getByText("AI 判断", { exact: true }).first()).toBeVisible(); await expect(page.getByText("系统计算", { exact: true }).first()).toBeVisible(); }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${route.name}-${width}.png`) });
    }
  }
  expect(renderErrors.filter(message => /Hydration failed|<title> tags/.test(message))).toEqual([]);
});

test("empty Research workspace and unavailable Provider preserve readable pages", async ({ page }) => {
  test.setTimeout(120000);
  const signup = await auth.api.signUpEmail({ body: { name: "Empty Research", email: `empty-research-${randomUUID()}@example.test`, password: "empty-research-fixture-password" }, asResponse: true });
  const user = (await signup.clone().json() as { user: { id: string } }).user.id;
  const emptyWorkspace = (await ensurePersonalWorkspaceForUser(db, { userId: user })).id;
  try {
    const cookies = signup.headers.getSetCookie().map(value => { const pair = value.split(";")[0]!; const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; });
    await page.context().addCookies(cookies);
    await page.goto("/research");
    await expect(page.getByText("还没有研究会话")).toBeVisible();
    await page.goto("/research/trends");
    await expect(page.getByText("暂无趋势快照")).toBeVisible();
    await page.getByRole("button", { name: "更新今日热门榜" }).click();
    await expect(page.getByRole("status").filter({ hasText: /未配置/ })).toBeVisible();
    await expect(page.getByText("暂无趋势快照")).toBeVisible();
    await page.goto("/research/benchmarks");
    await expect(page.getByText("还没有对标账号")).toBeVisible();
    await page.goto("/research/results");
    await expect(page.getByText("还没有保存研究成果")).toBeVisible();
  } finally {
    await db.workspace.delete({ where: { id: emptyWorkspace } });
    await db.user.delete({ where: { id: user } });
  }
});
