import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";

const suffix = randomUUID();
const email = `quality-review-e2e-${suffix}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const prompt = parsed.messages.at(-1)?.content ?? "";
      const authorized = request.headers.authorization === "Bearer review-fixture-key";
      const validAction = prompt.includes("Action: REVIEW_PLATFORM_CONTENT");
      const output = { summary: "内容逻辑清楚，有一处表达可以更自然。", issues: [{ code: "TONE_TOO_GENERIC", severity: "WARNING", message: "结尾略显模板化。", field: "body", suggestion: "改成创作者自己的判断。" }], suggestions: ["保留人工判断"] };
      response.writeHead(authorized && validAction ? 200 : 400, { "content-type": "application/json", "x-request-id": "review-e2e-request" });
      response.end(JSON.stringify({ id: "review-e2e-completion", model: "workspace-review-model", choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 149, completion_tokens: 47 } }));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Review fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

test("rule gate → Workspace LLM advice → human approval → edit reset → EDITOR 403 → stale approval gate", async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Quality Review Owner");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Quality Review Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const membership = user.workspaceMemberships[0]!;
  await new IntegrationService().saveIntegrationConfig({ workspaceId: membership.workspaceId, userId: user.id, provider: "LLM", mode: "FIXTURE", config: { provider: "fixture-openai-compatible", baseUrl: fixtureOrigin, apiKey: "review-fixture-key", model: "workspace-review-model" } });
  const profile = await db.creatorProfile.create({ data: { workspaceId: membership.workspaceId, userId: user.id, displayName: "Review Creator", positioning: "可靠内容方法", targetAudience: "内容团队", tone: "直接", preferredStyle: "具体", forbiddenStyle: "机械表达", coreTopics: [], personalViews: ["证据优先"], brandTerms: [], forbiddenTerms: ["保证成功"], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] } });
  const project = await db.contentProject.create({ data: { workspaceId: membership.workspaceId, createdById: user.id, creatorProfileId: profile.id, title: "阶段七审核项目", motherContent: { create: { workspaceId: membership.workspaceId, createdById: user.id, title: "阶段七母稿", body: "可靠内容先核对事实，再组织表达。", outline: [], origin: "GPT_WEB" } }, creativeBrief: { create: { workspaceId: membership.workspaceId, createdById: user.id, topic: "可靠内容", angle: "事实优先", audience: "内容团队", coreMessage: "先核对再表达", keyPoints: [], structure: [], tone: "直接", risks: [] } }, evidenceItems: { create: { workspaceId: membership.workspaceId, createdById: user.id, type: "VIEWPOINT", claim: "可靠内容先核对事实" } } } });
  const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId: project.id } });
  await db.platformVariant.create({ data: { workspaceId: membership.workspaceId, projectId: project.id, motherContentId: mother.id, platform: "DOUYIN", title: "可靠内容怎么做", hook: "先别急着写", body: "可靠内容先核对事实，再组织表达。", hashtags: ["内容方法"], mediaPlan: {}, metadata: {}, status: "READY", sourceMotherVersion: 1, createdById: user.id } });

  await page.goto(`/projects/${project.id}/studio`);
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText("抖音已提交人工审核，不会自动运行 AI 检查。", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看审核" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/review/DOUYIN$`));
  await expect(page.getByText("未发现规则问题。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "运行 AI 检查" }).click();
  await expect(page.getByText("结尾略显模板化。", { exact: true })).toBeVisible();
  await expect(page.getByText("内容逻辑清楚，有一处表达可以更自然。", { exact: true })).toBeVisible();
  await page.getByLabel("确认已知风险").check();
  await page.getByRole("button", { name: "批准" }).click();
  await expect.poll(async () => (await db.platformVariant.findUnique({ where: { projectId_platform: { projectId: project.id, platform: "DOUYIN" } } }))?.status).toBe("APPROVED");
  const usage = await db.apiUsage.findFirstOrThrow({ where: { workspaceId: membership.workspaceId, operation: "REVIEW_PLATFORM_CONTENT" } });
  expect(usage).toMatchObject({ provider: "LLM", inputTokens: 149, outputTokens: 47 });

  await page.getByRole("link", { name: "返回创作工作台" }).click();
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await page.getByLabel("抖音正文").fill("人工修改后的平台正文。");
  await expect.poll(async () => (await db.platformVariant.findUnique({ where: { projectId_platform: { projectId: project.id, platform: "DOUYIN" } } }))?.status, { timeout: 10_000 }).toBe("DRAFT");
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText("抖音已提交人工审核，不会自动运行 AI 检查。", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看审核" }).click();

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "EDITOR" } });
  const forbidden = await page.request.post(`/api/projects/${project.id}/platform-variants/DOUYIN/review/approve`, { data: {} });
  expect(forbidden.status()).toBe(403);
  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "OWNER" } });
  const restoredOwnerApproval = await page.request.post(`/api/projects/${project.id}/platform-variants/DOUYIN/review/approve`, { data: {} });
  expect(restoredOwnerApproval.status()).toBe(201);
  await expect.poll(async () => (await db.platformVariant.findUnique({ where: { projectId_platform: { projectId: project.id, platform: "DOUYIN" } } }))?.status).toBe("APPROVED");

  const imported = await page.request.post(`/api/projects/${project.id}/import-gpt-draft`, { data: { title: "新版 GPT Web 母稿", body: "这是人工从 ChatGPT 网页版复制回来的新版成稿。", note: "人工确认", confirmReplace: true } });
  expect(imported.status()).toBe(201);
  await page.reload();
  await expect(page.getByText("此前已批准，但口播稿已经更新", { exact: true })).toBeVisible();
  const reviews = await page.request.get(`/api/projects/${project.id}/platform-variants/DOUYIN/reviews`);
  expect(reviews.status()).toBe(200);
  expect((await reviews.json()).readyToPublish).toBe(false);
});
