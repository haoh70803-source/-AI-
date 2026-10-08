import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { getStorageProvider } from "@content-center/providers";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

let userId = ""; let workspaceId = ""; let methodVersionId = "";
let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];
test.beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== "LOCAL_TEST") throw new Error("LOCAL_TEST required");
  const registered = await auth.api.signUpEmail({ body: { name: "Composer QA", email: `composer-${randomUUID()}@example.test`, password: "composer-test-password" }, asResponse: true });
  expect(registered.ok).toBe(true); userId = ((await registered.clone().json()) as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  cookies = registered.headers.getSetCookie().map((value) => { const pair = value.split(";")[0]!; const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; });
  const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "SAVED" } });
  methodVersionId = (await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: "真实案例写作", steps: ["先核对资料，再使用自然语言表达。"], applicableScenarios: ["文案"], boundaries: ["不编造"], evidence: [], editedById: userId } })).id;
});
test.afterAll(async () => {
  const assets = await db.sourceAsset.findMany({ where: { workspaceId }, select: { id: true, sourceItemId: true, storageKey: true } });
  for (const asset of assets) if (asset.storageKey) await getStorageProvider().delete(asset.storageKey, { workspaceId, sourceItemId: asset.sourceItemId, assetId: asset.id });
  await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect();
});

test("native files, Skill and folder reach the first candidate and survive refresh", async ({ page }, info) => {
  test.setTimeout(90_000); await page.context().addCookies(cookies); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard");
  const chooserPromise = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "添加本地文件" }).click();
  const chooser = await chooserPromise; expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([{ name: "课程资料.txt", mimeType: "text/plain", buffer: Buffer.from("真实资料：课程每周反馈学习过程，文案需要尊重事实。") }, { name: "不支持.exe", mimeType: "application/octet-stream", buffer: Buffer.from("invalid") }]);
  await expect(page.getByText("文字已就绪", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".home-attachment.is-failed")).toHaveCount(1);
  await page.getByLabel("描述你想完成的事情").fill("写一篇关于课程反馈的文案，面向家长，使用所附资料。");
  await expect(page.getByRole("button", { name: "开始创作" })).toBeDisabled();
  await page.getByRole("button", { name: "移除附件 不支持.exe" }).click();
  await page.locator(".home-composer").getByRole("button", { name: "Skill", exact: true }).click();
  await page.getByRole("dialog", { name: "选择 Skill" }).getByRole("checkbox", { name: /真实案例写作/ }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "选择项目", exact: true }).click();
  await page.getByLabel("新项目文件夹名称").fill("首页创作验收"); await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.locator(".home-project-bar")).toContainText("首页创作验收");
  await page.reload();
  await expect(page.locator(".home-selected-skills")).toContainText("真实案例写作");
  await expect(page.getByText("文字已就绪", { exact: true })).toBeVisible();
  for (const width of [760, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("button", { name: "选择创作模型" }).click();
    await expect(page.getByRole("dialog", { name: "选择模型" })).toBeVisible();
    const popup = (await page.getByRole("dialog", { name: "选择模型" }).boundingBox())!;
    expect(popup.x).toBeGreaterThanOrEqual(0); expect(popup.x + popup.width).toBeLessThanOrEqual(width); expect(popup.y).toBeGreaterThanOrEqual(0); expect(popup.y + popup.height).toBeLessThanOrEqual(1000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`composer-${width}.png`) }); await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "选择创作模型" })).toBeFocused();
  }
  await page.getByRole("button", { name: "开始创作" }).click();
  await expect(page).toHaveURL(/project=.+&start=1/); const projectId = new URL(page.url()).searchParams.get("project")!;
  await expect(page.getByTestId("workspace-artifact-view").getByText("候选稿 · 未保存")).toBeVisible({ timeout: 40_000 });
  expect(await db.projectMethodSelection.findFirst({ where: { projectId } })).toMatchObject({ methodVersionId });
  expect(await db.userProjectPreference.findFirst({ where: { projectId }, include: { folder: true } })).toMatchObject({ folder: { name: "首页创作验收" } });
  const run = await db.aIRun.findFirst({ where: { projectId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } });
  expect(JSON.stringify(run?.metadata)).toContain("课程每周反馈学习过程");
  await page.getByTestId("workspace-artifact-view").getByRole("button", { name: "保存为稿件" }).click();
  await expect.poll(() => db.artifact.count({ where: { projectId } })).toBe(1);
});

test("waits for transcription and shows only configured-provider models", async ({ page }) => {
  test.setTimeout(60_000); await page.context().addCookies(cookies);
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "等待转写的访谈", sourceType: "VIDEO", sourcePlatform: "GENERIC", status: "READY", ingestJobs: { create: { workspaceId, requestedById: userId, jobType: "EXTRACT_TEXT", provider: "FILE_READER", providerMode: "MOCK", status: "QUEUED" } } } });
  await page.goto("/dashboard"); await page.getByLabel("描述你想完成的事情").fill("写一篇关于访谈的文案");
  await page.getByRole("button", { name: "资料库", exact: true }).click(); await page.getByRole("checkbox", { name: "等待转写的访谈" }).check(); await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "开始创作" })).toBeDisabled();
  await db.transcript.create({ data: { workspaceId, sourceItemId: source.id, provider: "TEST", providerMode: "MOCK", fullText: "已经完成的访谈转写内容，包含真实课程信息。", segments: [] } });
  await expect(page.getByText("文字已就绪", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "开始创作" })).toBeEnabled();
  await db.integrationConfig.create({ data: { workspaceId, provider: "LLM", status: "CONFIGURED", configured: true, publicConfig: { provider: "DEEPSEEK", modelId: "deepseek-flash", baseUrl: "https://api.deepseek.com" } } });
  await page.getByRole("button", { name: "选择创作模型" }).click();
  await expect(page.getByRole("button", { name: /DeepSeek V4 Pro/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "选择模型" })).not.toContainText("Kimi");
  await page.getByRole("button", { name: /DeepSeek V4 Pro/ }).click();
  await expect(page.getByRole("button", { name: "选择创作模型" })).toContainText("DeepSeek V4 Pro");
  expect((await db.integrationConfig.findFirst({ where: { workspaceId, provider: "LLM" } }))?.publicConfig).toMatchObject({ modelId: "deepseek-flash" });
  await db.integrationConfig.delete({ where: { workspaceId_provider: { workspaceId, provider: "LLM" } } });
});

test("supports dropping text and pasting images, checks capacity and model image capability", async ({ page }) => {
  test.setTimeout(60_000); await page.context().addCookies(cookies); await page.goto("/dashboard");
  await page.getByLabel("上传本地文件").setInputFiles(Array.from({ length: 9 }, (_, index) => ({ name: `note-${index}.txt`, mimeType: "text/plain", buffer: Buffer.from("测试资料") })));
  await expect(page.getByText("本地文件与资料库引用合计最多 8 条，请减少文件后重试。")).toBeVisible();
  await expect(page.locator(".home-attachment")).toHaveCount(0);
  await page.locator(".home-composer").evaluate((element) => { const transfer = new DataTransfer(); transfer.items.add(new File(["拖入的实际文字：课程介绍要讲清具体过程。"], "拖入文档.md", { type: "text/markdown" })); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await page.getByLabel("描述你想完成的事情").evaluate((element) => { const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII="), (character) => character.charCodeAt(0)); const transfer = new DataTransfer(); transfer.items.add(new File([bytes], "粘贴图片.png", { type: "image/png" })); element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer })); });
  await expect(page.getByText("图片已就绪", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("文字已就绪", { exact: true })).toBeVisible();
  await db.integrationConfig.create({ data: { workspaceId, provider: "LLM", status: "CONFIGURED", configured: true, publicConfig: { provider: "DEEPSEEK", modelId: "deepseek-flash", baseUrl: "https://api.deepseek.com" } } });
  await page.getByRole("button", { name: "选择创作模型" }).click(); await expect(page.getByRole("button", { name: /DeepSeek V4 Pro/ })).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByText("这些图片需要支持图片的模型，请切换模型或移除图片。")).toBeVisible();
  await page.getByLabel("描述你想完成的事情").fill("写一篇关于课程介绍的文案，参考图片和文档。");
  await expect(page.getByRole("button", { name: "开始创作" })).toBeDisabled();
  await db.integrationConfig.delete({ where: { workspaceId_provider: { workspaceId, provider: "LLM" } } });
  await page.getByRole("button", { name: "选择创作模型" }).click(); await expect(page.getByRole("dialog", { name: "选择模型" }).getByText("测试模型", { exact: true })).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "开始创作" }).click();
  await expect(page.getByTestId("workspace-artifact-view").getByText("候选稿 · 未保存")).toBeVisible({ timeout: 30_000 });
});
