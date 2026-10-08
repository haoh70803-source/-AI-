import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `unified-analysis-${runId}@example.test`;
const unconfiguredEmail = `unified-analysis-unconfigured-${runId}@example.test`;
const legacyEmail = `unified-analysis-legacy-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let fixtureSourceId = "";
let calls = 0;

function analysisResult() {
  calls += 1;
  return {
    creativeInterpretation: { text: "这条素材适合从证据缺失造成的返工切入。", classification: "AI_INTERPRETATION", sourceItemIds: [fixtureSourceId] },
    angles: [{ title: "从返工成本切入", angle: "先展示没有来源依据会如何拖慢创作。", rationale: "与素材核心问题直接相关", classification: "AI_SUGGESTION", sourceItemIds: [fixtureSourceId] }],
    structure: { overallApproach: "问题—依据—行动", classification: "AI_SUGGESTION", sourceItemIds: [fixtureSourceId], sections: [{ title: "返工问题", purpose: "建立冲突", keyMessage: "缺少来源会增加返工。", supportingPoints: ["来源不可追溯"], sourceItemIds: [fixtureSourceId] }, { title: "解决方法", purpose: "给出路径", keyMessage: "先分析，再创作。", supportingPoints: ["统一上下文"], sourceItemIds: [fixtureSourceId] }] },
    expressionDirection: { description: "直接、具体、避免口号。", rationale: "适合内容团队", classification: "AI_SUGGESTION", sourceItemIds: [fixtureSourceId] },
    riskNotes: [{ text: "不要把来源观点写成已验证事实。", classification: "AI_INTERPRETATION", sourceItemIds: [] }],
    titleReferences: [{ title: "为什么 AI 内容总在返工？", rationale: "突出实际成本", classification: "AI_SUGGESTION", sourceItemIds: [fixtureSourceId] }],
  };
}

function motherResult() {
  calls += 1;
  return { recommendedAngle: "先解释返工为什么发生", alternativeAngles: ["从证据缺口切入", "从团队协作切入"], recommendedTitle: `AI 核心母稿 V${calls}`, alternativeTitles: ["为什么 AI 内容总在返工？", "少返工，从保存依据开始"], openingHook: "这是一版由创作方案主导的口播稿。", outline: ["问题", "方法", "行动"], body: "这是一版由创作方案主导的口播稿。需要人工继续修改。", evidenceIds: [], sourceItemIds: [fixtureSourceId] };
}

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const prompt = parsed.messages.at(-1)?.content ?? "";
      const isMother = prompt.includes("Action: GENERATE_MOTHER_CONTENT");
      expect(prompt).toContain(isMother ? "Action: GENERATE_MOTHER_CONTENT" : "Action: UNIFIED_CREATIVE_ANALYSIS");
      response.writeHead(request.headers.authorization === "Bearer unified-analysis-key" ? 200 : 401, { "content-type": "application/json", "x-request-id": `unified-${calls + 1}` });
      response.end(JSON.stringify({ id: `unified-${calls + 1}`, model: "kimi-2.6-fixture", choices: [{ message: { content: JSON.stringify(isMother ? motherResult() : analysisResult()) } }], usage: { prompt_tokens: 130, completion_tokens: 70 } }));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Unified analysis fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const users = await db.user.findMany({ where: { email: { in: [email, unconfiguredEmail, legacyEmail] } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

async function register(page: import("@playwright/test").Page, userEmail: string, name: string) {
  await page.goto("/register");
  await page.getByLabel("姓名").fill(name);
  await page.getByLabel("邮箱").fill(userEmail);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill(`${name} Workspace`);
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return db.user.findUniqueOrThrow({ where: { email: userEmail }, include: { workspaceMemberships: true } });
}

test("one unified AI action returns a grounded analysis, caches identical input, and never overwrites the Brief", async ({ page }) => {
  test.setTimeout(90_000);
  const user = await register(page, email, "Unified Analysis Owner");
  const membership = user.workspaceMemberships[0]!;
  await new IntegrationService().saveIntegrationConfig({ workspaceId: membership.workspaceId, userId: user.id, provider: "LLM", mode: "FIXTURE", config: { provider: "fixture-openai-compatible", baseUrl: fixtureOrigin, apiKey: "unified-analysis-key", model: "kimi-2.6-fixture" } });
  const source = await db.sourceItem.create({ data: { workspaceId: membership.workspaceId, createdById: user.id, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "统一分析素材", rawText: "可靠创作需要明确问题、绑定来源，并保留人工判断。" } });
  fixtureSourceId = source.id;
  await db.materialAnalysis.create({ data: { workspaceId: membership.workspaceId, sourceItemId: source.id, version: 1, status: "COMPLETED", suggestedTitle: "可靠创作", summary: "先整理来源，再进入创作。", topic: "可靠 AI 创作", tags: [], keywords: [], contentType: "口播", targetAudience: "内容团队", coreViewpoint: "可靠创作需要来源约束。", keyPoints: ["来源可追溯", "人工保留判断"], coreQuestion: "如何减少无依据返工？", transcriptUpdatedAtAtAnalysis: source.updatedAt, createdById: user.id } });
  const created = await page.request.post("/api/projects", { data: { title: "统一创作分析项目", goal: "减少无依据创作", audience: "内容团队", sourceItemId: source.id } });
  expect(created.status()).toBe(201);
  const projectId = (await created.json() as { id: string }).id;
  await db.evidenceItem.create({ data: { workspaceId: membership.workspaceId, projectId, sourceItemId: source.id, type: "VIEWPOINT", claim: "可靠创作需要来源约束。", createdById: user.id } });
  expect(calls).toBe(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await db.aIRun.count({ where: { projectId } })).toBe(0);
  expect(await db.apiUsage.count({ where: { workspaceId: membership.workspaceId } })).toBe(0);
  await page.goto(`/projects/${projectId}/studio`);
  expect(calls).toBe(0);
  expect(await db.aIRun.count({ where: { projectId } })).toBe(0);
  expect(await db.apiUsage.count({ where: { workspaceId: membership.workspaceId } })).toBe(0);
  await expect(page.getByRole("heading", { name: "参考素材" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "创作方案" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "核心母稿" })).toHaveCount(0);
  await expect(page.getByLabel("观点或结论")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "开始 AI 分析" })).toHaveCount(1);
  for (const label of ["分析素材", "提取观点/证据", "生成角度", "生成创作简报", "生成核心母稿"]) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("studio-preparing.png"), fullPage: true });

  await page.getByRole("button", { name: "开始 AI 分析" }).click();
  await expect(page.getByRole("status")).toContainText("AI 分析完成");
  await page.getByRole("button", { name: "查看完整分析" }).click();
  const analysisDialog = page.getByRole("dialog", { name: "完整 AI 创作分析" });
  await expect(analysisDialog.getByRole("heading", { name: "创作理解" })).toBeVisible();
  await expect(analysisDialog.getByRole("heading", { name: "可选切入角度" })).toBeVisible();
  await expect(analysisDialog.getByRole("heading", { name: "结构建议" })).toBeVisible();
  await expect(analysisDialog.getByRole("heading", { name: "素材依据" })).toBeVisible();
  await expect(analysisDialog.getByRole("heading", { name: "风险提醒" })).toBeVisible();
  await expect(analysisDialog.getByRole("heading", { name: "标题参考" })).toBeVisible();
  await expect(analysisDialog.getByText("先整理来源，再进入创作。", { exact: true })).toBeVisible();
  await expect(analysisDialog.getByText("如何减少无依据返工？", { exact: true })).toBeVisible();
  await expect(analysisDialog.getByText("为什么 AI 内容总在返工？")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("studio-analysis-drawer.png"), fullPage: true });
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByText("可靠 AI 创作", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/分析于 .* · v1/)).toBeVisible();
  expect(calls).toBe(1);
  expect(await db.aIRun.count({ where: { projectId } })).toBe(1);
  expect(await db.apiUsage.count({ where: { workspaceId: membership.workspaceId } })).toBe(1);
  const cached = await page.request.post(`/api/projects/${projectId}/ai/run`, { data: { action: "UNIFIED_CREATIVE_ANALYSIS" } });
  expect(cached.status()).toBe(201);
  expect((await cached.json() as { cached: boolean }).cached).toBe(true);
  expect(calls).toBe(1);

  await page.getByRole("button", { name: "编辑方案" }).click();
  await page.getByLabel("目标受众").fill("人工确认后的受众");
  await page.getByLabel("核心问题").fill("人工确认后的核心问题");
  await page.screenshot({ path: test.info().outputPath("studio-plan-editing.png"), fullPage: true });
  await page.getByRole("button", { name: "保存创作方案" }).click();
  await expect(page.getByText("创作内容已发生变化，建议更新分析；不会自动调用 AI。")).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "更新分析" }).click();
  await expect(page.getByText("AI 分析完成", { exact: true })).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "编辑方案" }).click();
  await expect(page.getByLabel("目标受众")).toHaveValue("人工确认后的受众");
  await expect(page.getByLabel("核心问题")).toHaveValue("人工确认后的核心问题");
  await page.getByRole("button", { name: "取消" }).click();

  await page.getByRole("button", { name: "确认并开始创作" }).click();
  await expect(page.getByRole("heading", { name: "核心母稿" })).toBeVisible();
  await expect(page.getByLabel("母稿正文")).toHaveCount(0);
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "AI 生成核心母稿" }).first().click();
  await expect(page.getByLabel("母稿正文")).toHaveValue("这是一版由创作方案主导、需要人工继续修改的核心母稿。", { timeout: 20_000 });
  expect(calls).toBe(3);
  await page.getByLabel("母稿正文").fill("人工修改后的 V1，重新生成时不能丢失。");
  await expect.poll(async () => (await db.motherContent.findUniqueOrThrow({ where: { projectId } })).body).toBe("人工修改后的 V1，重新生成时不能丢失。");
  await page.getByRole("button", { name: "重新生成" }).click();
  await expect(page.getByText("新版本母稿已生成")).toBeVisible();
  expect(calls).toBe(4);
  await page.getByRole("button", { name: "查看历史版本" }).click();
  const historyDialog = page.getByRole("dialog", { name: "核心母稿历史版本" });
  await expect(historyDialog).toContainText("V2");
  await historyDialog.locator("summary").filter({ hasText: "V1" }).click();
  await expect(historyDialog).toContainText("人工修改后的 V1，重新生成时不能丢失。");
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("heading", { name: "创作方案" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("studio-writing.png"), fullPage: true });
  await page.getByRole("button", { name: "查看创作方案" }).click();
  await expect(page.getByRole("dialog", { name: "创作方案" })).toContainText("人工确认后的受众");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "查看依据" }).click();
  const basisDialog = page.getByRole("dialog", { name: "创作依据" });
  await expect(basisDialog).not.toContainText("SOURCE_REFERENCE_GAP");
  await expect(basisDialog).toContainText("有部分建议缺少充分素材依据。");
  await expect(basisDialog.getByText("已采用", { exact: true })).toBeVisible();
  await expect(basisDialog.getByRole("button", { name: "不采用" }).first()).toBeVisible();
  await expect(basisDialog.getByText("修改", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId("unified-creative-analysis")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
  await page.reload();
  await expect(page.getByLabel("母稿正文")).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新生成" })).toHaveCount(0);
  const forbidden = await page.request.post(`/api/projects/${projectId}/ai/run`, { data: { action: "UNIFIED_CREATIVE_ANALYSIS" } });
  expect(forbidden.status()).toBe(403);
});

test("unconfigured LLM is explicit and exposes no active AI analysis action", async ({ page }) => {
  const user = await register(page, unconfiguredEmail, "Unified Analysis Unconfigured");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "No LLM Project" } });
  await page.goto(`/projects/${project.id}/studio`);
  await expect(page.getByText("尚未配置 AI 模型", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "开始 AI 分析" })).toHaveCount(0);
});

test("legacy project with a mother content opens directly in writing without MaterialAnalysis", async ({ page }) => {
  const user = await register(page, legacyEmail, "Legacy Studio Owner");
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "旧项目", status: "WRITING", creativeBrief: { create: { workspaceId, createdById: user.id, topic: "旧主题", angle: "旧角度", audience: "旧受众", coreMessage: "旧判断", keyPoints: [], structure: [], tone: "", risks: [] } }, motherContent: { create: { workspaceId, createdById: user.id, title: "已有母稿", body: "旧项目已有正文。", outline: [] } } } });
  await page.goto(`/projects/${project.id}/studio`);
  await expect(page.getByRole("heading", { name: "核心母稿" })).toBeVisible();
  await expect(page.getByLabel("母稿正文")).toHaveValue("旧项目已有正文。");
  await expect(page.getByRole("heading", { name: "创作方案" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("studio-legacy.png"), fullPage: true });
  await page.getByRole("button", { name: "查看创作方案" }).click();
  await expect(page.getByRole("dialog", { name: "创作方案" })).toContainText("旧主题");
});
