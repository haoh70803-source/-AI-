import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, onTestFailed, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { createTextArtifact } from "../server/artifacts/service";
import { createResearchSession, reserveResearchRun } from "../server/research/service";
const origin = "http://localhost:3020", out = resolve(process.cwd(), process.env.FINAL_ACCEPTANCE_OUTPUT || "__missing_final_output");
let browser: Browser, owner: BrowserContext, viewer: BrowserContext;
let userId = "", viewerId = "", foreignId = "", workspaceId = "", foreignWorkspace = "", projectA = "", projectB = "", foreignProject = "", artifactA = "", sessionId = "", runId = "";
const checks: string[] = []; const evidenceStamp = new Date().toISOString().replaceAll(/[-:.]/g, "") + "-" + randomUUID().slice(0,8);
async function signIn(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true }); expect(response.ok).toBe(true);
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await context.addCookies(response.headers.getSetCookie().map(value => { const pair = value.split(";")[0]!, index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), url: origin }; })); return context;
}
async function makeArtifact(projectId: string, title: string, content: string, actor = userId, ws = workspaceId) {
  const thread = await db.assistantThread.findFirst({ where: { projectId } }) ?? await db.assistantThread.create({ data: { workspaceId: ws, projectId, createdById: actor } });
  const message = await db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content } });
  return (await createTextArtifact({ workspaceId: ws, userId: actor, projectId, title, sourceMessageId: message.id })).artifactId;
}
beforeAll(async () => {
  if (!process.env.FINAL_ACCEPTANCE_OUTPUT?.startsWith("output/workbench-final-acceptance-20261005/acceptance-") && !process.env.FINAL_ACCEPTANCE_OUTPUT?.startsWith("output/research-experience-20261005/implementation-")) throw Error("UNIQUE_FINAL_OUTPUT_REQUIRED");
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || url.port !== "55436" || !url.pathname.includes("content_center_upgrade_review") || process.env.EXTERNAL_SERVICES_DISABLED !== "true") throw Error("ISOLATED_REVIEW_ONLY");
  const suffix = randomUUID(), password = "fixture-" + randomUUID(), email = "final-navigation-" + suffix + "@example.test", viewerEmail = "final-navigation-viewer-" + suffix + "@example.test";
  userId = (await auth.api.signUpEmail({ body: { name: "Shared Editor Owner", email, password } })).user.id;
  viewerId = (await auth.api.signUpEmail({ body: { name: "Shared Editor Viewer", email: viewerEmail, password } })).user.id;
  foreignId = (await db.user.create({ data: { name: "Shared Foreign Owner", email: "final-navigation-foreign-" + suffix + "@example.test" } })).id;
  workspaceId = (await db.workspace.create({ data: { name: "Shared Editor Fixture", slug: "final-navigation-" + suffix, members: { create: [{ userId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
  foreignWorkspace = (await db.workspace.create({ data: { name: "Foreign Fixture", slug: "final-navigation-foreign-" + suffix, members: { create: { userId: foreignId, role: "OWNER" } } } })).id;
  projectA = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "共享编辑项目甲" } })).id;
  projectB = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "共享编辑项目乙" } })).id;
  foreignProject = (await db.contentProject.create({ data: { workspaceId: foreignWorkspace, createdById: foreignId, title: "Foreign Project" } })).id;
  artifactA = await makeArtifact(projectA, "共享成果甲", "甲的初始正文");
  await makeArtifact(projectA, "共享成果乙", "乙的独立正文");
  await makeArtifact(projectB, "另一项目成果", "项目乙独立正文");
  await makeArtifact(foreignProject, "Foreign Artifact", "Foreign protected body", foreignId, foreignWorkspace);
  sessionId = (await createResearchSession({ workspaceId, userId }, { title: "共享编辑研究", entryTemplate: "DIRECT", requestKey: randomUUID() })).id;
  runId = (await reserveResearchRun({ workspaceId, userId }, sessionId, { question: "隔离研究夹具", requestKey: randomUUID() })).run.id;
  await db.researchRun.update({ where: { id: runId }, data: { status: "COMPLETED", finishedAt: new Date(), savedAt: new Date(), blocks: [{ id: "fixture-text", type: "text", title: "研究方向", text: "已确认的研究夹具内容", sourceRefs: [], provenance: "AI_INTERPRETATION", limitation: "仅测试夹具" }] } });
  browser = await chromium.launch({ channel: "msedge", headless: true }); owner = await signIn(email, password); viewer = await signIn(viewerEmail, password);
}, 90_000);
afterAll(async () => {
  await owner?.close(); await viewer?.close(); await browser?.close();
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspace].filter(Boolean) } } });
  await db.user.deleteMany({ where: { id: { in: [userId, viewerId, foreignId].filter(Boolean) } } });
  const remaining = await db.user.count({ where: { id: { in: [userId, viewerId, foreignId].filter(Boolean) } } });
  await writeFile(resolve(out, "browser-evidence-" + evidenceStamp + ".json"), JSON.stringify({ checks, fixtureUsersRemaining: remaining, formalDatabaseWrites: 0, realModelCalls: 0, realArtifactAPI: true, usesPersonalPassword: false }, null, 2)); expect(remaining).toBe(0); await db.$disconnect();
}, 60_000);

function failureEvidence(page: Page, name: string) { onTestFailed(async () => { await page.screenshot({ path: resolve(out, name + "-failure-" + evidenceStamp + ".png"), fullPage: true }).catch(() => undefined); await writeFile(resolve(out, name + "-failure-" + evidenceStamp + ".json"), JSON.stringify(await page.evaluate(() => ({ path: location.pathname + location.search, dialogs: [...document.querySelectorAll("dialog")].map(d => ({ label: d.getAttribute("aria-label"), open: d.open })), bodies: [...document.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="成果正文"]')].map(t => t.value) })), null, 2), { flag: "wx" }); }); }
const dashboard = () => origin + "/dashboard?project=" + projectA + "&node=artifact:" + artifactA;
const api = () => origin + "/api/projects/" + projectA + "/artifacts/" + artifactA;
async function openArtifact(page: Page) { await page.goto(dashboard(), { waitUntil: "domcontentloaded", timeout: 90_000 }); await page.getByRole("dialog", { name: "项目成果", exact: true }).waitFor(); await page.getByLabel("成果正文", { exact: true }).waitFor(); }
async function state() { const response = await owner.request.get(api()); expect(response.status()).toBe(200); return await response.json() as { version: number; content: string }; }
async function cancelNativeNavigation(page: Page, direction: "back" | "forward") {
  const dialog = page.waitForEvent("dialog");
  const navigation = (direction === "back" ? page.goBack({ waitUntil: "domcontentloaded", timeout: 1500 }) : page.goForward({ waitUntil: "domcontentloaded", timeout: 1500 })).catch(() => undefined);
  const native = await dialog; expect(native.type()).toBe("beforeunload"); await native.dismiss(); await navigation;
}
it("Escape preserves unsaved content, clean close writes nothing and save-before-close persists", async () => {
  const page = await owner.newPage(); page.setDefaultTimeout(30_000); failureEvidence(page, "escape"); await openArtifact(page);
  const initial = await state(), body = page.getByLabel("成果正文", { exact: true }), modal = page.getByRole("dialog", { name: "项目成果", exact: true }), prompt = page.getByRole("dialog", { name: "处理未保存内容", exact: true });
  await body.fill("Escape未保存草稿"); await body.press("Escape"); await prompt.waitFor(); await prompt.press("Escape"); await prompt.waitFor({ state: "hidden" });
  expect(await modal.isVisible()).toBe(true); expect(await body.inputValue()).toBe("Escape未保存草稿"); expect((await state()).content).toBe(initial.content);
  await body.press("Escape"); await prompt.waitFor(); await prompt.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await body.inputValue()).toBe("Escape未保存草稿");
  await body.fill(initial.content); await body.press("Escape"); await modal.waitFor({ state: "hidden" }); expect((await state()).version).toBe(initial.version);
  await openArtifact(page); await page.getByLabel("成果正文", { exact: true }).fill("Escape保存再关闭"); await page.getByLabel("成果正文", { exact: true }).press("Escape"); await page.getByRole("button", { name: "保存并继续", exact: true }).click(); await modal.waitFor({ state: "hidden" });
  expect(await state()).toMatchObject({ version: initial.version + 1, content: "Escape保存再关闭" }); await page.screenshot({ path: resolve(out, "escape-save-close-" + evidenceStamp + ".png"), fullPage: true });
  checks.push("Escape-dirty-prompt-Escape-cancel-button-cancel-clean-close-real-save-close"); await page.close();
}, 180_000);
it("outside clicks retain dirty edits until cancel or explicit discard; clean outside close does not write", async () => {
  const page = await owner.newPage(); page.setDefaultTimeout(30_000); failureEvidence(page, "backdrop"); await openArtifact(page);
  const before = await state(), body = page.getByLabel("成果正文", { exact: true }), modal = page.getByRole("dialog", { name: "项目成果", exact: true }), prompt = page.getByRole("dialog", { name: "处理未保存内容", exact: true });
  const bounds = await modal.boundingBox(); expect(bounds!.x).toBeGreaterThan(8); expect(bounds!.y).toBeGreaterThan(8);
  await body.fill("外部点击仍要保留的草稿"); await page.mouse.click(4,4); await prompt.waitFor(); await prompt.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await body.inputValue()).toBe("外部点击仍要保留的草稿"); expect(await modal.isVisible()).toBe(true);
  await page.mouse.click(4,4); await prompt.waitFor(); await prompt.getByRole("button", { name: "放弃修改并继续", exact: true }).click(); await modal.waitFor({ state: "hidden" }); expect(await state()).toMatchObject(before);
  await openArtifact(page); await page.mouse.click(4,4); await modal.waitFor({ state: "hidden" }); expect((await state()).version).toBe(before.version);
  checks.push("actual-outside-coordinates-dirty-cancel-explicit-discard-clean-close-no-write"); await page.close();
}, 180_000);
it("cross-document Back/Forward cancels native beforeunload without losing drafts and traverses after real saves", async () => {
  const page = await owner.newPage(); page.setDefaultTimeout(30_000); failureEvidence(page, "cross-document");
  const researchUrl = origin + "/research/session/" + sessionId;
  await page.goto(researchUrl, { waitUntil: "domcontentloaded", timeout: 90_000 }); await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true"); await page.waitForLoadState("networkidle"); await openArtifact(page);
  const before = await state(), body = page.getByLabel("成果正文", { exact: true }); await body.fill("跨文档返回前草稿"); await cancelNativeNavigation(page, "back");
  expect(new URL(page.url()).pathname).toBe("/dashboard"); expect(await body.inputValue()).toBe("跨文档返回前草稿"); expect((await state()).version).toBe(before.version);
  await page.locator(".artifact-editor").getByRole("button", { name: "保存修改", exact: true }).click(); await page.getByText("编辑成果 · 第 " + (before.version + 1) + " 版", { exact: true }).waitFor();
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 90_000 }); await page.waitForURL(researchUrl);
  const panel = page.locator("section.work-creation-action").first(); await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true"); await panel.locator("details.research-legacy-creation > summary").click(); await panel.getByLabel("我的项目", { exact: true }).selectOption(projectA); await panel.getByText("重新打开项目成果", { exact: true }).click(); await panel.getByRole("button", { name: "共享成果甲", exact: true }).click();
  const researchBody = panel.getByLabel("成果正文", { exact: true }); expect(await researchBody.inputValue()).toBe("跨文档返回前草稿"); await researchBody.fill("跨文档前进前草稿"); await cancelNativeNavigation(page, "forward");
  expect(new URL(page.url()).pathname).toContain("/research/session/"); expect(await researchBody.inputValue()).toBe("跨文档前进前草稿"); expect((await state()).content).toBe("跨文档返回前草稿");
  await panel.getByRole("button", { name: "保存修改", exact: true }).click(); await panel.getByText("编辑成果 · 第 " + (before.version + 2) + " 版", { exact: true }).waitFor();
  expect((await state()).content).toBe("跨文档前进前草稿");
  await page.goForward({ waitUntil: "domcontentloaded", timeout: 90_000 }); await page.waitForURL(url => url.pathname === "/dashboard" && url.searchParams.get("node") === "artifact:" + artifactA); await page.getByLabel("成果正文", { exact: true }).waitFor(); await expect.poll(() => page.getByLabel("成果正文", { exact: true }).inputValue(), { timeout: 10_000 }).toBe("跨文档前进前草稿");
  await page.screenshot({ path: resolve(out, "cross-document-forward-saved-" + evidenceStamp + ".png"), fullPage: true }); checks.push("actual-different-documents-native-Back-cancel-save-Back-native-Forward-cancel-save-Forward-real-PUT-preserved"); await page.close();
}, 240_000);
