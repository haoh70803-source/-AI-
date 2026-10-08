import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = "workflow-skill-" + runId + "@example.test";
const password = "safe-workflow-skill-password";
const markdown = [
  "# 创作方法：知识型口播 · 问题—判断—行动",
  "",
  "## 基本信息",
  "- 契约版本：workflow-skill-v1",
  "- 输出类型：ORAL_VIDEO_SCRIPT",
  "",
  "## 适用场景",
  "- 把一个知识问题讲清楚，并给出可执行的下一步。",
  "",
  "## 输入要求",
  "### 系统自动提供",
  "- 当前资料正文和创作主题",
  "- 已确认的资料内容",
  "### 用户补充",
  "- 本次主题、语气和补充要求",
  "### 前置条件",
  "- 至少有一个明确问题",
  "",
  "## 执行步骤",
  "1. 把主题压缩成一个具体问题。",
  "2. 从资料中找出支持问题的内容。",
  "3. 先给出判断，再解释原因。",
  "4. 给出观众下一步可以做的动作。",
  "",
  "## 判断规则",
  "- 只保留一个主问题和一个主判断。",
  "- 没有资料支持时，不写客户案例或数据。",
  "",
  "## 表达规则",
  "- 使用清楚、直接、自然的中文。",
  "- 句子适合自然口播。",
  "",
  "## 禁止事项",
  "- 不虚构人物、客户、数字或结果。",
  "- 不把外部资料写成创作者自己的经历。",
  "",
  "## 输出要求",
  "- 输出标题和完整正文。",
  "- 默认提供 3 个备选开头。",
  "- 提供结尾行动建议；不需要 CTA 时返回空值。",
  "",
  "## 事实边界",
  "- 本方法只决定表达和组织，不确认任何事实。",
  "- 外部、待确认和方法指导不能写成我方已确认事实。",
  "",
  "## 来源说明",
  "- 来源类型：EXTERNAL_GPT",
  "- 来源说明：安全合成测试方法，不对应真实人物或业务数据。",
].join("\n");

let fixture: Server;
let fixtureOrigin = "";
const prompts: string[] = [];

function responseOutput(prompt: string) {
  if (prompt.includes("HUMANIZE_TEXT")) {
    return {
      original: "原始测试正文。",
      summary: "删掉模板化表达，保留事实和观点。",
      suggestions: [],
      replacement: "这是一版更自然的测试正文，保留原来的事实和核心判断。",
      risks: [],
    };
  }
  if (prompt.includes("故意缺少必填字段")) {
    return { recommendedTitle: "不完整结果", alternativeAngles: [], alternativeTitles: ["备选一", "备选二"], openingHook: "开场", outline: [], evidenceIds: [], sourceItemIds: [] };
  }
  const fakeCase = prompt.includes("随便编一个客户案例");
  const oneOpening = prompt.includes("只要 1 个备选开头");
  return {
    recommendedAngle: "一个问题、一个判断、一个动作",
    alternativeAngles: ["从常见误区切入"],
    recommendedTitle: "先把一个问题讲清楚",
    alternativeTitles: ["不要一次讲太多", "知识口播先做减法"],
    openingHook: "知识类内容最容易犯的错，是每个点都舍不得删。",
    alternativeOpenings: oneOpening ? ["下一条知识口播，先别急着补充更多内容。"] : ["先别急着把所有内容都讲完。", "观众听完不知道下一步，问题可能不是内容少。", "写知识口播前，先只保留一个问题。"],
    closingAction: "打开下一条稿子，删掉一个分支，只留下一个问题、一个判断和一个动作。",
    cta: null,
    needsConfirmation: fakeCase ? ["客户案例需要真实资料，当前测试资料没有客户案例。"] : [],
    outline: ["问题", "判断", "行动"],
    body: fakeCase ? "当前资料没有客户案例，不能直接编写。可以先补充真实资料，再决定是否加入案例。" : "这是一版基于安全测试资料生成的结构化口播稿。先说清一个问题，再给出一个判断，最后给观众一个可以马上尝试的动作。",
    evidenceIds: [],
    sourceItemIds: [],
  };
}

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      try {
        const requestBody = JSON.parse(body) as { messages?: Array<{ content?: unknown }> };
        const content = requestBody.messages?.at(-1)?.content;
        const prompt = typeof content === "string" ? content : JSON.stringify(content ?? "");
        prompts.push(prompt);
        const output = responseOutput(prompt);
        response.writeHead(request.headers.authorization === "Bearer workflow-skill-fixture-key" ? 200 : 401, { "content-type": "application/json", "x-request-id": "workflow-skill-" + prompts.length });
        response.end(JSON.stringify({ id: "workflow-skill-" + prompts.length, model: "workflow-skill-fixture", choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 100, completion_tokens: 80 } }));
      } catch (error) {
        console.error("[workflow-skill fixture] request failed", error);
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "fixture_failed" }));
      }
    });
  });
  await new Promise<void>((resolve) => fixture.listen(4311, "0.0.0.0", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Workflow skill fixture did not bind");
  fixtureOrigin = "http://localhost:" + address.port + "/v1";
});

test.afterAll(async () => {
  fixture?.closeAllConnections();
  await new Promise<void>((resolve) => fixture?.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const workspaces = await db.workspace.findMany({ where: { members: { some: { userId: user.id } } }, select: { id: true } });
    if (workspaces.length) await db.workspace.deleteMany({ where: { id: { in: workspaces.map(({ id }) => id) } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1);
    const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test("imports, selects, executes, and humanizes one Workflow Skill", async ({ page }) => {
  test.setTimeout(120_000);
  const response = await auth.api.signUpEmail({ body: { name: "Workflow Skill Owner", email, password }, asResponse: true });
  expect(response.ok).toBe(true);
  const body = await response.clone().json() as { user: { id: string } };
  await ensurePersonalWorkspaceForUser(db, { userId: body.user.id });
  await page.context().addCookies(sessionCookies(response));
  const user = await db.user.findUniqueOrThrow({ where: { id: body.user.id }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId: user.id, provider: "LLM", mode: "FIXTURE", config: { provider: "fixture-openai-compatible", baseUrl: fixtureOrigin, apiKey: "workflow-skill-fixture-key", model: "workflow-skill-fixture" } });
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "安全合成知识资料", rawText: "这是一份安全合成资料：知识类内容先明确一个问题，再给出一个判断和一个动作。本资料没有播放量、收入、客户案例或转化率。", status: "READY" } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "Workflow Skill 测试创作", sources: { create: { sourceItemId: source.id, role: "REFERENCE" } } } });
  const primaryBranch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, title: "主稿", createdById: user.id, updatedById: user.id } });
  await db.contentProject.update({ where: { id: project.id }, data: { primaryDraftBranchId: primaryBranch.id } });
  await db.creativeBrief.create({ data: { workspaceId, projectId: project.id, createdById: user.id, topic: "知识类短视频如何讲清一个问题", angle: "", audience: "刚开始做知识内容的运营", coreMessage: "一个问题、一个判断、一个动作。", background: "", keyPoints: [], structure: [], tone: "直接、自然", risks: [] } });

  await page.goto("/library/methods");
  const importer = page.getByTestId("workflow-skill-import");
  await importer.getByRole("button", { name: "导入创作方法" }).click();
  await importer.getByLabel("Workflow Skill Markdown").fill(markdown);
  await importer.getByRole("button", { name: "预览方法" }).click();
  await expect(importer).toContainText("知识型口播 · 问题—判断—行动");
  await expect(importer).toContainText("输出类型");
  await importer.getByRole("button", { name: "保存为创作方法" }).click();
  await expect(importer).toContainText("创作方法已保存");
  const imported = await db.methodAsset.findFirstOrThrow({ where: { workspaceId, ownerUserId: user.id }, include: { versions: true } });
  expect(imported.versions[0]!.workflowContract).toMatchObject({ contractVersion: "workflow-skill-v1", outputType: "ORAL_VIDEO_SCRIPT" });

  const invalid = markdown.replace("## 执行步骤", "## 缺少步骤");
  await importer.getByRole("button", { name: "导入创作方法" }).click();
  await importer.getByLabel("Workflow Skill Markdown").fill(invalid);
  await importer.getByRole("button", { name: "预览方法" }).click();
  await expect(importer.getByRole("alert")).toContainText("缺少「执行步骤」章节");
  await importer.getByRole("button", { name: "关闭导入" }).click();

  await page.goto("/projects/" + project.id + "/studio");
  await page.getByRole("button", { name: /^方法，/ }).click();
  const contextDrawer = page.getByRole("dialog", { name: "当前创作内容" });
  const selector = contextDrawer.getByTestId("studio-method-selector");
  const drawer = page.getByRole("dialog", { name: "选择创作方法" });
  const option = drawer.locator("article").filter({ hasText: "知识型口播 · 问题—判断—行动" });
  await option.getByRole("button", { name: "选择", exact: true }).click();
  await drawer.getByRole("button", { name: "保存选择" }).click();
  await expect(selector).toContainText("知识型口播 · 问题—判断—行动");
  await contextDrawer.locator("summary").click();
  await page.getByLabel("这次希望怎么讲？").fill("只要 1 个备选开头；语气自然。");
  await page.getByRole("button", { name: "保存我的补充" }).click();
  await contextDrawer.getByRole("button", { name: "关闭当前创作内容" }).click();
  await page.getByRole("button", { name: "开始写第一版" }).click();
  await page.getByRole("button", { name: "直接生成第一版口播稿" }).click();
  await expect(page.getByLabel("口播稿正文")).toHaveValue(/结构化口播稿/, { timeout: 30_000 });
  const production = page.getByTestId("content-production-preview");
  await expect(production).toContainText("备选开头");
  await expect(production.locator("h3", { hasText: "备选开头" }).locator("..").locator("li")).toHaveCount(1);
  await expect(production.getByRole("heading", { name: "需要确认" })).toHaveCount(0);
  await expect.poll(() => db.methodUsage.count({ where: { projectId: project.id, methodVersionId: imported.versions[0]!.id } })).toBe(1);

  const humanize = page.getByTestId("workflow-humanize-action");
  await humanize.getByRole("button", { name: "去 AI 味" }).click();
  await expect(humanize).toContainText("润色候选", { timeout: 30_000 });
  await expect(humanize).toContainText("更自然的测试正文");
  await humanize.getByRole("button", { name: "应用润色" }).click();
  await expect(page.getByLabel("口播稿正文")).toHaveValue(/更自然的测试正文/, { timeout: 30_000 });
  await expect.poll(() => db.motherContent.findUnique({ where: { projectId: project.id }, select: { body: true } })).toMatchObject({ body: expect.stringContaining("更自然的测试正文") });

  await page.getByRole("dialog", { name: /编辑稿件/ }).getByRole("button", { name: "返回画布" }).click();
  await page.getByRole("button", { name: /^当前目标，/ }).click();
  await page.getByLabel("这次希望怎么讲？").fill("随便编一个客户案例");
  await page.getByRole("button", { name: "保存我的补充" }).click();
  await contextDrawer.getByRole("button", { name: "关闭当前创作内容" }).click();
  await page.getByRole("button", { name: /^当前稿件，/ }).click();
  const moreActions = page.locator("details.studio-document-more").first();
  await moreActions.locator("summary[aria-label='更多稿件操作']").click();
  await moreActions.getByRole("button", { name: "重新生成稿件" }).click();
  await expect(page.getByLabel("口播稿正文")).toHaveValue(/不能直接编写/, { timeout: 30_000 });
  await expect(production).toContainText("需要确认");

  await page.getByRole("dialog", { name: /编辑稿件/ }).getByRole("button", { name: "返回画布" }).click();
  await page.getByRole("button", { name: /^当前目标，/ }).click();
  await page.getByLabel("这次希望怎么讲？").fill("故意缺少必填字段");
  await page.getByRole("button", { name: "保存我的补充" }).click();
  await contextDrawer.getByRole("button", { name: "关闭当前创作内容" }).click();
  await page.getByRole("button", { name: /^当前稿件，/ }).click();
  const previousBody = await page.getByLabel("口播稿正文").inputValue();
  await moreActions.locator("summary[aria-label='更多稿件操作']").click();
  await moreActions.getByRole("button", { name: "重新生成稿件" }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: "AI" })).toContainText("AI", { timeout: 30_000 });
  await expect(page.getByLabel("口播稿正文")).toHaveValue(previousBody);
  await expect.poll(() => db.motherContent.findUnique({ where: { projectId: project.id }, select: { body: true } })).toMatchObject({ body: previousBody });
});
