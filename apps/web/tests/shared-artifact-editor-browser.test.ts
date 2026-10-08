import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, onTestFailed, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { createTextArtifact } from "../server/artifacts/service";
import { createResearchSession, reserveResearchRun } from "../server/research/service";
const origin = "http://localhost:3020", out = resolve(process.cwd(), process.env.FINAL_ACCEPTANCE_OUTPUT ? process.env.FINAL_ACCEPTANCE_OUTPUT + "/W2-regression-" + new Date().toISOString().replaceAll(/[-:.]/g, "") + "-" + randomUUID().slice(0,8) : "output/workbench-iteration-20261005/W2");
let browser: Browser, owner: BrowserContext, viewer: BrowserContext;
let userId = "", viewerId = "", foreignId = "", workspaceId = "", foreignWorkspace = "", projectA = "", projectB = "", foreignProject = "", artifactA = "", artifactB = "", foreignArtifact = "", sessionId = "", runId = "";
const checks: string[] = [];
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
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || url.port !== "55436" || !url.pathname.includes("content_center_upgrade_review") || process.env.EXTERNAL_SERVICES_DISABLED !== "true") throw Error("ISOLATED_REVIEW_ONLY");
  if (process.env.FINAL_ACCEPTANCE_OUTPUT && !process.env.FINAL_ACCEPTANCE_OUTPUT.startsWith("output/workbench-final-acceptance-20261005/acceptance-") && !process.env.FINAL_ACCEPTANCE_OUTPUT.startsWith("output/research-experience-20261005/implementation-")) throw Error("INVALID_FINAL_OUTPUT");
  await mkdir(out, { recursive: true });
  const suffix = randomUUID(), password = "fixture-" + randomUUID(), email = "shared-editor-" + suffix + "@example.test", viewerEmail = "shared-editor-viewer-" + suffix + "@example.test";
  userId = (await auth.api.signUpEmail({ body: { name: "Shared Editor Owner", email, password } })).user.id;
  viewerId = (await auth.api.signUpEmail({ body: { name: "Shared Editor Viewer", email: viewerEmail, password } })).user.id;
  foreignId = (await db.user.create({ data: { name: "Shared Foreign Owner", email: "shared-editor-foreign-" + suffix + "@example.test" } })).id;
  workspaceId = (await db.workspace.create({ data: { name: "Shared Editor Fixture", slug: "shared-editor-" + suffix, members: { create: [{ userId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
  foreignWorkspace = (await db.workspace.create({ data: { name: "Foreign Fixture", slug: "shared-editor-foreign-" + suffix, members: { create: { userId: foreignId, role: "OWNER" } } } })).id;
  projectA = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "共享编辑项目甲" } })).id;
  projectB = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "共享编辑项目乙" } })).id;
  foreignProject = (await db.contentProject.create({ data: { workspaceId: foreignWorkspace, createdById: foreignId, title: "Foreign Project" } })).id;
  artifactA = await makeArtifact(projectA, "共享成果甲", "甲的初始正文");
  artifactB = await makeArtifact(projectA, "共享成果乙", "乙的独立正文");
  await makeArtifact(projectB, "另一项目成果", "项目乙独立正文");
  foreignArtifact = await makeArtifact(foreignProject, "Foreign Artifact", "Foreign protected body", foreignId, foreignWorkspace);
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
  await writeFile(resolve(out, "browser-evidence.json"), JSON.stringify({ checks, fixtureUsersRemaining: remaining, formalDatabaseWrites: 0, modelCalls: 0, realArtifactAPI: true, usesPersonalPassword: false }, null, 2)); expect(remaining).toBe(0); await db.$disconnect();
}, 60_000);
function trackFailure(page: Page, name: string) { onTestFailed(async () => { await page.screenshot({ path: resolve(out, name + "-failure.png"), fullPage: true }).catch(() => undefined); console.info("FIXTURE_STATE", await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, dialogs: [...document.querySelectorAll("dialog")].map(d => ({ label: d.getAttribute("aria-label"), open: d.open, text: d.textContent?.slice(-1200) })) }))); }); }
const artifactUrl = () => origin + "/api/projects/" + projectA + "/artifacts/" + artifactA;
const dashboard = (id = artifactA) => origin + "/dashboard?project=" + projectA + "&node=artifact:" + id;
async function openProject(page: Page) { await page.goto(dashboard(), { waitUntil: "domcontentloaded", timeout: 90_000 }); await page.getByRole("dialog", { name: "项目成果", exact: true }).waitFor(); await page.getByLabel("成果正文", { exact: true }).waitFor(); }
it("project shares real revision saves, conflict preservation, explicit saved export and dirty navigation guards", async () => {
  const page = await owner.newPage(); page.setDefaultTimeout(30_000); trackFailure(page, "project");
  await openProject(page);
  const editor = page.locator(".artifact-editor"), body = editor.getByLabel("成果正文", { exact: true });
  expect(await body.inputValue()).toBe("甲的初始正文");
  let puts = 0; page.on("request", r => { if (r.url() === artifactUrl() && r.method() === "PUT") puts++; });
  await body.fill("项目手动保存第二版");
  await editor.getByRole("button", { name: "保存修改", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await editor.getByText("编辑成果 · 第 2 版", { exact: true }).waitFor(); expect(puts).toBe(1);
  expect(await editor.getByRole("button", { name: "保存修改", exact: true }).isDisabled()).toBe(true);
  const row = await db.artifact.findUniqueOrThrow({ where: { id: artifactA }, include: { draftBranch: { include: { revisions: { orderBy: { revision: "asc" } } } } } });
  expect(row.draftBranch.revisions[0]!.body).toBe("甲的初始正文"); expect(row.draftBranch.version).toBe(2);
  await body.fill("本地未保存正文");
  await page.getByRole("button", { name: "关闭成果", exact: true }).click(); await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await body.inputValue()).toBe("本地未保存正文");
  await page.getByRole("navigation", { name: "成果列表" }).getByRole("link", { name: /共享成果乙/ }).click(); await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await body.inputValue()).toBe("本地未保存正文");
  const reloadDialog = page.waitForEvent("dialog"); const reload = page.reload({ waitUntil: "domcontentloaded", timeout: 1000 }).catch(() => undefined); await (await reloadDialog).dismiss(); await reload; expect(await body.inputValue()).toBe("本地未保存正文");
  const other = await owner.request.put(artifactUrl(), { data: { expectedVersion: 2, title: "共享成果甲", body: "另一窗口保存第三版" } }); expect(other.status()).toBe(200);
  await editor.getByRole("button", { name: "保存修改", exact: true }).click(); await editor.getByRole("alert").waitFor(); expect(await body.inputValue()).toBe("本地未保存正文"); expect((await owner.request.get(artifactUrl()).then(r => r.json())).content).toBe("另一窗口保存第三版");
  await page.getByRole("button", { name: "关闭成果", exact: true }).click(); await page.getByRole("button", { name: "保存并继续", exact: true }).click(); await page.getByRole("dialog", { name: "处理未保存内容" }).getByRole("alert").waitFor(); expect(await body.inputValue()).toBe("本地未保存正文"); await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  const confirm = page.waitForEvent("dialog"), download = page.waitForEvent("download"); const clicking = editor.getByRole("button", { name: "导出已保存版本", exact: true }).click(); expect((await confirm).message()).toContain("V2"); await (await confirm).accept(); await clicking; expect(await readFile((await (await download).path())!, "utf8")).toBe("# 共享成果甲\n\n项目手动保存第二版"); expect(await body.inputValue()).toBe("本地未保存正文");
  await page.getByRole("navigation", { name: "成果列表" }).getByRole("link", { name: /共享成果乙/ }).click(); await page.getByRole("button", { name: "放弃修改并继续", exact: true }).click(); await page.waitForURL(dashboard(artifactB)); await page.getByLabel("成果正文", { exact: true }).waitFor(); expect(await page.getByLabel("成果正文", { exact: true }).inputValue()).toBe("乙的独立正文");
  await page.getByLabel("成果正文", { exact: true }).fill("乙保存后关闭"); await page.getByRole("button", { name: "关闭成果", exact: true }).click(); await page.getByRole("button", { name: "保存并继续", exact: true }).click(); await page.getByRole("dialog", { name: "项目成果", exact: true }).waitFor({ state: "hidden" }); expect((await owner.request.get(origin + "/api/projects/" + projectA + "/artifacts/" + artifactB).then(r => r.json())).content).toBe("乙保存后关闭"); await page.keyboard.press("Control+k"); const search = page.getByRole("dialog", { name: "全局搜索", exact: true }); await search.getByRole("tab", { name: "成果", exact: true }).click(); await search.getByLabel("搜索项目、成果和资料", { exact: true }).fill("共享成果甲"); await search.getByRole("button", { name: /共享成果甲/ }).click(); await page.waitForURL(dashboard()); await page.getByLabel("成果正文", { exact: true }).waitFor(); expect(await page.getByLabel("成果正文", { exact: true }).inputValue()).toBe("另一窗口保存第三版");
  await page.waitForLoadState("networkidle"); await page.getByLabel("成果正文", { exact: true }).fill("搜索跳转前的未保存正文"); await page.keyboard.press("Tab"); await page.keyboard.press("Control+k"); await search.getByLabel("搜索项目、成果和资料", { exact: true }).fill("另一项目成果"); await search.getByRole("button", { name: /另一项目成果/ }).click(); await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await page.getByLabel("成果正文", { exact: true }).inputValue()).toBe("搜索跳转前的未保存正文"); expect(new URL(page.url()).searchParams.get("project")).toBe(projectA); await search.getByRole("button", { name: /另一项目成果/ }).click(); await page.getByRole("button", { name: "放弃修改并继续", exact: true }).click(); await page.waitForURL(url => url.searchParams.get("project") === projectB); await page.getByLabel("成果正文", { exact: true }).waitFor(); expect(await page.getByLabel("成果正文", { exact: true }).inputValue()).toBe("项目乙独立正文"); await page.screenshot({ path: resolve(out, "project-shared-editor.png"), fullPage: true }); checks.push("project-real-put-repeat-version-conflict-export-close-artifact-switch-refresh-W1-search"); await page.close();
}, 240_000);
it("research uses the same editor and preserves back/forward and project changes before real saves", async () => {
  const page = await owner.newPage(); page.setDefaultTimeout(30_000); trackFailure(page, "research");
  await page.goto(origin + "/research/session/" + sessionId, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const panel = page.locator("section.work-creation-action").first();
  await panel.locator("details.research-legacy-creation > summary").click();
  await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true");
  await panel.getByLabel("我的项目", { exact: true }).selectOption(projectA);
  await panel.getByText("重新打开项目成果", { exact: true }).click(); await panel.getByRole("button", { name: "共享成果甲", exact: true }).click();
  const body = panel.getByLabel("成果正文", { exact: true }); expect(await body.inputValue()).toBe("另一窗口保存第三版"); await body.fill("研究侧保存第四版");
  await panel.getByLabel("我的项目", { exact: true }).selectOption(projectB); await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await panel.getByLabel("我的项目", { exact: true }).inputValue()).toBe(projectA); expect(await body.inputValue()).toBe("研究侧保存第四版");
  const base = page.url(); await page.evaluate(() => history.pushState(history.state, "", location.href + "#editor-back")); const length = await page.evaluate(() => history.length);
  await page.evaluate(() => history.back()); await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(page.url()).toBe(base + "#editor-back"); expect(await page.evaluate(() => history.length)).toBe(length);
  let puts = 0; page.on("request", r => { if (r.url() === artifactUrl() && r.method() === "PUT") puts++; });
  await page.evaluate(() => history.back()); await page.getByRole("button", { name: "保存并继续", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); }); await page.waitForURL(base); expect(puts).toBe(1); expect(await page.evaluate(() => history.length)).toBe(length); await page.evaluate(() => history.forward()); await page.waitForURL(base + "#editor-back"); expect(await body.inputValue()).toBe("研究侧保存第四版");
  await body.fill("切换前未保存"); await panel.getByLabel("我的项目", { exact: true }).selectOption(projectB); await page.getByRole("button", { name: "放弃修改并继续", exact: true }).click(); await page.getByRole("dialog", { name: "处理未保存内容" }).waitFor({ state: "hidden" }); await expect.poll(() => panel.getByLabel("我的项目", { exact: true }).inputValue()).toBe(projectB); expect(await body.count()).toBe(0);
  await panel.getByLabel("我的项目", { exact: true }).selectOption(projectA);
  let modelIntercepts = 0;
  await page.route(/\/api\/projects\/[^/]+\/assistant$/, async route => {
    modelIntercepts++; expect(route.request().postDataJSON().references).toEqual([{ sourceType: "RESEARCH", sourceId: runId }]);
    const thread = await db.assistantThread.findFirst({ where: { projectId: projectA } }) ?? await db.assistantThread.create({ data: { workspaceId, projectId: projectA, createdById: userId } }); const message = await db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content: "受控生成正文" } });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: "data: " + JSON.stringify({ type: "done", message: { id: message.id, content: message.content } }) + "\n\n" });
  });
  await panel.getByRole("button", { name: "生成我的版本", exact: true }).click(); await panel.getByRole("button", { name: "保存为成果", exact: true }).waitFor(); await panel.getByLabel("成果名称", { exact: true }).fill("研究首次保存手改成果"); await panel.getByLabel("成果正文", { exact: true }).fill("生成后首次保存前手动编辑");
  await panel.getByRole("button", { name: "保存为成果", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); }); await panel.getByText("编辑成果 · 第 2 版", { exact: true }).waitFor(); expect(modelIntercepts).toBe(1); expect(await db.artifact.count({ where: { workspaceId, title: "研究首次保存手改成果" } })).toBe(1);
  await page.screenshot({ path: resolve(out, "research-shared-editor.png"), fullPage: true }); checks.push("research-real-get-post-put-first-save-edit-project-switch-back-forward-repeat-save-mock-generation"); await page.close();
}, 240_000);
it("keeps viewer read-only and cross-customer/private-research API boundaries", async () => {
  const page = await viewer.newPage(); page.setDefaultTimeout(30_000); trackFailure(page, "permissions"); await openProject(page);
  expect(await page.getByLabel("成果正文", { exact: true }).isDisabled()).toBe(true); expect(await page.getByRole("button", { name: "保存修改", exact: true }).isDisabled()).toBe(true); expect(await page.getByRole("button", { name: "通过 AI 继续修改", exact: true }).isDisabled()).toBe(true);
  const put = await viewer.request.put(artifactUrl(), { data: { expectedVersion: 4, title: "Unauthorized", body: "Unauthorized" } }); expect(put.status()).toBe(403);
  const foreignUrl = origin + "/api/projects/" + foreignProject + "/artifacts/" + foreignArtifact; expect((await owner.request.get(foreignUrl)).status()).toBe(404); expect((await owner.request.put(foreignUrl, { data: { expectedVersion: 1, title: "Unauthorized", body: "Unauthorized" } })).status()).toBe(404);
  expect([403,404]).toContain((await viewer.request.get(origin + "/api/research/sessions/" + sessionId)).status());
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); expect(await page.evaluate(() => { const field=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="成果正文"]')!, dialog=document.querySelector<HTMLDialogElement>('dialog[aria-label="项目成果"]')!, body=document.querySelector<HTMLElement>(".artifact-window-body")!; return field.getBoundingClientRect().right <= dialog.getBoundingClientRect().right - 12 && body.scrollWidth <= body.clientWidth + 2; })).toBe(true); await page.screenshot({ path: resolve(out, "viewer-mobile.png"), fullPage: true });
  checks.push("viewer-disabled-real403-foreign404-privateResearch-denied-mobile"); await page.close();
}, 120_000);
