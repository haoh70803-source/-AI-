import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test, type BrowserContext } from "@playwright/test";
import { auth } from "../lib/auth";

let workspaceId = "";
let ownerId = "";
let viewerId = "";
let textId = "";
let videoId = "";
let ownerCookies: Parameters<BrowserContext["addCookies"]>[0] = [];
let viewerCookies: Parameters<BrowserContext["addCookies"]>[0] = [];
function cookies(response: Response) { return response.headers.getSetCookie().map((value) => { const pair = value.split(";")[0]!; const i = pair.indexOf("="); return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; }); }
test.beforeAll(async () => {
  const suffix = randomUUID();
  const owner = await auth.api.signUpEmail({ body: { name: "Source owner", email: `source-owner-${suffix}@example.test`, password: "source-workspace-safe-password" }, asResponse: true });
  const viewer = await auth.api.signUpEmail({ body: { name: "Source viewer", email: `source-viewer-${suffix}@example.test`, password: "source-workspace-safe-password" }, asResponse: true });
  ownerId = (await owner.clone().json() as { user: { id: string } }).user.id;
  viewerId = (await viewer.clone().json() as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId: ownerId })).id;
  await db.workspaceMember.create({ data: { workspaceId, userId: viewerId, role: "VIEWER" } });
  ownerCookies = cookies(owner); viewerCookies = cookies(viewer);
  textId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", title: "Source workspace text", rawText: "第一段原始正文\n第二段待查找的内容", status: "READY" } })).id;
  videoId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", title: "Source workspace video", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "有效时间片段", segments: [{ startMs: 1000, endMs: 3000, text: "有效时间片段" }] } } } })).id;
});
test.afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } }); await db.$disconnect(); });

test("source workspace reads, saves raw text, renames and links conversation", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.context().addCookies(ownerCookies);
  await page.setViewportSize({ width: 1680, height: 945 });
  await page.goto(`/library/${textId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("heading", { name: "Source workspace text", exact: true })).toBeVisible();
  await expect(page.getByText("AI 一句话总结", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "资料管理", exact: true })).toHaveCount(0);
  await expect(page.locator(".source-preview-slot")).toHaveCount(0);
  await page.getByLabel("搜索文字内容").fill("第二段");
  await expect(page.locator(".source-text-content")).toContainText("第二段待查找");
  await expect(page.locator(".source-text-content")).not.toContainText("第一段原始");
  await page.locator(".source-text").getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("编辑资料文字").fill("这是编辑后保存的正文。");
  await page.getByRole("button", { name: "保存文字" }).click();
  await expect.poll(async () => (await db.sourceItem.findUniqueOrThrow({ where: { id: textId } })).rawText).toBe("这是编辑后保存的正文。");
  await page.getByLabel("搜索文字内容").fill("");
  await page.getByRole("button", { name: "编辑资料标题" }).click();
  await page.getByRole("dialog", { name: "编辑资料标题" }).getByLabel("名称").fill("重命名的资料");
  await page.getByRole("dialog", { name: "编辑资料标题" }).getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "重命名的资料", exact: true })).toBeVisible();
  for (const width of [390, 768, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 945 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.locator(".source-workspace-actions").evaluate((bar) => [...bar.children].every((child) => child.getBoundingClientRect().right <= innerWidth))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const box = await page.locator(".source-reader").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: info.outputPath(`source-workspace-${width}.png`) });
  }
  await page.getByRole("button", { name: "基于此资料对话", exact: true }).click();
  await expect(page).toHaveURL(/dashboard\?project=/);
  const id = new URL(page.url()).searchParams.get("project")!;
  expect(await db.projectSource.count({ where: { projectId: id, sourceItemId: textId } })).toBe(1);
  expect(await db.materialAnalysis.count({ where: { sourceItemId: textId } })).toBe(0);
});

test("single-screen text fills the workspace and only the text pane scrolls", async ({ page }) => {
  await page.context().addCookies(ownerCookies);
  await db.sourceItem.update({ where: { id: textId }, data: { rawText: Array.from({ length: 120 }, (_, index) => `第 ${index + 1} 段：用于验证长正文独立滚动，页面本身不产生纵向滚动。`).join("\n") } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/library/${textId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.getByRole("button", { name: "专注阅读", exact: true }).click();
  await expect(page.locator(".source-preview-slot")).toBeHidden();
  const area = await page.locator(".source-text-content").boundingBox();
  expect(area!.height).toBeGreaterThan(450);
  expect(area!.width).toBeGreaterThan(1100);
  expect(await page.locator(".source-text-content").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.locator(".source-text-content").evaluate((element) => { element.scrollTop = 600; });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole("button", { name: "退出专注" }).click();
  await page.getByRole("button", { name: "资料信息", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "资料信息", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "处理状态", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭资料信息" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test("transcript updates remove stale timings and stale writes return 409", async ({ page }) => {
  await page.context().addCookies(ownerCookies);
  await page.goto(`/library/${videoId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("button", { name: "SRT", exact: true })).toBeVisible();
  await expect(page.locator(".source-transcript-line")).toHaveCount(0);
  await page.getByRole("button", { name: "时间戳", exact: true }).click();
  await expect(page.locator(".source-transcript-line")).toHaveCount(1);
  await page.getByRole("button", { name: "连续正文", exact: true }).click();
  const original = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: videoId } });
  const response = await page.request.put(`/api/source-items/${videoId}/transcript`, { data: { fullText: "更新后的转录正文", expectedUpdatedAt: original.updatedAt.toISOString() } });
  expect(response.status()).toBe(200);
  expect((await db.transcript.findUniqueOrThrow({ where: { sourceItemId: videoId } })).segments).toEqual([]);
  expect((await page.request.put(`/api/source-items/${videoId}/transcript`, { data: { fullText: "过期写入", expectedUpdatedAt: original.updatedAt.toISOString() } })).status()).toBe(409);
  await page.reload();
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("button", { name: "SRT", exact: true })).toHaveCount(0);
  await expect(page.locator(".source-text-content")).toContainText("更新后的转录正文");
});

test("viewer reads source workspace but cannot modify or start a project", async ({ page }) => {
  await page.context().addCookies(viewerCookies);
  await page.goto(`/library/${textId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("button", { name: "编辑资料标题" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "基于此资料对话" })).toHaveCount(0);
  expect((await page.request.patch(`/api/source-items/${textId}`, { data: { action: "UPDATE", title: "Denied" } })).status()).toBe(403);
  expect((await page.request.put(`/api/source-items/${textId}/transcript`, { data: { fullText: "Denied" } })).status()).toBe(403);
  expect((await page.request.post(`/api/projects`, { data: { title: "Denied", sourceItemId: textId } })).status()).toBe(403);
});

test("transcription progress and new text appear without a manual page refresh", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(ownerCookies);
  await page.goto(`/library/${videoId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  let jobId = "";
  let requests = 0;
  await page.route(`**/api/source-items/${videoId}/transcribe`, async (route) => {
    requests += 1;
    const job = await db.ingestJob.create({ data: {
      workspaceId, sourceItemId: videoId, requestedById: ownerId,
      jobType: "TRANSCRIBE", provider: "LOCAL_FUNASR", providerMode: "REAL", status: "QUEUED",
      progress: 0, metadata: { progressStage: "QUEUED" },
    } });
    jobId = job.id;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ jobId, status: "QUEUED" }) });
  });
  await page.getByRole("button", { name: "资料信息", exact: true }).click();
  await page.getByRole("dialog", { name: "资料信息" }).getByRole("button", { name: "重新转录" }).click();
  await page.getByRole("button", { name: "关闭资料信息" }).click();
  const state = page.getByRole("region", { name: "转录状态" });
  await expect(state).toContainText("排队");
  expect(requests).toBe(1);
  expect(jobId).toBeTruthy();
  // The old poller skipped every request while the browser reported a hidden tab.
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }));

  await db.ingestJob.update({ where: { id: jobId }, data: { status: "RUNNING", progress: 5, metadata: { progressStage: "EXTRACTING_AUDIO" } } });
  await expect(state).toContainText("正在提取音频", { timeout: 15_000 });
  await expect(page.getByRole("progressbar", { name: "转录处理进度" })).toHaveAttribute("value", "5");

  await db.ingestJob.update({ where: { id: jobId }, data: { progress: 65, metadata: { progressStage: "TRANSCRIBING" } } });
  await expect(state).toContainText("正在转写", { timeout: 15_000 });
  await expect(page.getByRole("progressbar", { name: "转录处理进度" })).toHaveAttribute("value", "65");

  await db.$transaction([
    db.transcript.update({ where: { sourceItemId: videoId }, data: { fullText: "无需手动刷新即可看见的文字稿", segments: [] } }),
    db.ingestJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", progress: 100, metadata: { progressStage: "SUCCEEDED" }, finishedAt: new Date() } }),
  ]);
  await expect(page.locator(".source-text-content")).toContainText("无需手动刷新即可看见的文字稿", { timeout: 20_000 });
  await expect(state).toHaveCount(0);
  expect(requests).toBe(1);

  await db.ingestJob.create({ data: {
    workspaceId, sourceItemId: videoId, requestedById: ownerId,
    jobType: "TRANSCRIBE", provider: "LOCAL_FUNASR", providerMode: "REAL", status: "FAILED",
    errorCode: "LOCAL_ASR_NOT_RUNNING", errorMessage: "转录服务暂不可用，请重试。", finishedAt: new Date(),
  } });
  await page.reload();
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("region", { name: "转录状态" })).toContainText("转录服务暂不可用，请重试。");
  await expect(page.getByRole("button", { name: "重试转录", exact: true }).first()).toBeEnabled();
  await expect(page.locator(".source-text-content")).toContainText("无需手动刷新即可看见的文字稿");
});
