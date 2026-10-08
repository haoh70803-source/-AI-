import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const suffix = randomUUID(); const email = `canvas-node-ai-${suffix}@example.test`; const password = "safe-canvas-node-ai-password";
let userId = ""; let workspaceId = ""; let projectId = ""; let sourceObjectId = ""; let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];
function sessionCookies(response: Response) { return response.headers.getSetCookie().map((header) => { const [pair] = header.split(";", 1); const separator = pair!.indexOf("="); return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; }); }

test.describe.serial("Phase 10C canvas node AI", () => {
  test.beforeAll(async () => {
    const registration = await auth.api.signUpEmail({ body: { name: "Canvas Node AI QA", email, password }, asResponse: true }); cookies = sessionCookies(registration); userId = ((await registration.clone().json()) as { user: { id: string } }).user.id; workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "节点 AI 验收", goal: "基于真实节点继续创作" } })).id;
    const branch = await db.draftBranch.create({ data: { workspaceId, projectId, title: "主稿", workingTitle: "", workingBody: "", workingOutline: [], createdById: userId, updatedById: userId } }); await db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: branch.id } });
    sourceObjectId = (await db.canvasObject.create({ data: { workspaceId, projectId, objectType: "TEXT", title: "招生判断原文", textContent: "招生内容先回应真实问题。", positionX: 180, positionY: 180, width: 360, height: 220, createdById: userId, updatedById: userId } })).id;
  });
  test.afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); if (userId) await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });

  test("creates and follows a generated node without changing the source or zoom", async ({ page }) => {
    const consoleIssues: string[] = []; page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
    await page.context().addCookies(cookies); await page.setViewportSize({ width: 1680, height: 1000 }); await page.goto(`/dashboard?project=${projectId}`);
    await page.getByText("招生判断原文", { exact: true }).click(); await expect(page.getByText("当前正在基于：招生判断原文", { exact: true })).toBeVisible();
    const sourceBefore = await db.canvasObject.findUniqueOrThrow({ where: { id: sourceObjectId } }); const zoomBefore = await page.locator(".react-flow__viewport").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
    await page.getByLabel("和鑫小助说").fill("基于这个给我出 3 个选题"); await page.getByLabel("和鑫小助说").press("Enter");
    const resultId = await expect.poll(async () => (await db.canvasGenerateRun.findFirst({ where: { projectId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } }))?.resultCanvasObjectId, { timeout: 20_000 }).toBeTruthy().then(async () => (await db.canvasGenerateRun.findFirstOrThrow({ where: { projectId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } })).resultCanvasObjectId!);
    await expect(page.getByTestId(`rf__node-object:${resultId}`)).toHaveClass(/selected/); await expect(page.locator(".canvas-generated-edge")).toHaveCount(1);
    const result = await db.canvasObject.findUniqueOrThrow({ where: { id: resultId } }); expect(result.positionX).toBe(sourceBefore.positionX + sourceBefore.width + 64);
    expect(await db.canvasObject.findUniqueOrThrow({ where: { id: sourceObjectId } })).toMatchObject({ textContent: sourceBefore.textContent, contentVersion: sourceBefore.contentVersion });
    expect(await db.canvasObjectSnapshot.count({ where: { objectId: sourceObjectId, snapshotReason: "AI_INPUT" } })).toBe(1); expect(await db.canvasRelation.count({ where: { sourceObjectId, targetObjectId: resultId, relationType: "GENERATED_FROM" } })).toBe(1);
    const zoomAfter = await page.locator(".react-flow__viewport").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a); expect(zoomAfter).toBeCloseTo(zoomBefore, 5); expect(consoleIssues).toEqual([]);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1680, height: 1000 }, { width: 1920, height: 1080 }]) { await page.setViewportSize(viewport); await expect(page.locator(".content-canvas")).toBeVisible(); await expect(page.getByLabel("和鑫小助说")).toBeVisible(); await expect(page.locator(".canvas-generated-edge")).toHaveCount(1); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }
  });
});
