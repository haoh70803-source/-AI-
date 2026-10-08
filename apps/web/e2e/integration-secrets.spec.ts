import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `configuration-owner-${runId}@example.test`;
const otherEmail = `configuration-other-${runId}@example.test`;
const password = "safe-e2e-password";
const redfoxSecret = `redfox-${runId}`;
const doubaoSecret = `doubao-${runId}`;
const kimiSecret = `kimi-${runId}`;
const deepSeekSecret = `deepseek-${runId}`;

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => { const [pair] = header.split(";", 1); const separator = pair!.indexOf("="); return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; });
}

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: [email, otherEmail] } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length > 0) await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  await db.$disconnect();
});

test("AI settings securely configures Kimi and DeepSeek catalog models", async ({ page }) => {
  const registration = await auth.api.signUpEmail({ body: { name: "Configuration Owner", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  const registered = await registration.clone().json() as { user: { id: string } };
  await ensurePersonalWorkspaceForUser(db, { userId: registered.user.id });
  await page.context().addCookies(sessionCookies(registration));
  const user = await db.user.findUniqueOrThrow({ where: { id: registered.user.id } });
  const membership = await db.workspaceMember.findFirstOrThrow({ where: { userId: user.id } });
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { name: "AI 与外部服务" })).toBeVisible();

  const redfox = page.getByLabel("RedFox 配置");
  await expect(redfox.getByLabel("RedFox Base URL")).toHaveValue("https://redfox.hk");
  await redfox.getByLabel("RedFox Base URL").fill("https://redfox.example.invalid");
  await redfox.getByLabel("RedFox API Key").fill(redfoxSecret);
  await redfox.getByRole("button", { name: "保存配置" }).click();
  await expect(redfox.getByText("已配置", { exact: true })).toBeVisible();
  await expect(redfox.getByLabel("RedFox 已保存凭证")).toContainText(redfoxSecret.slice(-4));

  const doubao = page.getByLabel("豆包语音识别 配置");
  await expect(doubao.getByLabel("豆包语音识别 Resource ID")).toHaveValue("volc.bigasr.auc_turbo");
  await doubao.getByLabel("豆包语音识别 API Key").fill(doubaoSecret);
  await doubao.getByRole("button", { name: "保存配置" }).click();
  await expect(doubao.getByText("已配置", { exact: true })).toBeVisible();

  const ai = page.getByLabel("AI 模型 配置");
  await expect(ai.getByLabel("AI Provider")).toHaveValue("KIMI");
  await expect(ai.getByLabel("AI 默认模型")).toHaveValue("kimi-k2.6");
  await ai.getByLabel("AI API Key").fill(kimiSecret);
  await ai.getByRole("button", { name: "保存配置" }).click();
  await expect(ai.getByText("已配置", { exact: true })).toBeVisible();
  await ai.getByLabel("AI Provider").selectOption("DEEPSEEK");
  await expect(ai.getByLabel("AI 默认模型")).toHaveValue("deepseek-v4-flash");
  await ai.getByLabel("AI 默认模型").selectOption("deepseek-v4-pro");
  await expect(ai.getByLabel("AI Base URL")).toHaveValue("https://api.deepseek.com");
  await ai.getByLabel("AI API Key").fill(deepSeekSecret);
  await ai.getByRole("button", { name: "保存配置" }).click();
  await expect(ai.getByText("当前模型：DeepSeek V4 Pro")).toBeVisible();

  for (const secret of [redfoxSecret, doubaoSecret, kimiSecret, deepSeekSecret]) {
    expect(await page.locator("body").innerText()).not.toContain(secret);
    expect(await page.content()).not.toContain(secret);
  }

  await page.reload();
  for (const name of ["RedFox", "豆包语音识别", "AI 模型"]) {
    await expect(page.getByLabel(`${name} 配置`).getByText("已配置", { exact: true })).toBeVisible();
  }
  for (const secret of [redfoxSecret, doubaoSecret, kimiSecret, deepSeekSecret]) expect(await page.content()).not.toContain(secret);

  const storedAI = await db.integrationConfig.findUniqueOrThrow({
    where: { workspaceId_provider: { workspaceId: membership.workspaceId, provider: "LLM" } },
  });
  expect(storedAI.encryptedConfig).not.toContain(deepSeekSecret);

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "ADMIN" } });
  await page.reload();
  await page.getByLabel("AI 模型 配置").getByLabel("AI 默认模型").selectOption("deepseek-v4-flash-vision-exp");
  const modelUpdateResponse = page.waitForResponse((response) => response.url().endsWith("/api/integrations/LLM") && response.request().method() === "PUT");
  await page.getByLabel("AI 模型 配置").getByRole("button", { name: "保存配置" }).click();
  expect((await modelUpdateResponse).status()).toBe(200);
  const service = new IntegrationService();
  await expect(service.getDecryptedIntegrationConfig(membership.workspaceId, "LLM")).resolves.toMatchObject({ provider: "DEEPSEEK", apiKey: deepSeekSecret, model: "deepseek-v4-flash-vision-exp" });
  await expect(page.getByLabel("AI 模型 配置").getByLabel("AI 模型 已保存凭证")).toContainText(deepSeekSecret.slice(-4));
  expect(await page.content()).not.toContain(deepSeekSecret);

  const unknownModel = await page.request.put("/api/integrations/llm", { data: { config: { provider: "DEEPSEEK", modelId: "deepseek-v5" } } });
  expect(unknownModel.status()).toBe(400);

  const redfoxPublicUpdate = await page.request.put("/api/integrations/redfox", { data: { config: { baseUrl: "https://changed-redfox.example.invalid" } } });
  expect(redfoxPublicUpdate.status()).toBe(200);
  await expect(service.getDecryptedIntegrationConfig(membership.workspaceId, "REDFOX")).resolves.toMatchObject({ apiKey: redfoxSecret, baseUrl: "https://changed-redfox.example.invalid" });

  const replacementSecret = `replacement-${runId}`;
  const redfoxReplacement = await page.request.put("/api/integrations/redfox", { data: { config: { baseUrl: "https://changed-redfox.example.invalid", apiKey: replacementSecret } } });
  expect(redfoxReplacement.status()).toBe(200);
  const redfoxReplacementText = await redfoxReplacement.text();
  expect(redfoxReplacementText).not.toContain(replacementSecret);
  expect((JSON.parse(redfoxReplacementText) as { lastFour: string }).lastFour).toBe(replacementSecret.slice(-4));

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "EDITOR" } });
  const editorUpdate = await page.request.put("/api/integrations/redfox", { data: { config: { baseUrl: "https://forbidden.invalid", apiKey: "editor-must-not-save" } } });
  expect(editorUpdate.status()).toBe(403);
  const editorRead = await page.request.get("/api/integrations/redfox");
  expect(await editorRead.json()).toMatchObject({ status: "CONFIGURED", publicConfig: {}, lastFour: null });
  await page.reload();
  await expect(page.getByLabel("AI Provider")).toHaveCount(0);

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
  const viewerUpdate = await page.request.put("/api/integrations/llm", { data: { config: { provider: "DEEPSEEK", modelId: "deepseek-v4-pro", apiKey: "viewer-must-not-save" } } });
  expect(viewerUpdate.status()).toBe(403);

  const otherUser = await db.user.create({ data: { name: "Other Configuration User", email: otherEmail } });
  const otherWorkspace = await db.workspace.create({
    data: { name: "Other Configuration Workspace", slug: `other-configuration-${runId}`, members: { create: { userId: otherUser.id, role: "OWNER" } } },
  });
  const otherSecret = `other-${runId}`;
  await service.saveIntegrationConfig({ workspaceId: otherWorkspace.id, userId: otherUser.id, provider: "LLM", config: { provider: "DEEPSEEK", modelId: "deepseek-v4-flash", apiKey: otherSecret } });
  const isolatedResponse = await page.request.get("/api/integrations/llm");
  const isolatedText = await isolatedResponse.text();
  expect(isolatedText).not.toContain(otherSecret);
  expect(isolatedText).not.toContain(otherSecret.slice(-4));
  expect(isolatedText).not.toContain("deepseek-v4-flash");
});
