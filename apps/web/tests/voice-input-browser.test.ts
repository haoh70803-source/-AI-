import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
const origin = "http://localhost:3022";
let browser: Browser, context: BrowserContext, userId = "", workspaceId = "", projectId = "";
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || new URL(process.env.DATABASE_URL!).port !== "55438") throw Error("ISOLATED_REVIEW_REQUIRED");
  const email = `voice-browser-${randomUUID()}@example.test`, password = randomUUID();
  userId = (await auth.api.signUpEmail({ body: { name: "语音验收", email, password } })).user.id;
  workspaceId = (await db.workspace.create({ data: { name: "语音验收", slug: randomUUID(), members: { create: { userId, role: "OWNER" } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "语音输入验收项目" } })).id;
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true }); expect(response.ok).toBe(true);
  browser = await chromium.launch({ channel: "msedge", headless: true }); context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(response.headers.getSetCookie().map(value => { const pair = value.split(";")[0]!, index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), url: origin }; }));
  await context.addInitScript(() => {
    const state = { stops: 0, fail: false, recordings: 0 }; Object.assign(window, { voiceFixture: state });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { if (state.fail) throw new DOMException("Denied", "NotAllowedError"); return { getTracks: () => [{ stop: () => state.stops++ }] }; } } });
    class Recorder {
      static isTypeSupported() { return true; }
      state = "inactive"; ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
      start() { this.state = "recording"; state.recordings++; }
      stop() { if (this.state !== "recording") return; this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["fixture audio"], { type: "audio/webm" }) }); queueMicrotask(() => this.onstop?.()); }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: Recorder });
  });
}, 60000);
afterAll(async () => { await context?.close(); await browser?.close(); if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); if (userId) await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
it("does not enable the microphone before client initialization", async () => {
  const response = await context.request.get(origin + "/dashboard"); expect(response.ok()).toBe(true);
  const microphone = (await response.text()).match(/<button[^>]*aria-label="语音输入"[^>]*>/)?.[0];
  expect(microphone).toContain('disabled=""');
});
it("records beside send, appends text without sending, cancels cleanly and shows permission/config failures", async () => {
  const page = await context.newPage(); page.setDefaultTimeout(30000); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  let posts = 0, missing = false;
  await page.route("**/api/voice-input", route => {
    if (route.request().method() === "GET") return route.fulfill({ status: missing ? 409 : 200, contentType: "application/json", body: JSON.stringify(missing ? { message: "请配置语音识别 API Key" } : { available: true }) });
    posts++; return route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "这是一段语音输入" }) });
  });
  await page.goto(origin + "/dashboard?project=" + projectId, { waitUntil: "domcontentloaded", timeout: 90000 });
  const input = page.getByRole("textbox", { name: "和鑫小助说" }); await input.waitFor(); await page.locator(".studio-assistant-loading").waitFor({ state: "hidden", timeout: 60000 }); await input.fill("原来的文字");
  const microphone = page.getByRole("button", { name: "语音输入", exact: true }); const send = page.getByRole("button", { name: "发送给鑫小助", exact: true });
  const micRect = await microphone.boundingBox(), sendRect = await send.boundingBox(); expect(micRect!.height).toBe(sendRect!.height); expect(micRect!.x).toBeLessThan(sendRect!.x);
  await microphone.click(); await page.getByRole("button", { name: "停止录音并识别" }).click();
  await page.getByText("已加入输入框，可修改后发送。", { exact: true }).waitFor(); expect(await input.inputValue()).toBe("原来的文字\n这是一段语音输入"); expect(posts).toBe(1);
  expect(await db.assistantMessage.count({ where: { thread: { projectId }, role: "USER" } })).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await microphone.click(); await page.getByRole("button", { name: "取消语音输入" }).click(); expect(posts).toBe(1);
  const composer = page.locator(".studio-assistant-composer"); expect(await composer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { (window as unknown as { voiceFixture: { fail: boolean } }).voiceFixture.fail = true; });
  await microphone.click(); await page.getByText("麦克风权限未开启，请允许访问后重试。", { exact: true }).waitFor(); expect(await input.inputValue()).toContain("原来的文字");
  missing = true; await microphone.click(); await page.getByText("请配置语音识别 API Key", { exact: true }).waitFor();
  expect(await page.evaluate(() => (window as unknown as { voiceFixture: { stops: number } }).voiceFixture.stops)).toBeGreaterThanOrEqual(2);
  await mkdir(resolve("output/voice-input-qa"), { recursive: true }); await page.screenshot({ path: resolve("output/voice-input-qa/工作台语音输入.png") });
  missing = false; await page.evaluate(() => { (window as unknown as { voiceFixture: { fail: boolean } }).voiceFixture.fail = false; });
  await microphone.click(); await page.getByRole("button", { name: "停止录音并识别" }).waitFor();
  await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded", timeout: 90000 });
  const starter = page.getByRole("textbox", { name: "描述你想完成的事情" }); await starter.waitFor(); expect(posts).toBe(1);
  await starter.fill("开始时的文字"); await page.getByRole("button", { name: "语音输入", exact: true }).click();
  try { await page.getByRole("button", { name: "停止录音并识别" }).waitFor({ timeout: 5000 }); }
  catch (error) { await page.screenshot({ path: resolve("output/voice-input-qa/语音输入失败诊断.png") }); console.error("VOICE_START_DIAGNOSTIC", await page.locator(".voice-input").textContent(), await page.evaluate(() => (window as unknown as { voiceFixture: unknown }).voiceFixture)); throw error; }
  await page.getByRole("button", { name: "停止录音并识别" }).click();
  await page.getByText("已加入输入框，可修改后发送。", { exact: true }).waitFor(); expect(await starter.inputValue()).toBe("开始时的文字\n这是一段语音输入"); expect(posts).toBe(2);
  expect(errors).toEqual([]); await page.close();
}, 120000);

it("settles abandoned video processing and exposes retry, reupload and link transcription", async () => {
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "VIDEO", title: "超时视频验收", status: "PENDING" } });
  const staleJob = await db.ingestJob.create({ data: { workspaceId, sourceItemId: source.id, requestedById: userId, provider: "DIRECT_MEDIA", providerMode: "REAL", jobType: "PROCESS_MEDIA", status: "QUEUED", updatedAt: new Date(Date.now() - 10 * 60000) } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  await page.goto(origin + "/library/" + source.id, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.getByRole("button", { name: "重试读取", exact: true }).waitFor();
  expect(await page.getByRole("alert").filter({ hasText: "文件处理未完成" }).count()).toBe(1);
  expect((await db.ingestJob.findUnique({ where: { id: staleJob.id } }))!.status).toBe("FAILED");
  await page.getByRole("link", { name: "重新上传", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加资料" }); await dialog.waitFor();
  await dialog.getByRole("button", { name: "视频链接", exact: true }).click();
  expect(await dialog.getByRole("checkbox", { name: "获取视频后自动生成文字稿" }).isChecked()).toBe(true);
  await dialog.locator('[name="shareText"]').fill("https://media.example/video.mp4");
  await page.route("**/api/source-items", route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "DOUBAO_NOT_CONFIGURED", message: "请先配置 API Key 后重试" }) }));
  await dialog.getByRole("button", { name: "添加并处理视频", exact: true }).click(); await dialog.getByText("请先配置 API Key 后重试", { exact: true }).waitFor();
  expect(await dialog.getByRole("button", { name: "添加并处理视频", exact: true }).isEnabled()).toBe(true);
  await page.screenshot({ path: resolve("output/voice-input-qa/资料链接与重试.png") }); await page.close();
}, 120000);
