import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { auth } from "@/lib/auth";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const ownerEmail = `phase9d-owner-${runId}@example.test`;
const viewerEmail = `phase9d-viewer-${runId}@example.test`;
const password = "safe-phase9d-password";
const outputDir = resolve(process.cwd(), "../../output/playwright/phase9d");
let ownerId = "";
let viewerId = "";
let workspaceId = "";
let projectId = "";
let ownerCookies: ReturnType<typeof sessionCookies> = [];
let viewerCookies: ReturnType<typeof sessionCookies> = [];

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1); const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test.describe.serial("Phase 9D project materials utility panel", () => {
  test.beforeAll(async () => {
    await mkdir(outputDir, { recursive: true });
    const [ownerRegistration, viewerRegistration] = await Promise.all([
      auth.api.signUpEmail({ body: { name: "Phase 9D Owner", email: ownerEmail, password }, asResponse: true }),
      auth.api.signUpEmail({ body: { name: "Phase 9D Viewer", email: viewerEmail, password }, asResponse: true }),
    ]);
    ownerCookies = sessionCookies(ownerRegistration);
    viewerCookies = sessionCookies(viewerRegistration);
    ownerId = ((await ownerRegistration.clone().json()) as { user: { id: string } }).user.id;
    viewerId = ((await viewerRegistration.clone().json()) as { user: { id: string } }).user.id;
    const workspace = await ensurePersonalWorkspaceForUser(db, { userId: ownerId });
    workspaceId = workspace.id;
    await db.workspaceMember.create({ data: { workspaceId, userId: viewerId, role: "VIEWER" } });
    const tag = await db.contentTag.create({ data: { workspaceId, name: "访谈", slug: `interview-${runId}` } });
    const [interview, document] = await Promise.all([
      db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "校长访谈手记", author: "内容团队", description: "真实访谈中关于招生表达的整理记录。", tags: { create: { tagId: tag.id } } } }),
      db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "DOCUMENT", sourcePlatform: "GENERIC", status: "READY", title: "课程产品说明", author: "教研团队", description: "课程定位与适用人群的内部说明。" } }),
    ]);
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Phase 9D 资料拖入验收", sources: { create: [{ sourceItemId: interview.id, role: "REFERENCE", sortOrder: 0 }, { sourceItemId: document.id, role: "OWN_MATERIAL", sortOrder: 1 }] } } });
    projectId = project.id;
    const primaryDraft = await db.draftBranch.create({ data: { workspaceId, projectId, title: "主稿", createdById: ownerId, updatedById: ownerId } });
    await db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: primaryDraft.id } });
  });

  test.afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (ownerId || viewerId) await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId].filter(Boolean) } } });
    await db.$disconnect();
  });

  test("opens, searches, filters, switches views, drags a material, preserves viewport and persists the node", async ({ page }) => {
    const consoleIssues: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
    await page.context().addCookies(ownerCookies);
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/dashboard?project=${projectId}`);
    const canvas = page.getByRole("region", { name: "内容画布" });
    const viewport = canvas.locator(".react-flow__viewport");
    await expect(viewport).toHaveAttribute("style", /translate\(18px, 48px\) scale\(0\.92\)/);
    const initialTransform = await viewport.getAttribute("style");
    await page.getByRole("button", { name: /项目资料，2 条/ }).click();
    const panel = page.locator("aside.project-materials-panel");
    await expect(panel).toHaveAttribute("data-open", "true");
    await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect(viewport).toHaveAttribute("style", initialTransform || "");
    await page.screenshot({ path: resolve(outputDir, "1680-project-materials-panel.png"), fullPage: false });
    await page.screenshot({ path: resolve(outputDir, "1680-grid-view.png"), fullPage: false });

    await panel.getByLabel("搜索项目资料").fill("内容团队");
    await expect(panel.getByText("校长访谈手记", { exact: true })).toBeVisible();
    await expect(panel.getByText("课程产品说明", { exact: true })).toHaveCount(0);
    await panel.getByLabel("资料类型").selectOption("TEXT");
    await panel.getByLabel("资料标签").selectOption({ label: "访谈" });
    await page.screenshot({ path: resolve(outputDir, "1680-search-filter.png"), fullPage: false });
    await panel.getByLabel("搜索项目资料").fill("");
    await panel.getByLabel("资料类型").selectOption("ALL");
    await panel.getByLabel("资料标签").selectOption("ALL");
    await panel.getByRole("button", { name: "列表视图" }).click();
    await expect(panel.locator(".project-material-items")).toHaveClass(/is-list/);
    await page.screenshot({ path: resolve(outputDir, "1680-list-view.png"), fullPage: false });
    await panel.getByRole("button", { name: "网格视图" }).click();

    const material = panel.getByRole("listitem").filter({ hasText: "校长访谈手记" });
    const sourceBox = await material.boundingBox();
    const targetBox = await canvas.locator(".react-flow__pane").boundingBox();
    if (!sourceBox || !targetBox) throw new Error("拖拽目标不可见。");
    const drop = { x: targetBox.x + Math.min(560, targetBox.width * .48), y: targetBox.y + Math.min(520, targetBox.height * .58) };
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 42);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 12 });
    await page.screenshot({ path: resolve(outputDir, "1680-dragging-material.png"), fullPage: false });
    await page.mouse.up();
    await expect.poll(() => db.canvasObject.count({ where: { projectId, objectType: "MATERIAL_REFERENCE", deletedAt: null } }), { timeout: 10_000 }).toBe(1);
    const created = await db.canvasObject.findFirstOrThrow({ where: { projectId, objectType: "MATERIAL_REFERENCE", deletedAt: null }, include: { materialReference: true } });
    expect(created.materialReference?.sourceTitleSnapshot).toBe("校长访谈手记");
    expect(created.textContent).toBeNull();
    expect(created.positionX).toBeGreaterThan(100);
    expect(created.positionY).toBeGreaterThan(100);
    await expect(panel).toHaveAttribute("data-open", "true");
    await expect(viewport).toHaveAttribute("style", initialTransform || "");
    const createdNode = canvas.locator(".free-canvas-node.is-material-reference").filter({ hasText: "校长访谈手记" });
    await expect(createdNode).toContainText("文字资料");
    await expect(createdNode).not.toContainText(/GENERIC|TEXT/);

    await material.getByRole("button", { name: /添加到画布/ }).click();
    await expect(page.getByText("这条资料刚刚已经添加，请稍候再试。")).toBeVisible();
    expect(await db.canvasObject.count({ where: { projectId, objectType: "MATERIAL_REFERENCE", deletedAt: null } })).toBe(1);
    await page.getByRole("button", { name: "关闭错误提示" }).click();
    await panel.getByRole("button", { name: "关闭项目资料" }).click();
    await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    const materialNode = canvas.locator(".free-canvas-node.is-material-reference").filter({ hasText: "校长访谈手记" });
    await expect(materialNode).toBeVisible();
    const nodeBox = await materialNode.boundingBox();
    expect(nodeBox).not.toBeNull();
    expect(Math.abs((nodeBox!.x + nodeBox!.width / 2) - drop.x)).toBeLessThan(260);
    await page.screenshot({ path: resolve(outputDir, "1680-material-reference.png"), fullPage: false });

    await page.reload();
    await expect(canvas.locator(".free-canvas-node.is-material-reference").filter({ hasText: "校长访谈手记" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    const widthBefore = (await canvas.boundingBox())?.width;
    await page.getByRole("button", { name: /项目资料，2 条/ }).click();
    await expect(panel).toHaveAttribute("data-open", "true");
    await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    expect(Math.abs(((await canvas.boundingBox())?.width ?? 0) - (widthBefore ?? 0))).toBeLessThan(8);
    await page.screenshot({ path: resolve(outputDir, "1440-utility-panel-open.png"), fullPage: false });
    await panel.getByRole("button", { name: "关闭项目资料" }).click();
    await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    await page.screenshot({ path: resolve(outputDir, "1440-material-reference.png"), fullPage: false });
    await page.getByRole("button", { name: /项目资料，2 条/ }).click();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveAttribute("data-open", "false");
    expect(consoleIssues).toEqual([]);
  });

  test("keeps the project materials panel read-only for Viewer", async ({ page }) => {
    const consoleIssues: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
    await page.context().addCookies(viewerCookies);
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/dashboard?project=${projectId}`);
    await page.getByRole("button", { name: /项目资料，2 条/ }).click();
    const panel = page.locator("aside.project-materials-panel");
    await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    const material = panel.getByRole("listitem").filter({ hasText: "校长访谈手记" });
    await expect(material).toHaveAttribute("draggable", "false");
    await expect(material.getByRole("button", { name: /添加到画布/ })).toBeDisabled();
    await expect(panel).toContainText("当前权限可以查看资料，但不能向画布添加引用。");
    await page.screenshot({ path: resolve(outputDir, "1680-viewer-readonly-panel.png"), fullPage: false });
    expect(consoleIssues).toEqual([]);
  });
});
