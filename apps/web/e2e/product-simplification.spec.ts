import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `product-simplification-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
const prompts: string[] = [];

const understanding = {
  whatItSays: { summary: "原作者在讲内容如何提前建立业务信任。", keyPoints: ["先解释判断逻辑", "再给具体方法"] },
  reusable: [{ content: "先拆掉错误认知，再给可执行方法", whyUseful: "这是可以迁移的表达机制" }],
  doNotCopy: [{ content: "百分之九十八都在我这里上过", reason: "无法验证，也是原作者自述" }, { content: "当天成交13个", reason: "这是原作者案例，不是我们的经历" }],
  uncertain: [{ content: "星加克", reason: "原转写中的实体无法确认，不能猜测纠正" }],
};

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const prompt = parsed.messages.at(-1)?.content ?? ""; prompts.push(prompt);
      const output = prompt.includes("Action: ANALYZE_MATERIAL")
        ? understanding
        : { recommendedAngle: "内容先建立信任，再提供方法", alternativeAngles: ["为什么结果不能替代判断", "怎样降低观众的决策成本"], recommendedTitle: "为什么内容要先建立信任", alternativeTitles: ["急着讲结果，为什么反而没人信？", "先讲清判断，再给方法"], openingHook: "很多人急着写结果，却没有先解释判断逻辑。", outline: ["误区", "机制", "行动"], body: "很多人急着写结果，却没有先解释判断逻辑。先把问题讲清楚，再给一个能执行的方法，内容才会真正帮助对方做决定。", evidenceIds: [], sourceItemIds: [] };
      response.writeHead(request.headers.authorization === "Bearer simplification-key" ? 200 : 401, { "content-type": "application/json", "x-request-id": `simplification-${prompts.length}` });
      response.end(JSON.stringify({ id: `simplification-${prompts.length}`, model: "kimi-k2.6", choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address(); if (!address || typeof address === "string") throw new Error("Fixture did not bind"); fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) { await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } }); await db.user.delete({ where: { id: user.id } }); }
  await db.$disconnect();
});

test("reference material to supplement to spoken script uses exactly two AI calls", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/register"); await page.getByLabel("姓名").fill("Product Simplification Owner"); await page.getByLabel("邮箱").fill(email); await page.getByLabel("密码").fill(password); await page.getByRole("button", { name: "创建账号" }).click(); await page.getByLabel("Workspace 名称").fill("Simplification Workspace"); await page.getByRole("button", { name: "创建 Workspace" }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } }); const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId: user.id, provider: "LLM", config: { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: fixtureOrigin, apiKey: "simplification-key", apiModelId: "kimi-k2.6" } });
  const transcript = "教育行业做这个的鼻祖说星加克，百分之九十八都在我这里上过，并声称当天成交13个。这个完整转写只应进入素材整理，不应进入口播稿模型。";
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "同行教育内容", status: "READY", transcript: { create: { workspaceId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: transcript, segments: [] } } } });

  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/library/${source.id}`); expect(prompts).toHaveLength(0); await page.getByRole("button", { name: "开始整理" }).click();
  const card = page.getByTestId("material-analysis-card"); await expect(card).toContainText("它讲了什么"); await expect(card).toContainText("值得借"); await expect(card).toContainText("不要照搬"); await expect(card).toContainText("需要确认"); await expect(card).toContainText("星加克"); await expect(card).not.toContainText("星巴克"); expect(prompts).toHaveLength(1);
  const workbar = page.getByTestId("material-workspace"); const scrollBody = page.getByTestId("material-workspace-scroll-body"); const workbarBox = await workbar.boundingBox(); expect(workbarBox!.height).toBeLessThanOrEqual(860); await expect(page.getByTestId("material-workspace-header")).toBeVisible(); await expect(page.getByTestId("material-workspace-tabs")).toBeVisible(); await expect(scrollBody).toHaveCSS("overflow-y", "auto"); await expect(page.getByTestId("material-workspace-footer")).toBeVisible();
  await page.getByRole("tab", { name: "创作" }).click(); await page.getByRole("button", { name: "基于这条素材创作" }).click(); await expect(page).toHaveURL(/\/projects\/.+\/studio$/); expect(prompts).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "1. 参考素材" })).toBeVisible(); await expect(page.getByRole("heading", { name: "2. 我的补充" })).toBeVisible(); await expect(page.getByRole("heading", { name: "3. 我的口播稿" })).toBeVisible(); await expect(page.getByText("统一创作分析")).toHaveCount(0); await expect(page.getByText("深度创作")).toHaveCount(0);
  await page.getByRole("button", { name: /同行教育内容/ }).click(); await page.getByRole("button", { name: "用这个" }).click(); await expect(page.getByLabel("我的核心观点")).toContainText("先拆掉错误认知");
  await page.getByLabel("给谁看").fill("正在做内容获客的教育从业者"); await page.getByLabel("有什么只有我们能讲的？").fill("我们只分享自己验证过的内容工作流，不声明成交数量。"); await page.getByLabel("这次希望怎么讲？").fill("自然口语，不要营销腔。");
  await page.getByRole("button", { name: "生成我的口播稿" }).click(); await expect(page.getByLabel("口播稿正文")).toHaveValue(/很多人急着写结果/); await expect(page.getByText(/有 \d+ 处需要确认/)).toBeVisible(); await expect(page.getByRole("heading", { name: "AI 建议这条这样讲" })).toBeVisible(); await expect(page.getByTestId("content-production-preview").getByRole("radio")).toHaveCount(6); await expect(page.getByText(/约 \d+ 秒 · 约 \d+ 字/)).toBeVisible(); await expect(page.getByTestId("shootability-check")).toContainText("一个核心角度"); expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain("mySupplement"); expect(prompts[1]).toContain("星加克"); expect(prompts[1]).not.toContain("这个完整转写只应进入素材整理"); expect(prompts.some((prompt) => prompt.includes("UNIFIED_CREATIVE_ANALYSIS"))).toBe(false);
  expect(await db.aIRun.count({ where: { workspaceId, action: "ANALYZE_MATERIAL" } })).toBe(1); expect(await db.aIRun.count({ where: { workspaceId, action: "GENERATE_MOTHER_CONTENT" } })).toBe(1); expect(await db.aIRun.count({ where: { workspaceId, action: "UNIFIED_CREATIVE_ANALYSIS" } })).toBe(0); expect(await db.deepContentPackage.count({ where: { workspaceId } })).toBe(0);

  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await expect(page.getByRole("heading", { name: "2. 我的补充" })).toBeVisible();

  const legacySource = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "旧版素材", rawText: "旧内容", status: "READY" } });
  await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: legacySource.id, version: 1, status: "COMPLETED", summary: "旧版摘要", tags: [], keywords: [], keyPoints: ["旧版要点"], transcriptUpdatedAtAtAnalysis: legacySource.updatedAt, createdById: user.id } });
  const legacyProject = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "旧项目兼容", sources: { create: { sourceItemId: legacySource.id, role: "REFERENCE" } } } });
  await page.goto(`/projects/${legacyProject.id}/studio`); await page.getByRole("button", { name: /旧版素材/ }).click(); await expect(page.getByRole("dialog", { name: "旧版素材" })).toContainText("旧版整理结果"); expect(prompts).toHaveLength(2);
});
