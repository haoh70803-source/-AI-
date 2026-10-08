import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { expect, test } from "@playwright/test";

const runId = randomUUID(); const email = `today-e2e-${runId}@example.test`; const password = "safe-e2e-password";

test.afterAll(async () => {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) { await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } }); await db.user.delete({ where: { id: user.id } }); }
  await db.$disconnect();
});

test("today recommendation → evidence → idea/project, deterministic copy and viewer RBAC", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register"); await page.getByLabel("姓名").fill("Today E2E Owner"); await page.getByLabel("邮箱").fill(email); await page.getByLabel("密码").fill(password); await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Today Recommendation E2E"); await page.getByRole("button", { name: "创建 Workspace" }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } }); const membership = user.workspaceMemberships[0]!; const workspaceId = membership.workspaceId;
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); const end = new Date(now); end.setHours(23, 59, 59, 999);
  await db.creatorProfile.create({ data: { workspaceId, userId: user.id, displayName: "内容负责人", positioning: "AI 内容工作流", targetAudience: "内容团队", tone: "务实", preferredStyle: "案例拆解", forbiddenStyle: "夸张承诺", coreTopics: ["AI", "内容工作流"], personalViews: [], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [], notes: "" } });
  await db.trendSnapshot.create({ data: { workspaceId, provider: "FIXTURE", platform: "DOUYIN", trendType: "HOT", externalKey: `today-trend-${runId}`, title: "AI 内容团队正在重做工作流", keyword: "AI 内容工作流", rank: 3, metrics: {}, windowStart: start, windowEnd: end, observedAt: now } });
  const benchmark = await db.benchmarkAccount.create({ data: { workspaceId, platform: "DOUYIN", externalAccountId: `benchmark-${runId}`, name: "工作流研究员", createdById: user.id } });
  await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: benchmark.id, platform: "DOUYIN", externalId: `benchmark-work-${runId}`, title: "团队内容复盘的三个断点", url: "https://www.douyin.com/video/fixture", metadata: { contentType: "VIDEO" }, observedAt: now } });
  await db.sourceItem.createMany({ data: [{ workspaceId, createdById: user.id, sourceType: "TEXT", title: "内容证据库搭建方法", status: "READY" }, { workspaceId, createdById: user.id, sourceType: "TEXT", title: "选题会如何减少重复劳动", status: "READY" }] });

  await page.goto("/discovery"); await expect(page.getByRole("heading", { name: "今天值得看", exact: true })).toBeVisible(); await expect(page.getByText("AI 推荐", { exact: true })).toHaveCount(0);
  const generatedResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/discovery/recommendations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "生成今日线索" }).click();
  const generatedResponse = await generatedResponsePromise;
  expect(generatedResponse.status(), await generatedResponse.text()).toBe(200);
  await expect(page.getByRole("heading", { name: "AI 内容团队正在重做工作流" })).toBeVisible();
  expect(await db.apiUsage.count({ where: { workspaceId, provider: "REDFOX" } })).toBe(0); expect(await db.aIRun.count({ where: { workspaceId, action: "GENERATE_TODAY_RECOMMENDATIONS" } })).toBe(0);
  await page.getByRole("link", { name: /查看依据/ }).first().click(); await expect(page.getByRole("heading", { name: "真实依据" })).toBeVisible();
  expect(await db.apiUsage.count({ where: { workspaceId, provider: "REDFOX" } })).toBe(0); expect(await db.aIRun.count({ where: { workspaceId, action: "GENERATE_TODAY_RECOMMENDATIONS" } })).toBe(0);
  for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) { await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }
  await page.setViewportSize({ width: 1280, height: 900 }); await page.getByRole("button", { name: "开始创作" }).click(); await expect(page).toHaveURL(/\/projects\/[^/]+\/studio$/);
  await page.goto("/discovery"); await Promise.all([page.waitForResponse((response) => response.url().includes("/api/discovery/recommendations/") && response.request().method() === "POST"), page.getByRole("button", { name: "加入选题" }).first().click()]); await expect(page.getByRole("link", { name: "查看选题" })).toHaveCount(2);
  const saved = await db.recommendationItem.findFirstOrThrow({ where: { workspaceId, status: "SAVED" } }); expect(saved.contentIdeaId).toBeTruthy();

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } }); await page.reload(); await expect(page.getByRole("button", { name: /更新一批|生成今日线索/ })).toHaveCount(0);
  const forbidden = await page.request.post("/api/discovery/recommendations"); expect(forbidden.status()).toBe(403);
});
