import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { getProjectAssistantThread, runProjectAssistant, saveAssistantMessageResult } from "../server/assistant/service";
import { MockLLMProvider } from "@content-center/providers";
import { createTextArtifact } from "../server/artifacts/service";
import { createResearchSession, reserveResearchRun } from "../server/research/service";
const origin = "http://localhost:3020", out = resolve(process.cwd(), process.env.FINAL_ACCEPTANCE_OUTPUT ? process.env.FINAL_ACCEPTANCE_OUTPUT + "/F1-regression-" + new Date().toISOString().replaceAll(/[-:.]/g, "") + "-" + randomUUID().slice(0,8) : "output/workbench-iteration-20261005/W2-F1");
let browser: Browser, owner: BrowserContext, viewer: BrowserContext;
let userId = "", viewerId = "", foreignId = "", workspaceId = "", foreignWorkspace = "", projectA = "", projectB = "", foreignProject = "", artifactA = "", sessionId = "", runId = "";
const checks: string[] = []; let viewerProject = "", emptyProject = "";
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
  const suffix = randomUUID(), password = "fixture-" + randomUUID(), email = "access-shortcut-" + suffix + "@example.test", viewerEmail = "access-shortcut-viewer-" + suffix + "@example.test";
  userId = (await auth.api.signUpEmail({ body: { name: "Shared Editor Owner", email, password } })).user.id;
  viewerId = (await auth.api.signUpEmail({ body: { name: "Shared Editor Viewer", email: viewerEmail, password } })).user.id;
  foreignId = (await db.user.create({ data: { name: "Shared Foreign Owner", email: "access-shortcut-foreign-" + suffix + "@example.test" } })).id;
  workspaceId = (await db.workspace.create({ data: { name: "Shared Editor Fixture", slug: "access-shortcut-" + suffix, members: { create: [{ userId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
  foreignWorkspace = (await db.workspace.create({ data: { name: "Foreign Fixture", slug: "access-shortcut-foreign-" + suffix, members: { create: { userId: foreignId, role: "OWNER" } } } })).id;
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
  viewerProject = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "已有VIEWER个人对话" } })).id;
  const ownThread = await db.assistantThread.create({ data: { workspaceId, projectId: viewerProject, createdById: viewerId } });
  await db.assistantMessage.create({ data: { threadId: ownThread.id, role: "ASSISTANT", status: "COMPLETED", content: "VIEWER自己的获准记录" } });
  emptyProject = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "无对话的只读项目" } })).id;
  browser = await chromium.launch({ channel: "msedge", headless: true }); owner = await signIn(email, password); viewer = await signIn(viewerEmail, password);
}, 90_000);
afterAll(async () => {
  await owner?.close(); await viewer?.close(); await browser?.close();
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspace].filter(Boolean) } } });
  await db.user.deleteMany({ where: { id: { in: [userId, viewerId, foreignId].filter(Boolean) } } });
  const remaining = await db.user.count({ where: { id: { in: [userId, viewerId, foreignId].filter(Boolean) } } });
  await writeFile(resolve(out, "browser-evidence.json"), JSON.stringify({ checks, fixtureUsersRemaining: remaining, formalDatabaseWrites: 0, modelCalls: 0, realArtifactAPI: true, realAssistantGETPOST: true, usesPersonalPassword: false }, null, 2)); expect(remaining).toBe(0); await db.$disconnect();
}, 60_000);

const projectApi = (id = projectA) => origin + "/api/projects/" + id + "/assistant";
it("VIEWER reads only permitted artifacts, never other member history, with clear 403 and no thread writes", async () => {
  const before = { threads: await db.assistantThread.count({ where: { workspaceId } }), messages: await db.assistantMessage.count({ where: { thread: { workspaceId } } }) };
  const read = await viewer.request.get(projectApi()); expect(read.status()).toBe(200); const result = await read.json(); expect(result.id).toBe(""); expect(result.messages).toEqual([]); expect(result.unavailableReason).toContain("不属于当前账号");
  const mine = await owner.request.get(projectApi()); expect(mine.status()).toBe(200); expect((await mine.json()).messages.map((m: { content: string }) => m.content)).toContain("甲的初始正文");
  const denied = await viewer.request.post(projectApi(), { data: { content: "整理项目建议" } }); expect(denied.status()).toBe(403); expect((await denied.json()).message).toContain("不能使用其他成员的对话");
  let calls = 0; const runtime = { provider: new MockLLMProvider(() => { calls++; return "不应调用"; }), providerName: "MOCK", model: "access-fixture", mode: "MOCK" as const };
  await expect(runProjectAssistant({ workspaceId, userId: viewerId, projectId: projectA, content: "整理项目建议" }, () => undefined, { runtime })).rejects.toMatchObject({ code: "PERMISSION_DENIED" }); expect(calls).toBe(0);
  expect(await db.assistantThread.count({ where: { workspaceId } })).toBe(before.threads); expect(await db.assistantMessage.count({ where: { thread: { workspaceId } } })).toBe(before.messages);
  expect((await viewer.request.get(origin + "/api/projects/" + projectA + "/artifacts/" + artifactA)).status()).toBe(200);
  expect((await viewer.request.put(origin + "/api/projects/" + projectA + "/artifacts/" + artifactA, { data: { expectedVersion: 1, title: "Unauthorized", body: "Unauthorized" } })).status()).toBe(403);
  expect((await viewer.request.get(projectApi(foreignProject))).status()).toBe(404); expect((await viewer.request.post(projectApi(foreignProject), { data: { content: "整理建议" } })).status()).toBe(404);
  const page = await viewer.newPage(); page.setDefaultTimeout(30_000); await page.goto(origin + "/dashboard?project=" + projectA, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByText("此项目对话不属于当前账号。你仍可查看获准的项目成果，不能使用其他成员的对话。", { exact: true }).waitFor();
  expect(await page.getByLabel("和鑫小助说", { exact: true }).isDisabled()).toBe(true); expect(await page.getByRole("button", { name: "发送给鑫小助", exact: true }).isDisabled()).toBe(true);
  await page.getByText("你可以查看获准内容，不能上传资料、保存候选或修改项目成果。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "打开项目成果", exact: true }).click(); await page.getByRole("navigation", { name: "成果列表" }).getByRole("link", { name: /共享成果甲/ }).click(); await expect.poll(() => page.getByLabel("成果正文", { exact: true }).inputValue()).toBe("甲的初始正文");
  await page.screenshot({ path: resolve(out, "viewer-permitted-artifact.png"), fullPage: true }); await page.close(); checks.push("viewer-GET200-empty-other-history-POST403-readableArtifact200-PUT403-crossWorkspace404-no-writes-clear-UI");
}, 180_000);
it("preserves an existing VIEWER own conversation and allowed suggestion preview while denying candidate saves", async () => {
  const read = await viewer.request.get(projectApi(viewerProject)); expect(read.status()).toBe(200); expect((await read.json()).messages[0].content).toBe("VIEWER自己的获准记录");
  const ownerRead = await owner.request.get(projectApi(viewerProject)); expect((await ownerRead.json()).messages).toEqual([]);
  let calls = 0; const runtime = { provider: new MockLLMProvider(() => { calls++; return "建议先整理项目的已知问题。"; }), providerName: "MOCK", model: "access-fixture", mode: "MOCK" as const };
  const message = await runProjectAssistant({ workspaceId, userId: viewerId, projectId: viewerProject, content: "根据当前项目整理建议" }, () => undefined, { runtime }); expect(message.status).toBe("COMPLETED"); expect(calls).toBe(1);
  await expect(saveAssistantMessageResult({ workspaceId, userId: viewerId, projectId: viewerProject, messageId: message.id, action: "TEXT" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  checks.push("existing-viewer-own-history-visible-mock-suggestions-allowed-candidate-save-denied-no-role-change");
}, 90_000);
it("input Ctrl+K works without sacrificing text edit, undo, composition or dirty save-before-search navigation", async () => {
  const page = await owner.newPage(); page.setDefaultTimeout(30_000); await page.goto(origin + "/dashboard?project=" + projectA + "&node=artifact:" + artifactA, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const body = page.getByLabel("成果正文", { exact: true }); await body.waitFor(); await body.fill("键盘编辑草稿");
  await body.press("Control+k"); const search = page.getByRole("dialog", { name: "全局搜索", exact: true }); await search.waitFor(); expect(await body.inputValue()).toBe("键盘编辑草稿");
  await search.getByRole("tab", { name: "成果", exact: true }).click(); await search.getByLabel("搜索项目、成果和资料", { exact: true }).fill("另一项目成果"); await search.getByRole("button", { name: /另一项目成果/ }).click();
  await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); expect(await body.inputValue()).toBe("键盘编辑草稿"); expect(new URL(page.url()).searchParams.get("project")).toBe(projectA); await search.getByRole("button", { name: "关闭搜索", exact: true }).click();
  await body.fill("编辑草稿ABC"); await body.press("End"); await body.press("Backspace"); expect(await body.inputValue()).toBe("编辑草稿AB"); await body.press("D"); expect(await body.inputValue()).toBe("编辑草稿ABD"); await body.press("Control+z"); expect(await body.inputValue()).toBe("编辑草稿AB");
  await body.dispatchEvent("keydown", { key: "k", ctrlKey: true, altKey: true, bubbles: true }); expect(await search.count()).toBe(0);
  await body.dispatchEvent("keydown", { key: "k", ctrlKey: true, isComposing: true, bubbles: true }); expect(await search.count()).toBe(0); expect(await body.inputValue()).toBe("编辑草稿AB");
  await body.press("Control+k"); await search.waitFor(); await search.getByLabel("搜索项目、成果和资料", { exact: true }).press("Control+k"); await search.waitFor({ state: "hidden" }); expect(await body.inputValue()).toBe("编辑草稿AB");
  await body.focus(); await body.press("Control+k"); await search.waitFor(); await search.getByLabel("搜索项目、成果和资料", { exact: true }).fill("另一项目成果"); await search.getByRole("button", { name: /另一项目成果/ }).click(); await page.getByRole("button", { name: "保存并继续", exact: true }).click(); await page.waitForURL(url => url.searchParams.get("project") === projectB); await page.getByLabel("成果正文", { exact: true }).waitFor(); expect(await page.getByLabel("成果正文", { exact: true }).inputValue()).toBe("项目乙独立正文");
  const saved = await owner.request.get(origin + "/api/projects/" + projectA + "/artifacts/" + artifactA); expect((await saved.json()).content).toBe("编辑草稿AB");
  await page.screenshot({ path: resolve(out, "shortcut-save-before-navigation.png"), fullPage: true }); await page.close(); checks.push("textarea-ctrlK-noTab-edit-backspace-undo-IME-Alt-isolation-search-toggle-cancel-save-before-crossProject-realPUT");
}, 180_000);
it("empty project lists remain read-only and invalid members cannot access personal thread metadata", async () => {
  const responses = await Promise.all([owner.request.get(projectApi(emptyProject)), viewer.request.get(projectApi(emptyProject))]); for (const response of responses) { expect(response.status()).toBe(200); expect(await response.json()).toEqual({ id: "", messages: [] }); }
  expect(await db.assistantThread.count({ where: { projectId: emptyProject } })).toBe(0);
  await db.workspaceMember.updateMany({ where: { workspaceId, userId: viewerId }, data: { disabledAt: new Date() } });
  try { await expect(getProjectAssistantThread({ workspaceId, userId: viewerId, projectId: viewerProject })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" }); expect([401,404]).toContain((await viewer.request.get(projectApi(viewerProject))).status()); }
  finally { await db.workspaceMember.updateMany({ where: { workspaceId, userId: viewerId }, data: { disabledAt: null } }); }
  checks.push("empty-list-GET-does-not-create-disabled-member-denied");
}, 60_000);
