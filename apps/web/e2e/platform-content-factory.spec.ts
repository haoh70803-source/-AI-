import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";

const suffix = randomUUID();
const email = `platform-e2e-${suffix}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";

function resultFor(prompt: string) {
  if (prompt.includes("Target: DOUYIN")) return { hook: "先别急着让 AI 写", title: "AI 创作最容易跳过的一步", body: "先整理来源和证据，再选择角度，最后重建表达。", hashtags: ["AI创作", "内容方法"], mediaPlan: { duration: 60, shotSuggestions: ["正面口播", "流程文字卡"] } };
  if (prompt.includes("Target: XIAOHONGSHU")) return { titles: ["AI 写作别跳过这一步", "可靠内容从哪里开始", "先证据，后表达"], body: "很多人一上来就让 AI 写全文。\n\n更稳妥的方法，是先整理来源和证据，再重建表达。", hashtags: ["AI创作", "内容方法"], coverTitles: ["先证据 后表达"], mediaPlan: { imageIdeas: ["三步流程图"] } };
  throw new Error("Unexpected platform fixture prompt");
}

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const prompt = parsed.messages.at(-1)?.content ?? "";
      response.writeHead(request.headers.authorization === "Bearer platform-fixture-key" ? 200 : 401, { "content-type": "application/json", "x-request-id": "platform-e2e-request" });
      response.end(JSON.stringify({ id: "platform-e2e-completion", model: "fixture-model", choices: [{ message: { content: JSON.stringify(resultFor(prompt)) } }], usage: { prompt_tokens: 131, completion_tokens: 53 } }));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Platform fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

test("MotherContent → Douyin Preview/Apply/edit → Xiaohongshu → stale → VIEWER readonly", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Platform E2E User");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Platform E2E Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const membership = user.workspaceMemberships[0]!;
  await new IntegrationService().saveIntegrationConfig({ workspaceId: membership.workspaceId, userId: user.id, provider: "LLM", mode: "FIXTURE", config: { provider: "fixture-openai-compatible", baseUrl: fixtureOrigin, apiKey: "platform-fixture-key", model: "fixture-model" } });
  const profile = await db.creatorProfile.create({ data: { workspaceId: membership.workspaceId, userId: user.id, displayName: "Platform Creator", positioning: "可靠内容方法", targetAudience: "内容团队", tone: "直接、具体", preferredStyle: "自然", forbiddenStyle: "口号", coreTopics: [], personalViews: ["证据先于写作"], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] } });
  const project = await db.contentProject.create({ data: { workspaceId: membership.workspaceId, createdById: user.id, creatorProfileId: profile.id, title: "阶段六平台内容项目", motherContent: { create: { workspaceId: membership.workspaceId, createdById: user.id, title: "阶段六母稿", body: "可靠内容需要先整理来源和证据，再选择角度，最后重建表达。", outline: ["问题", "方法", "结尾"], confirmedVersion: 1 } }, creativeBrief: { create: { workspaceId: membership.workspaceId, createdById: user.id, topic: "可靠 AI 内容", angle: "证据优先", audience: "内容团队", coreMessage: "证据先于写作", keyPoints: ["来源", "证据", "表达"], structure: ["问题", "方法"], tone: "直接", risks: [] } } } });

  await page.goto(`/projects/${project.id}/studio`);
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await page.getByRole("button", { name: "生成抖音" }).click();
  await expect(page.getByRole("heading", { name: "抖音预览" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("p").filter({ hasText: /^先整理来源和证据，再选择角度，最后重建表达。$/ })).toBeVisible();
  await page.getByRole("button", { name: "应用为抖音版本" }).click();
  await expect(page.getByLabel("抖音标题")).toHaveValue("AI 创作最容易跳过的一步");
  await page.getByLabel("抖音正文").fill("人工编辑后的抖音口播稿。");
  await expect.poll(async () => (await db.platformVariant.findUnique({ where: { projectId_platform: { projectId: project.id, platform: "DOUYIN" } } }))?.body, { timeout: 10_000 }).toBe("人工编辑后的抖音口播稿。");

  await page.getByRole("button", { name: /^小红书/ }).click();
  await page.getByRole("button", { name: "生成小红书" }).click();
  await expect(page.getByRole("heading", { name: "小红书预览" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "应用为小红书版本" }).click();
  await expect(page.getByLabel("小红书标题")).toHaveValue("AI 写作别跳过这一步");

  await page.getByRole("button", { name: "创作", exact: true }).click();
  await page.getByLabel("口播稿正文").fill("母稿已经更新：可靠内容需要先整理证据，再重新组织平台表达。");
  await expect.poll(async () => (await db.motherContent.findUnique({ where: { projectId: project.id } }))?.version, { timeout: 10_000 }).toBe(2);
  await page.getByRole("button", { name: "确认这版口播稿，进入平台适配" }).click();
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await expect(page.getByText("当前平台版本基于旧母稿，不会自动覆盖。", { exact: true })).toBeVisible();

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
  await page.reload();
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await expect(page.getByLabel("抖音正文")).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新生成抖音" })).toHaveCount(0);
  const forbidden = await page.request.post(`/api/projects/${project.id}/platform-variants/generate`, { data: { platforms: ["DOUYIN"] } });
  expect(forbidden.status()).toBe(403);
  const usage = await db.apiUsage.findMany({ where: { workspaceId: membership.workspaceId, operation: { startsWith: "ADAPT_" } } });
  expect(usage).toHaveLength(2);
  expect(usage.every((item) => item.inputTokens === 131 && item.outputTokens === 53)).toBe(true);
});
