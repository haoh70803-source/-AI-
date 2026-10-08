import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Dialog } from "@playwright/test";
import { afterAll, beforeAll, expect, it, onTestFailed, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { MockLLMProvider } from "@content-center/providers";
import { startWorkDeepResearch } from "../server/research/work-research-service";
import { startAccountV2Research } from "../server/research/account-v2-service";
import { reserveResearchRun, executeResearchRun } from "../server/research/service";
import { sampleAnswer, sampleBody, sampleDecisionPass } from "./work-research-fixture";
import { accountAnswer } from "./research-account-fixture";
import type { AccountV2State } from "../server/research/account-v2-contract";
const actor = () => ({ workspaceId, userId });
const workRuntime = { provider: new MockLLMProvider(input => {
  if (JSON.parse(input.prompt).task.includes("决策层")) return sampleDecisionPass();
  const answer = sampleAnswer(); answer.structureBlocks.forEach(block => { block.startMs = null; block.endMs = null; }); return answer;
}), providerName: "FIXTURE", model: "browser-work-fixture", mode: "FIXTURE" as const };
let accountId = ""; const workIds: string[] = []; let researchSubmissions = 0;


const origin = "http://localhost:3020", privateOutput = resolve(process.cwd(), "../../output/account-upgrade-private");
let browser: Browser, context: BrowserContext, userId = "", workspaceId = "", foreignUser = "", foreignWorkspace = "", sessionId = "", runId = "";
let createdProject = "", createdArtifact = "", agentRequests = 0;
let complete = false; const completedPaths: string[] = [];
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || new URL(process.env.DATABASE_URL!).port !== "55436") throw Error("REVIEW_BROWSER_ONLY");
  const email = `research-browser-${randomUUID()}@example.test`, password = `fixture-${randomUUID()}`;
  const registered = await auth.api.signUpEmail({ body: { name: "Disposable Research Creator", email, password } }); userId = registered.user.id;
  workspaceId = (await db.workspace.create({ data: { name: "Disposable Research Acceptance", slug: `research-browser-${randomUUID()}`, members: { create: { userId, role: "OWNER" } } } })).id;
  const suffix = randomUUID();
  accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, name: "ABC浏览器对象", platform: "DOUYIN", externalAccountId: suffix } })).id;
  for (let index = 0; index < 2; index++) {
    const externalId = `${suffix}-${index}`;
    workIds.push((await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId, title: "怎样解决真实问题", url: "https://example.test/work", publishedAt: new Date(Date.UTC(2026, 8, index + 1)), metadata: {}, observations: { create: { metrics: { likes: 10 + index } } } } })).id);
    await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourcePlatform: "DOUYIN", externalId, sourceType: "TEXT", rawText: sampleBody, status: "READY", title: "浏览器可读正文" } });
  }
  foreignUser = (await db.user.create({ data: { name: "Disposable Foreign Creator", email: `research-foreign-${randomUUID()}@example.test` } })).id;
  foreignWorkspace = (await db.workspace.create({ data: { name: "Disposable Foreign Workspace", slug: `research-foreign-${randomUUID()}`, members: { create: { userId: foreignUser, role: "OWNER" } } } })).id;
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true }); expect(response.ok).toBe(true);
  browser = await chromium.launch({ channel: "msedge", headless: true }); context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await context.addCookies(response.headers.getSetCookie().map(value => { const pair = value.split(";")[0]!; const separator = pair.indexOf("="); return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: origin }; }));
}, 90_000);
afterAll(async () => {
  await context?.close(); await browser?.close();
  if (workspaceId || foreignWorkspace) await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspace].filter(Boolean) } } });
  if (userId || foreignUser) await db.user.deleteMany({ where: { id: { in: [userId, foreignUser].filter(Boolean) } } });
  const cleaned = await db.user.count({ where: { id: { in: [userId, foreignUser].filter(Boolean) } } }) === 0;
  await writeFile(resolve(privateOutput, "research-browser-evidence.json"), JSON.stringify({ complete: complete && completedPaths.length === 3, completedPaths, fixtureCleanupVerified: cleaned, agentRequestsIntercepted: agentRequests, usesRealUserPassword: false, paidModelCalls: 0, head: "ae3ff087", includesUncommittedChanges: true, researchSubmissions, abc: "controlled fixture, not live AI" }, null, 2));
  expect(cleaned).toBe(true); await db.$disconnect();
}, 60_000);

it("offers three paths and completes inline project → mocked generation → real Artifact edit/export/reopen", async () => {
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  onTestFailed(async () => {
    await page.screenshot({ path: resolve(privateOutput, "research-browser-failure.png"), fullPage: true, timeout: 3000 }).catch(() => undefined);
    console.info("FIXTURE_EDITOR_STATE", await page.evaluate(() => { const element = document.querySelector("section.work-creation-action"); return { path: location.pathname, project: element?.querySelector("select")?.value, text: element?.textContent?.slice(-1800) }; }));
  });
  const sessionCheck = await context.request.get(origin + "/api/auth/get-session");
  expect((await sessionCheck.json())?.user?.id === userId).toBe(true);
  const homeResponse = await page.goto(origin + "/research", { waitUntil: "domcontentloaded" });
  expect(homeResponse?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/research");
  await page.getByRole("link", { name: /拆解一条作品/ }).waitFor();
  for (const label of ["拆解一条作品", "研究一个账号", "研究一个主题"]) expect(await page.getByRole("link", { name: new RegExp(label) }).count()).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("link", { name: /研究一个主题/ }).click();
  await page.waitForURL(url => url.searchParams.get("entry") === "DIRECT");
  expect(new URL(page.url()).searchParams.get("entry")).toBe("DIRECT");
  await page.getByLabel("你想研究什么？", { exact: true }).waitFor();
  await page.route(/\/api\/research\/sessions\/[^/]+\/runs$/, async route => {
    researchSubmissions++; sessionId = new URL(route.request().url()).pathname.split("/")[4]!;
    const reserved = await reserveResearchRun(actor(), sessionId, route.request().postDataJSON()); runId = reserved.run.id;
    await executeResearchRun(actor(), sessionId, runId, { runtime: { provider: new MockLLMProvider(() => ({ sections: [
      { title: "从问题找角度", text: "可以先明确读者的问题，再展开自己的观点。", sourceRefs: ["U1"], limitation: "仅基于用户问题形成方向，未读取外部资料或视频画面。" }
    ] })), providerName: "FIXTURE", model: "browser-topic-fixture", mode: "FIXTURE" } });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...reserved.run, status: "COMPLETED" }) });
  });
  await page.waitForFunction(() => document.querySelector(".research-composer")?.getAttribute("data-ready") === "true");
  await page.getByLabel("你想研究什么？", { exact: true }).fill("如何把专业知识讲清楚？");
  await page.getByRole("button", { name: "开始研究", exact: true }).dblclick();
  await page.waitForURL(/\/research\/session\//);
  expect(researchSubmissions).toBe(1);
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("COMPLETED");
  const panel = page.locator("section.work-creation-action").first();
  await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true");
  await panel.getByLabel("项目名称", { exact: true }).fill("就地创建的文章项目");
  await panel.getByRole("button", { name: "创建并使用", exact: true }).click();
  await panel.getByText("项目已创建，可以继续创作。", { exact: true }).waitFor();
  createdProject = await panel.getByLabel("我的项目", { exact: true }).inputValue(); expect(Boolean(createdProject)).toBe(true);
  expect(await db.contentProject.count({ where: { workspaceId } })).toBe(1);
  await panel.getByLabel("内容形式", { exact: true }).selectOption("文章");
  await page.route(/\/api\/projects\/[^/]+\/assistant$/, async route => {
    agentRequests++; const body = route.request().postDataJSON();
    expect(body.references).toEqual([{ sourceType: "RESEARCH", sourceId: runId }]); expect(body.sourceItemIds).toEqual([]);
    expect(body.content).toContain("形式：文章"); expect(body.content).not.toContain("三个不同的 Hook");
    const thread = await db.assistantThread.findFirst({ where: { projectId: createdProject, createdById: userId } }) ?? await db.assistantThread.create({ data: { workspaceId, projectId: createdProject, createdById: userId } });
    const message = await db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content: "# 清楚表达专业知识\n\n先用读者熟悉的问题引入，再用有来源的例子说明。业务案例待补充。" } });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "done", message: { id: message.id, content: message.content } })}\n\n` });
  });
  await panel.getByRole("button", { name: "生成我的版本", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await panel.getByRole("button", { name: "保存为成果", exact: true }).waitFor();
  expect(agentRequests).toBe(1);
  await panel.getByLabel("成果名称", { exact: true }).fill("我的知识表达文章");
  await panel.getByRole("button", { name: "保存为成果", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await panel.getByRole("button", { name: "保存修改", exact: true }).waitFor();
  createdArtifact = (await db.artifact.findFirstOrThrow({ where: { workspaceId, projectId: createdProject } })).id;
  const edited = "# 我的知识表达文章\n\n这里加入我自己确认的观点，并保留业务案例待补的位置。";
  await panel.getByLabel("成果正文", { exact: true }).fill(edited);
  await panel.getByText("重新打开项目成果", { exact: true }).click();
  await panel.getByRole("button", { name: "我的知识表达文章", exact: true }).click();
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  expect(await panel.getByLabel("成果正文", { exact: true }).inputValue()).toBe(edited);
  // Regenerate/reopen/navigation must not silently replace a manual draft.
  await panel.getByRole("button", { name: "生成我的版本", exact: true }).click();
  await page.getByRole("dialog", { name: "处理未保存内容" }).waitFor();
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  expect(await panel.getByLabel("成果正文", { exact: true }).inputValue()).toBe(edited);
  expect(agentRequests).toBe(1);
  await panel.getByRole("link", { name: "到项目继续", exact: true }).click();
  await page.getByRole("dialog", { name: "处理未保存内容" }).waitFor();
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  expect(new URL(page.url()).pathname).toContain("/research/session/");
  const reloadDialog = page.waitForEvent("dialog");
  const reload = page.reload({ waitUntil: "domcontentloaded", timeout: 1000 }).catch(() => undefined);
  await (await reloadDialog).dismiss(); await reload;
  expect(await panel.getByLabel("成果正文", { exact: true }).inputValue()).toBe(edited);
  await panel.getByRole("button", { name: "保存修改", exact: true }).click();
  await panel.getByText("编辑成果 · 第 2 版", { exact: true }).waitFor();
  expect((await db.artifact.findUniqueOrThrow({ where: { id: createdArtifact }, include: { draftBranch: true } })).draftBranch.workingBody).toBe(edited);
  const download = page.waitForEvent("download"); await panel.getByRole("button", { name: "导出已保存版本", exact: true }).click(); const file = await download; expect(file.suggestedFilename()).toBe("我的知识表达文章.md");
  expect(await readFile((await file.path())!, "utf8")).toBe(`# 我的知识表达文章\n\n${edited}`);
  await panel.getByLabel("成果正文", { exact: true }).fill("未保存修改不应进入导出文件");
  const exportDialog = page.waitForEvent("dialog"); const oldExport = page.waitForEvent("download");
  const exporting = panel.getByRole("button", { name: "导出已保存版本", exact: true }).click();
  await (await exportDialog).accept(); await exporting;
  expect(await readFile((await (await oldExport).path())!, "utf8")).toBe(`# 我的知识表达文章\n\n${edited}`);
  expect(await panel.getByLabel("成果正文", { exact: true }).inputValue()).toBe("未保存修改不应进入导出文件");
  await panel.getByLabel("成果正文", { exact: true }).fill(edited);
  const stale = await context.request.put(origin + `/api/projects/${createdProject}/artifacts/${createdArtifact}`, { data: { expectedVersion: 1, title: "不应覆盖", body: "不应覆盖" } }); expect(stale.status()).toBe(409);
  const foreignProject = await db.contentProject.create({ data: { workspaceId: foreignWorkspace, createdById: foreignUser, title: "Foreign protected project" } });
  const foreignBranch = await db.draftBranch.create({ data: { workspaceId: foreignWorkspace, projectId: foreignProject.id, createdById: foreignUser, updatedById: foreignUser, title: "Foreign protected artifact", workingBody: "Foreign private fixture", version: 1 } });
  const foreignArtifact = await db.artifact.create({ data: { workspaceId: foreignWorkspace, projectId: foreignProject.id, draftBranchId: foreignBranch.id, createdById: foreignUser, title: "Foreign protected artifact" } });
  const forbidden = await context.request.put(origin + `/api/projects/${foreignProject.id}/artifacts/${foreignArtifact.id}`, { data: { expectedVersion: 1, title: "不应覆盖", body: "不应覆盖" } }); expect(forbidden.status()).toBe(404);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopenedPanel = page.locator("section.work-creation-action").first();
  await reopenedPanel.getByText("重新打开项目成果", { exact: true }).click();
  await reopenedPanel.getByRole("button", { name: "我的知识表达文章", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  expect(await reopenedPanel.getByLabel("成果正文", { exact: true }).inputValue()).toBe(edited);
  await page.screenshot({ path: resolve(privateOutput, "research-creation-reopened.png"), fullPage: true });
  // Saved versions survive refresh; project changes isolate the editor.
  const second = await context.request.post(origin + "/api/projects", { data: { title: "第二个隔离项目", clientRequestId: randomUUID() } });
  const secondId = (await second.json()).id; expect(typeof secondId).toBe("string");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true");
  await reopenedPanel.getByLabel("我的项目", { exact: true }).selectOption(createdProject);
  expect((await context.request.get(origin + `/api/projects/${createdProject}/artifacts`)).status()).toBe(200);
  await reopenedPanel.getByText("重新打开项目成果", { exact: true }).click();
  await reopenedPanel.getByRole("button", { name: "我的知识表达文章", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await reopenedPanel.getByLabel("成果正文", { exact: true }).fill("保留在原项目的未保存编辑");
  const conflictUrl = origin + `/api/projects/${createdProject}/artifacts/${createdArtifact}`;
  await page.route(conflictUrl, route => route.request().method() === "PUT"
    ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "成果版本冲突，当前编辑仍保留。" }) }) : route.continue());
  await reopenedPanel.getByLabel("我的项目", { exact: true }).selectOption(secondId);
  await page.getByRole("button", { name: "保存并继续", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  expect(await reopenedPanel.getByLabel("我的项目", { exact: true }).inputValue()).toBe(createdProject);
  expect(await reopenedPanel.getByLabel("成果正文", { exact: true }).inputValue()).toBe("保留在原项目的未保存编辑");
  await page.unroute(conflictUrl);
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  await reopenedPanel.getByLabel("我的项目", { exact: true }).selectOption(secondId);
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  expect(await reopenedPanel.getByLabel("我的项目", { exact: true }).inputValue()).toBe(createdProject);
  expect(await reopenedPanel.getByLabel("成果正文", { exact: true }).inputValue()).toBe("保留在原项目的未保存编辑");
  let nativeBack = false;
  const cancelBack = async (dialog: Dialog) => { nativeBack = true; expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss(); };
  page.once("dialog", cancelBack);
  await page.goBack({ waitUntil: "commit", timeout: 1000 }).catch(() => undefined);
  if (!nativeBack) await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  page.removeListener("dialog", cancelBack);
  // Cancel restores an existing entry; resolving traverses it once and preserves Forward.
  const historyBase = page.url();
  await page.evaluate(() => { history.pushState(history.state, "", location.href + "#draft-back-check"); });
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click();
  expect(page.url()).toBe(historyBase + "#draft-back-check");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(await reopenedPanel.getByLabel("成果正文", { exact: true }).inputValue()).toBe("保留在原项目的未保存编辑");
  let historySaves = 0;
  page.on("request", request => { if (request.url() === conflictUrl && request.method() === "PUT") historySaves++; });
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "保存并继续", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await page.waitForURL(historyBase);
  expect(historySaves).toBe(1);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.evaluate(() => history.forward());
  await page.waitForURL(historyBase + "#draft-back-check");
  await reopenedPanel.getByLabel("成果正文", { exact: true }).fill("应放弃的历史编辑");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "放弃修改并继续", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await page.waitForURL(historyBase);
  expect(await reopenedPanel.getByLabel("成果正文", { exact: true }).inputValue()).toBe("保留在原项目的未保存编辑");
  expect(historySaves).toBe(1);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.evaluate(() => history.forward());
  await page.waitForURL(historyBase + "#draft-back-check");
  await page.evaluate(() => history.back());
  await page.waitForURL(historyBase);
  expect(await page.getByRole("dialog").count()).toBe(0);
  await reopenedPanel.getByLabel("成果正文", { exact: true }).fill("项目切换前的修改");
  await reopenedPanel.getByLabel("我的项目", { exact: true }).selectOption(secondId);
  await page.getByRole("button", { name: "保存并继续", exact: true }).click();
  await expect.poll(() => reopenedPanel.getByLabel("我的项目", { exact: true }).inputValue()).toBe(secondId);
  expect(await reopenedPanel.getByLabel("成果正文", { exact: true }).count()).toBe(0);
  expect((await db.artifact.findUniqueOrThrow({ where: { id: createdArtifact }, include: { draftBranch: true } })).draftBranch.workingBody).toBe("项目切换前的修改");
  await page.goBack({ waitUntil: "domcontentloaded" });
  expect(page.url()).not.toBe(historyBase);
  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.waitForURL(historyBase);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  completedPaths.push("C"); complete = true;
}, 240_000);


it("A/B browser input submits safe adapters, then creates/saves/reopens own versions", async () => {
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  onTestFailed(async () => {
    await page.screenshot({ path: resolve(privateOutput, "research-browser-failure.png"), fullPage: true, timeout: 3000 }).catch(() => undefined);
    console.info("FIXTURE_EDITOR_STATE", await page.evaluate(() => { const element = document.querySelector("section.work-creation-action"); return { path: location.pathname, project: element?.querySelector("select")?.value, text: element?.textContent?.slice(-1800) }; }));
  });
  if (!createdProject) createdProject = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "ABC独立项目" } })).id;
  let selectedRun = "", selectedSession = "";
  await page.route(/\/api\/research\/benchmarks\/[^/]+\/works\/[^/]+\/analysis$/, async route => {
    researchSubmissions++;
    const reserved = await startWorkDeepResearch(actor(), accountId, workIds[0]!, route.request().postDataJSON());
    selectedRun = reserved.runId; selectedSession = reserved.sessionId;
    await executeResearchRun(actor(), selectedSession, selectedRun, { runtime: workRuntime });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...reserved, status: "COMPLETED" }) });
  });
  await page.route(/\/api\/research\/benchmarks\/[^/]+\/research-v2$/, async route => {
    researchSubmissions++;
    const reserved = await startAccountV2Research(actor(), accountId, route.request().postDataJSON());
    selectedRun = reserved.runId; selectedSession = reserved.sessionId;
    await executeResearchRun(actor(), selectedSession, selectedRun, { runtime: {
      provider: new MockLLMProvider(input => accountAnswer({ selected: JSON.parse(input.prompt).works } as AccountV2State)),
      providerName: "FIXTURE", model: "browser-account-fixture", mode: "FIXTURE"
    } });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...reserved, status: "COMPLETED" }) });
  });
  await page.route(/\/api\/projects\/[^/]+\/assistant$/, async route => {
    agentRequests++; const input = route.request().postDataJSON();
    expect(input.references).toEqual([{ sourceType: "RESEARCH", sourceId: selectedRun }]);
    const thread = await db.assistantThread.findFirst({ where: { projectId: createdProject, createdById: userId } }) ?? await db.assistantThread.create({ data: { workspaceId, projectId: createdProject, createdById: userId } });
    const message = await db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content: "自己的版本：先解释客户问题，再补充自己的做法。" } });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "done", message: { id: message.id, content: message.content } })}\n\n` });
  });
  for (const path of ["A", "B"]) {
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && (response.url().endsWith("/analysis") || response.url().endsWith("/research-v2")));
    if (path === "B") {
      const second = await startWorkDeepResearch(actor(), accountId, workIds[1]!, { requestKey: randomUUID() });
      await executeResearchRun(actor(), second.sessionId, second.runId, { runtime: workRuntime });
      await page.goto(origin + `/research/benchmarks/${accountId}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector(".account-v2-panel")?.getAttribute("data-ready") === "true");
      await page.getByRole("button", { name: "开始账号综合研究", exact: true }).click();
    } else {
      await page.goto(origin + `/research/benchmarks/${accountId}/works/${workIds[0]}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector(".work-research-controls")?.getAttribute("data-ready") === "true");
      await page.getByRole("button", { name: "开始深度拆解", exact: true }).click();
    }
    expect((await submitted).status()).toBe(200);
    const stored = await db.researchRun.findUniqueOrThrow({ where: { id: selectedRun } });
    expect(stored.status, stored.errorMessage || undefined).toBe("COMPLETED");
    await page.reload({ waitUntil: "domcontentloaded" });
    if (path === "A") {
      await page.locator(".work-decision-intro h2").waitFor({ state: "visible" });
      await page.locator(".work-decision-flow > li").last().waitFor({ state: "visible" });
      expect(await page.locator(".work-decision-flow > li").count()).toBe(3);
      expect(await page.getByRole("heading", { name: "作者靠什么让人相信", exact: true }).isVisible()).toBe(false);
      await page.screenshot({ path: resolve(privateOutput, "research-work-creation-view.png"), fullPage: true });
    } else {
      await page.getByRole("heading", { name: "选一个适合自己的写法", exact: true }).waitFor();
      expect(await page.locator("#account-details").getAttribute("open")).toBeNull();
      expect(await page.locator("#judgments").isVisible()).toBe(false);
      expect(await page.locator(".benchmark-dossier .dossier-update").count()).toBe(1);
      await page.screenshot({ path: resolve(privateOutput, "research-account-creation-view.png"), fullPage: true });
    }
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: selectedRun } })).status).toBe("COMPLETED");
    await page.goto(origin + `/research/session/${selectedSession}`, { waitUntil: "domcontentloaded" });
    await page.locator(".research-blocks h3").first().waitFor({ state: "visible" });
    if (path === "A") expect(await page.getByRole("heading", { name: "信任和证明", exact: true }).isVisible()).toBe(false);
    if (path === "B") {
      await page.getByRole("heading", { name: /可以借鉴的写法/ }).first().waitFor();
      expect(await page.getByRole("heading", { name: /方法候选/ }).count()).toBe(0);
    }
    // Reopen the saved research itself, then use its creation reference.
    expect((await context.request.post(origin + `/api/research/sessions/${selectedSession}/runs/${selectedRun}`)).ok()).toBe(true);
    await page.goto(origin + `/research/results/run/${selectedRun}`, { waitUntil: "domcontentloaded" });
    await page.locator(".research-blocks h3").first().waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true");
    expect(await page.locator(".work-creation-form").first().evaluate(element => getComputedStyle(element).display)).toBe("grid");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: resolve(privateOutput, `research-saved-${path}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.screenshot({ path: resolve(privateOutput, `research-saved-${path}-view.png`), fullPage: true });
    if (path === "A") {
      const originalBlocks = (await db.researchRun.findUniqueOrThrow({ where: { id: selectedRun } })).blocks;
      const legacyBlocks = [{ id: "historical-writing", type: "text", title: "旧作品的写法", text: "先提问题再解释。\n原文：旧历史原句\n作品主张：旧历史主张\n作品提供的证明：旧历史证明", sourceRefs: [], provenance: "AI_INTERPRETATION", limitation: "" },
        { id: "account-v2-method", type: "text", title: "旧版综合分析", text: "历史分析完整保留", sourceRefs: [], provenance: "AI_INTERPRETATION", limitation: "" },
        { id: "account-v2-skill-0", type: "text", title: "方法候选 · 解释问题", text: "解释客户问题", sourceRefs: [], provenance: "AI_INTERPRETATION", limitation: "" }];
      await db.researchRun.update({ where: { id: selectedRun }, data: { blocks: legacyBlocks } });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "旧作品的写法", exact: true }).waitFor();
      expect(await page.getByText("旧历史原句", { exact: false }).isVisible()).toBe(false);
      expect(await page.getByText("历史分析完整保留", { exact: true }).isVisible()).toBe(false);
      await page.getByRole("heading", { name: "可以借鉴的写法 · 解释问题", exact: true }).waitFor();
      await page.getByText("原文与分析细节", { exact: true }).click();
      expect(await page.getByText("原文：旧历史原句", { exact: true }).isVisible()).toBe(true);
      expect((await db.researchRun.findUniqueOrThrow({ where: { id: selectedRun } })).blocks).toEqual(legacyBlocks);
      await db.researchRun.update({ where: { id: selectedRun }, data: { blocks: originalBlocks! } });
      await page.reload({ waitUntil: "domcontentloaded" });
    }
    const panel = page.locator("section.work-creation-action").first();
    await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true");
    await panel.getByLabel("我的项目", { exact: true }).selectOption(createdProject);
    await panel.getByRole("button", { name: "生成我的版本", exact: true }).click();
    await panel.getByRole("button", { name: "保存为成果", exact: true }).waitFor();
    await panel.getByLabel("成果名称", { exact: true }).fill(path + "浏览器自己的版本");
    if (path === "A") await panel.getByLabel("成果正文", { exact: true }).fill("自己的版本：这是生成后、首次保存前的手动修改。");
    await panel.getByRole("button", { name: "保存为成果", exact: true }).click();
    await panel.getByRole("button", { name: "保存修改", exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("section.work-creation-action")?.getAttribute("data-ready") === "true");
    await panel.getByLabel("我的项目", { exact: true }).selectOption(createdProject);
    await panel.getByText("重新打开项目成果", { exact: true }).click();
    await panel.getByRole("button", { name: path + "浏览器自己的版本", exact: true }).click();
    expect(await panel.getByLabel("成果正文", { exact: true }).inputValue()).toContain("自己的版本");
    if (path === "A") expect(await panel.getByLabel("成果正文", { exact: true }).inputValue()).toBe("自己的版本：这是生成后、首次保存前的手动修改。");
    completedPaths.push(path);
  }
}, 240_000);
