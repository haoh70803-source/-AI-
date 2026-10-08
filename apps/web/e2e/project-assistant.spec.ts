import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const suffix = randomUUID();
const email = `project-assistant-${suffix}@example.test`;
const password = "safe-project-assistant-password";
let userId = "";
let workspaceId = "";
let projectId = "";
let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1); const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test.describe.serial("Phase 10B project assistant", () => {
  test.beforeAll(async () => {
    const registration = await auth.api.signUpEmail({ body: { name: "Project Assistant QA", email, password }, asResponse: true });
    cookies = sessionCookies(registration);
    userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
    workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "项目级鑫小助验收", goal: "整理校长招生内容", audience: "校长" } });
    projectId = project.id;
    const branch = await db.draftBranch.create({ data: { workspaceId, projectId, title: "主稿", workingTitle: "招生内容", workingBody: "先从真实问题开始。", workingOutline: [], version: 1, createdById: userId, updatedById: userId } });
    const revision = await db.draftRevision.create({ data: { workspaceId, projectId, draftBranchId: branch.id, revision: 1, title: "招生内容", body: "先从真实问题开始。", outline: [], createdById: userId } });
    await db.$transaction([db.draftBranch.update({ where: { id: branch.id }, data: { currentRevisionId: revision.id } }), db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: branch.id } })]);
    await db.motherContent.create({ data: { workspaceId, projectId, title: "招生内容", body: "先从真实问题开始。", outline: [], createdById: userId } });
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "校长访谈资料", description: "真实访谈整理", status: "READY" } });
    await db.projectSource.create({ data: { projectId, sourceItemId: source.id, role: "REFERENCE" } });
    await db.canvasObject.create({ data: { workspaceId, projectId, objectType: "TEXT", title: "当前选中观点", textContent: "先解决真实问题", positionX: 760, positionY: 160, width: 360, height: 220, createdById: userId, updatedById: userId } });
    for (const title of ["老板知识型口播", "去 AI 味"]) {
      const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "SAVED" } });
      await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title, steps: [title === "去 AI 味" ? "让已有文字更自然" : "先说清问题，再给一个动作"], applicableScenarios: [title === "去 AI 味" ? "已有稿件需要更自然时" : "知识型短视频口播"], boundaries: ["不编造事实"], evidence: [], editedById: userId } });
    }
  });

  test.afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  test("streams with project references and saves a candidate without resetting Canvas", async ({ page }) => {
    const consoleIssues: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
    await page.context().addCookies(cookies);
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/dashboard?project=${projectId}`);
    await page.waitForTimeout(500);
    const before = await page.locator(".react-flow__viewport").evaluate((element) => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return { x: matrix.e, y: matrix.f, zoom: matrix.a }; });
    await page.getByRole("button", { name: "添加引用" }).last().click();
    await page.getByPlaceholder("搜索画布内容或当前创作资料").fill("校长访谈");
    await page.getByRole("button", { name: /校长访谈资料/ }).click();
    await page.getByLabel("和鑫小助说").fill("根据当前项目和资料给我几个选题");
    await page.getByLabel("和鑫小助说").press("Enter");
    await expect(page.getByText(/我会基于当前项目/)).toBeVisible();
    await expect(page.getByText(/来源 \d+/)).toBeVisible();
    await page.getByText(/来源 \d+/).press("Enter");
    await expect(page.locator(".studio-assistant-citations").getByText("校长访谈资料", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "保存", exact: true }).first().press("Enter");
    await expect(page.getByText("已保存到画布，并选中新文本。")).toBeVisible();
    await expect.poll(() => db.canvasObject.count({ where: { projectId, objectType: "TEXT", deletedAt: null } })).toBe(2);
    const after = await page.locator(".react-flow__viewport").evaluate((element) => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return { x: matrix.e, y: matrix.f, zoom: matrix.a }; });
    expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.02);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1680, height: 1000 }, { width: 1920, height: 1080 }]) { await page.setViewportSize(viewport); await expect(page.locator(".content-canvas")).toBeVisible(); await expect(page.getByLabel("和鑫小助说")).toBeVisible(); await expect(page.getByRole("button", { name: /项目资料，1 条/ })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }
    expect(consoleIssues).toEqual([]);
  });

  test("loads multiple Skills, removes one, and keeps resolver status product-facing", async ({ page }) => {
    await page.context().addCookies(cookies);
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/dashboard?project=${projectId}`);
    const pool = page.getByTestId("studio-skill-pool");
    await expect(pool).toContainText("当前项目还没有加载 Skill，Agent 会根据你的任务直接处理。");
    await pool.getByRole("button", { name: "添加 Skill" }).click();
    const picker = page.getByRole("dialog", { name: "选择创作方法" });
    await picker.locator("article").filter({ hasText: "老板知识型口播" }).getByRole("button", { name: "选择", exact: true }).click();
    await picker.locator("article").filter({ hasText: "去 AI 味" }).getByRole("button", { name: "选择", exact: true }).click();
    await picker.getByRole("button", { name: "保存选择", exact: true }).click();
    await expect(pool).toContainText("老板知识型口播");
    await expect(pool).toContainText("去 AI 味");
    await expect(pool.getByRole("button", { name: "移除 Skill 老板知识型口播" })).toBeVisible();
    await pool.getByRole("button", { name: "移除 Skill 老板知识型口播" }).click();
    await expect(pool).not.toContainText("老板知识型口播");
    await expect(pool).toContainText("去 AI 味");

    await page.getByLabel("和鑫小助说").fill("告诉我当前项目状态");
    await page.getByLabel("和鑫小助说").press("Enter");
    const status = page.getByTestId("studio-resolver-status");
    await expect(status).toContainText("正在读取当前项目和资料");
    await expect(status).toContainText("去 AI 味：使用");
    await expect(status).toContainText("已完成", { timeout: 30_000 });
    const statusText = await status.innerText();
    expect(statusText).not.toMatch(/MethodVersion|AIRun|Provider|Prompt|Schema|workspaceId|sourceItemId|[a-z0-9]{20,}/u);
  });
});
