import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";

const suffix = randomUUID();
const email = `deep-e2e-${suffix}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let evidenceId = "";
let sourceId = "";
let fixtureCalls = 0;

function deepOutput() {
  return {
    topicPackage: { coreTopic: "可靠创作为什么要先研究", coreQuestion: "研究和最终主笔应该如何分工？", candidateTopics: [{ title: "先研究，再创作", angle: "流程分工", targetAudience: "内容团队", conflict: "快速生成和可靠创作", novelty: "用创作包交接", whyWorthDoing: "降低无依据表达", differenceFromSources: "形成新的工作流判断" }] },
    viewpointPackage: { mainViewpoint: "研究与最终写作应该分工。", supportingViewpoints: ["Evidence 先于表达"], counterArguments: ["直接生成更快"], commonBeliefs: ["模型强就不需要研究"], ourJudgement: "速度不能替代事实边界。", deeperImplications: ["内容生产需要正式交接物"] },
    evidencePackage: { items: [{ evidenceId, type: "FACT", content: "正式 Evidence 支持研究先于写作。", sourceItemId: sourceId, sourceReference: "https://example.test/deep", supports: "Evidence 先于表达", confidence: 0.9, needsVerification: false, classification: "CONFIRMED" }, { evidenceId: null, type: "IDEA", content: "可以使用备料类比。", sourceItemId: null, sourceReference: null, supports: "表达", confidence: 0.5, needsVerification: false, classification: "AI_SUGGESTION" }] },
    expressionPackage: { hooks: [{ type: "CONTRARIAN", text: "最会写的模型，也不该跳过研究。" }, { type: "QUESTION", text: "为什么内容越生成越空？" }, { type: "CASE", text: "一个常见的失败流程。" }, { type: "DIRECT_JUDGEMENT", text: "先研究，再创作。" }, { type: "BOSS_VIEW", text: "负责人真正要管的是事实边界。" }, { type: "STORY", text: "一次赶稿暴露了流程问题。" }], goldenLines: ["速度不能替代事实边界。"], questions: [], analogies: ["研究像备料"], conflictLines: [], transitions: [], endingIdeas: [], ctaIdeas: [] },
    structurePackage: { structures: [{ type: "CONTRARIAN", name: "反常识", whySuitable: "快速建立冲突", steps: ["误区", "判断", "方法"] }, { type: "STORY", name: "故事", whySuitable: "通过场景解释", steps: ["场景", "转折", "结论"] }, { type: "VIEWPOINT", name: "观点", whySuitable: "突出立场", steps: ["判断", "论证", "行动"] }], recommendedStructure: "反常识" },
    creatorContribution: { personalViews: ["证据先于写作"], personalExperiences: [], personalCases: [], professionalKnowledge: ["内容流程"], positions: ["可靠优先"], preferredExpressions: ["先看证据"], brandPrinciples: ["不虚构"], forbiddenExpressions: ["保证成功"] },
    recommendedDirection: "交给高级主笔完成 60 秒口播。", risks: ["不要夸张承诺"], needsConfirmation: [],
  };
}

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      fixtureCalls += 1;
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> };
      const prompt = parsed.messages.at(-1)?.content ?? "";
      const authorized = request.headers.authorization === "Bearer deep-fixture-key";
      const validAction = prompt.includes("Action: GENERATE_DEEP_CONTENT_PACKAGE");
      response.writeHead(authorized && validAction ? 200 : 400, { "content-type": "application/json", "x-request-id": "deep-e2e-request" });
      response.end(JSON.stringify({ id: "deep-e2e-completion", model: "workspace-fixture-model", choices: [{ message: { content: JSON.stringify(deepOutput()) } }], usage: { prompt_tokens: 211, completion_tokens: 89 } }));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Deep fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}/v1`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

test("Deep Package → copy GPT task → manual import → Mother GPT_WEB → platform stale → VIEWER readonly", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Deep E2E User");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Deep E2E Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const membership = user.workspaceMemberships[0]!;
  await new IntegrationService().saveIntegrationConfig({ workspaceId: membership.workspaceId, userId: user.id, provider: "LLM", mode: "FIXTURE", config: { provider: "fixture-openai-compatible", baseUrl: fixtureOrigin, apiKey: "deep-fixture-key", model: "workspace-fixture-model" } });
  const profile = await db.creatorProfile.create({ data: { workspaceId: membership.workspaceId, userId: user.id, displayName: "Deep Creator", positioning: "可靠内容方法", targetAudience: "内容团队", tone: "直接、具体", preferredStyle: "自然", forbiddenStyle: "口号", coreTopics: [], personalViews: ["证据先于写作"], brandTerms: [], forbiddenTerms: ["保证成功"], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: ["先看证据"] } });
  const source = await db.sourceItem.create({ data: { workspaceId: membership.workspaceId, createdById: user.id, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "研究素材", rawText: "正式素材正文" } });
  sourceId = source.id;
  const project = await db.contentProject.create({ data: { workspaceId: membership.workspaceId, createdById: user.id, creatorProfileId: profile.id, title: "阶段六点五深度创作项目", goal: "完成可靠口播", sources: { create: { sourceItemId: source.id, role: "OWN_MATERIAL" } }, motherContent: { create: { workspaceId: membership.workspaceId, createdById: user.id, title: "旧母稿", body: "旧母稿正文。", outline: ["旧结构"] } }, creativeBrief: { create: { workspaceId: membership.workspaceId, createdById: user.id, topic: "可靠 AI 内容", angle: "研究优先", audience: "内容团队", coreMessage: "先研究再创作", keyPoints: ["证据"], structure: ["判断", "方法"], tone: "直接", risks: [] } } } });
  const evidence = await db.evidenceItem.create({ data: { workspaceId: membership.workspaceId, projectId: project.id, sourceItemId: source.id, type: "FACT", claim: "研究先于写作", excerpt: "正式 Evidence", sourceUrl: "https://example.test/deep", createdById: user.id } });
  evidenceId = evidence.id;
  const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId: project.id } });
  await db.platformVariant.create({ data: { workspaceId: membership.workspaceId, projectId: project.id, motherContentId: mother.id, platform: "DOUYIN", title: "旧抖音稿", body: "旧平台正文", hashtags: [], mediaPlan: {}, metadata: {}, status: "READY", sourceMotherVersion: 1, createdById: user.id } });

  await page.goto(`/projects/${project.id}/studio`);
  await page.getByRole("button", { name: /2 · 深度创作/ }).click();
  await page.getByRole("button", { name: "生成深度创作包" }).click();
  await expect(page.getByRole("heading", { name: "深度创作包预览" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "选题方案" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "观点体系" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "证据与事实边界" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "表达素材" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "结构方案" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "创作者资产" })).toBeVisible();
  await page.getByRole("button", { name: "保存创作包" }).click();
  await expect(page.getByRole("heading", { name: "已保存创作包" })).toBeVisible();

  await page.getByLabel("最终选择的选题").fill("人工确认：先研究，再创作");
  await page.getByRole("button", { name: "保存创作包编辑" }).click();
  await expect.poll(async () => (await db.deepContentPackage.findFirst({ where: { projectId: project.id, status: "READY" } }))?.topicPackage).toMatchObject({ coreTopic: "人工确认：先研究，再创作" });

  const taskResponse = page.waitForResponse((response) => response.url().includes(`/api/projects/${project.id}/gpt-task-package?`));
  await page.getByRole("button", { name: "生成 GPT 创作任务包" }).click();
  expect((await taskResponse).status()).toBe(200);
  expect(await page.getByLabel("GPT 创作任务包").inputValue()).toContain("可靠 Evidence");
  await page.getByRole("button", { name: "复制给 GPT" }).click();
  await expect(page.getByText("已复制，请前往 ChatGPT 网页版完成高级创作", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "导入 GPT 成稿" }).click();
  await page.getByLabel("GPT 成稿标题").fill("GPT Web 最终母稿");
  await page.getByLabel("GPT 成稿正文").fill("这是用户在 ChatGPT 网页版完成并人工复制回来的最终成稿。");
  await page.getByLabel("GPT 成稿备注").fill("人工确认");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "保存为母稿" }).click();
  await expect(page.getByText("GPT 网页成稿", { exact: true })).toBeVisible();
  await expect(page.getByText("1 个平台版本需要更新", { exact: true })).toBeVisible();
  await expect.poll(async () => db.motherContent.findUnique({ where: { projectId: project.id } })).toMatchObject({ version: 2, origin: "GPT_WEB", title: "GPT Web 最终母稿" });
  expect(fixtureCalls).toBe(1);
  const usage = await db.apiUsage.findMany({ where: { workspaceId: membership.workspaceId, operation: "GENERATE_DEEP_CONTENT_PACKAGE" } });
  expect(usage).toHaveLength(1);
  expect(usage[0]).toMatchObject({ inputTokens: 211, outputTokens: 89 });
  await expect(db.apiUsage.count({ where: { workspaceId: membership.workspaceId, operation: { contains: "GPT" } } })).resolves.toBe(0);

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
  await page.reload();
  await page.getByRole("button", { name: /2 · 深度创作/ }).click();
  await expect(page.getByLabel("最终选择的选题")).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新生成深度创作包" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导入 GPT 成稿" })).toHaveCount(0);
  const generateForbidden = await page.request.post(`/api/projects/${project.id}/deep-content-package/generate`);
  expect(generateForbidden.status()).toBe(403);
  const importForbidden = await page.request.post(`/api/projects/${project.id}/import-gpt-draft`, { data: { title: "No", body: "No", confirmReplace: true } });
  expect(importForbidden.status()).toBe(403);
});
