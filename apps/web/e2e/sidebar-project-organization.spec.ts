import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test, type BrowserContext } from "@playwright/test";
import { auth } from "../lib/auth";

const suffix = randomUUID();
const ownerEmail = `sidebar-org-owner-${suffix}@example.test`;
const viewerEmail = `sidebar-org-viewer-${suffix}@example.test`;
const password = "safe-sidebar-organization-password";
let ownerId = "";
let viewerId = "";
let workspaceId = "";
let alphaId = "";
let betaId = "";
let gammaId = "";
let ownerCookies: Parameters<BrowserContext["addCookies"]>[0] = [];
let viewerCookies: Parameters<BrowserContext["addCookies"]>[0] = [];

function responseCookies(response: Response) {
  return response.headers.getSetCookie().map((value) => {
    const pair = value.split(";")[0]!;
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

async function addProject(userId: string, title: string, updatedAt: Date) {
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title, updatedAt } });
  const branch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, title: "主稿", createdById: userId, updatedById: userId } });
  await db.contentProject.update({ where: { id: project.id }, data: { primaryDraftBranchId: branch.id } });
  return project.id;
}

test.beforeAll(async () => {
  const ownerRegistration = await auth.api.signUpEmail({ body: { name: "Sidebar Org Owner", email: ownerEmail, password }, asResponse: true });
  const viewerRegistration = await auth.api.signUpEmail({ body: { name: "Sidebar Org Viewer", email: viewerEmail, password }, asResponse: true });
  expect(ownerRegistration.ok).toBe(true);
  expect(viewerRegistration.ok).toBe(true);
  ownerId = ((await ownerRegistration.clone().json()) as { user: { id: string } }).user.id;
  viewerId = ((await viewerRegistration.clone().json()) as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId: ownerId })).id;
  await db.workspaceMember.create({ data: { workspaceId, userId: viewerId, role: "VIEWER" } });
  ownerCookies = responseCookies(ownerRegistration);
  viewerCookies = responseCookies(viewerRegistration);
  alphaId = await addProject(ownerId, "Alpha Sidebar Project", new Date("2026-01-01T00:00:00.000Z"));
  betaId = await addProject(ownerId, "Beta Sidebar Project", new Date("2026-02-01T00:00:00.000Z"));
  gammaId = await addProject(ownerId, "Gamma Sidebar Project", new Date("2026-03-01T00:00:00.000Z"));
});

test.afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
  await db.$disconnect();
});

test("owner organizes projects, renames, and creates a lightweight project", async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().addCookies(ownerCookies);
  await page.setViewportSize({ width: 1680, height: 945 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "收起侧栏", exact: true }).or(page.getByRole("button", { name: "展开侧栏", exact: true })).waitFor();
  if (await page.getByRole("button", { name: "展开侧栏", exact: true }).isVisible()) await page.getByRole("button", { name: "展开侧栏", exact: true }).click();

  const organization = page.getByRole("region", { name: "项目管理" });
  await expect(organization).toBeVisible();
  await expect(page.getByRole("region", { name: "未分组" })).toContainText("Alpha Sidebar Project");
  await page.getByRole("button", { name: "最近打开", exact: true }).click();
  await expect(page.getByRole("region", { name: "最近打开" })).toContainText("Gamma Sidebar Project");

  await page.getByRole("button", { name: "创建项目文件夹" }).click();
  await page.getByRole("dialog", { name: "新建文件夹" }).getByLabel("名称").fill("客户项目");
  await page.getByRole("dialog", { name: "新建文件夹" }).getByRole("button", { name: "保存" }).click();
  const customerFolder = page.locator(".app-sidebar-folder").filter({ hasText: "客户项目" });
  await expect(customerFolder).toBeVisible();
  await expect(customerFolder.getByRole("button", { name: /客户项目/ }).first()).toHaveAttribute("aria-expanded", "true");

  const ungrouped = page.getByRole("region", { name: "未分组" });
  await ungrouped.getByRole("button", { name: "项目菜单：Alpha Sidebar Project" }).click();
  await page.getByRole("button", { name: "客户项目", exact: true }).click();
  await expect(customerFolder).toContainText("Alpha Sidebar Project");

  await customerFolder.getByRole("button", { name: "项目菜单：Alpha Sidebar Project" }).click();
  await page.getByRole("button", { name: "置顶", exact: true }).click();
  await expect(page.getByRole("region", { name: "置顶" })).toContainText("Alpha Sidebar Project");

  await customerFolder.getByRole("button", { name: "项目菜单：Alpha Sidebar Project" }).click();
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page.getByRole("dialog", { name: "重命名项目" }).getByLabel("名称").fill("Alpha Renamed");
  await page.getByRole("dialog", { name: "重命名项目" }).getByRole("button", { name: "保存" }).click();
  await expect(customerFolder).toContainText("Alpha Renamed");
  await expect(customerFolder.getByRole("link", { name: "Alpha Renamed" })).toHaveAttribute("href", `/dashboard?project=${alphaId}`);

  const beforeManual = await ungrouped.locator(".app-sidebar-project-row > a").allTextContents();
  expect(beforeManual).toEqual(expect.arrayContaining(["Beta Sidebar Project", "Gamma Sidebar Project"]));
  await ungrouped.getByRole("button", { name: "项目菜单：Beta Sidebar Project" }).click();
  await page.getByRole("button", { name: "移到顶部", exact: true }).click();
  await expect.poll(async () => (await ungrouped.locator(".app-sidebar-project-row > a").allTextContents())[0]).toBe("Beta Sidebar Project");

  await page.getByRole("button", { name: "项目排序与分组" }).click();
  await page.getByRole("dialog", { name: "项目排序" }).getByRole("button", { name: "最近打开", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "项目排序与分组" }).click();
  await expect(page.getByRole("dialog", { name: "项目排序" }).getByRole("button", { name: "最近打开", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-sidebar-folder").filter({ hasText: "客户项目" }).getByRole("button", { name: /客户项目/ }).first()).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "创建项目文件夹" }).click();
  await page.getByRole("dialog", { name: "新建文件夹" }).getByLabel("名称").fill("临时文件夹");
  await page.getByRole("dialog", { name: "新建文件夹" }).getByRole("button", { name: "保存" }).click();
  const temporaryFolder = page.locator(".app-sidebar-folder").filter({ hasText: "临时文件夹" });
  await temporaryFolder.getByRole("button", { name: "文件夹菜单：临时文件夹" }).click();
  await page.getByRole("button", { name: "删除文件夹", exact: true }).click();
  await page.getByRole("dialog", { name: "删除文件夹", exact: true }).getByRole("button", { name: "删除文件夹", exact: true }).click();
  await expect(temporaryFolder).toHaveCount(0);

  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建项目" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("项目名称").fill("Lightweight Project");
  await dialog.getByLabel("项目描述（可选）").fill("Only title and description.");
  await dialog.getByRole("button", { name: "创建并进入" }).click();
  await expect(page).toHaveURL(new RegExp("/dashboard\\?project=.+"));
  const created = await db.contentProject.findFirstOrThrow({ where: { workspaceId, title: "Lightweight Project" }, select: { id: true, description: true, goal: true, audience: true } });
  expect(created).toMatchObject({ description: "Only title and description.", goal: null, audience: null });
  await expect.poll(async () => db.userProjectPreference.findUnique({ where: { workspaceId_userId_projectId: { workspaceId, userId: ownerId, projectId: created.id } }, select: { lastOpenedAt: true } })).not.toBeNull();
});

test("viewer can organize personal sidebar but cannot create or rename projects", async ({ page }) => {
  await page.context().addCookies(viewerCookies);
  await page.setViewportSize({ width: 1680, height: 945 });
  await page.goto("/dashboard");
  if (await page.getByRole("button", { name: "展开侧栏", exact: true }).isVisible()) await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await expect(page.getByRole("button", { name: "创建项目", exact: true })).toHaveCount(0);

  const ungrouped = page.getByRole("region", { name: "未分组" });
  await ungrouped.getByRole("button", { name: "项目菜单：Beta Sidebar Project" }).click();
  await expect(page.getByRole("button", { name: "重命名", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "置顶", exact: true }).click();
  await expect(page.getByRole("region", { name: "置顶" })).toContainText("Beta Sidebar Project");

  await page.getByRole("button", { name: "创建项目文件夹" }).click();
  await page.getByRole("dialog", { name: "新建文件夹" }).getByLabel("名称").fill("Viewer Folder");
  await page.getByRole("dialog", { name: "新建文件夹" }).getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".app-sidebar-folder").filter({ hasText: "Viewer Folder" })).toBeVisible();

  const createResponse = await page.request.post("/api/projects", { data: { title: "Viewer Cannot Create" } });
  expect(createResponse.status()).toBe(403);
  const renameResponse = await page.request.patch(`/api/projects/${gammaId}`, { data: { title: "Viewer Cannot Rename" } });
  expect(renameResponse.status()).toBe(403);
  expect((await db.contentProject.findUniqueOrThrow({ where: { id: gammaId }, select: { title: true } })).title).toBe("Gamma Sidebar Project");

  const ownerView = await db.userProjectPreference.findUnique({ where: { workspaceId_userId_projectId: { workspaceId, userId: ownerId, projectId: betaId } } });
  const viewerView = await db.userProjectPreference.findUnique({ where: { workspaceId_userId_projectId: { workspaceId, userId: viewerId, projectId: betaId } } });
  expect(viewerView?.pinnedAt).not.toBeNull();
  expect(ownerView?.pinnedAt ?? null).toBeNull();
});

test("reference search, library filters, keyboard and viewport boundaries", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.context().addCookies(ownerCookies);
  const ownSource = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", title: "Reference Library Needle", rawText: "needle document", status: "READY" } });
  const archived = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", title: "Reference Archived Needle", status: "ARCHIVED" } });
  const other = await db.workspace.create({ data: { name: "Foreign Search Workspace", slug: `foreign-search-${suffix}` } });
  try {
    const foreign = await db.sourceItem.create({ data: { workspaceId: other.id, createdById: viewerId, sourceType: "TEXT", title: "Reference Foreign Needle", status: "READY" } });
    await page.goto("/library");
    const searchResponse = await page.request.get("/api/search?q=Needle&scope=TEXT");
    expect(searchResponse.status()).toBe(200);
    const data = await searchResponse.json() as { items: Array<{ id: string }> };
    expect(data.items.map((item) => item.id)).toContain(ownSource.id);
    expect(data.items.map((item) => item.id)).not.toContain(foreign.id);
    expect(data.items.map((item) => item.id)).not.toContain(archived.id);
    await page.keyboard.press("Control+k");
    const searchDialog = page.getByRole("dialog", { name: "全局搜索" });
    await expect(searchDialog).toBeVisible();
    await searchDialog.getByLabel("搜索项目和资料").fill("Reference Library Needle");
    await expect(searchDialog.getByRole("button", { name: /Reference Library Needle/ })).toBeVisible();
    await searchDialog.getByRole("tab", { name: "项目", exact: true }).click();
    await expect(searchDialog.getByText("没有找到相关内容")).toBeVisible();
    await searchDialog.getByRole("tab", { name: "文本", exact: true }).click();
    await expect(searchDialog.getByRole("button", { name: /Reference Library Needle/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchDialog).toHaveCount(0);
    await page.getByLabel("搜索资料", { exact: true }).fill("Reference Library Needle");
    await expect(page).toHaveURL(/search=Reference/);
    await expect(page.locator(".asset-library-card")).toHaveCount(1);
    await page.getByRole("button", { name: "列表视图" }).click();
    await expect(page.locator(".asset-library-grid")).toHaveClass(/is-list/);
    await page.reload();
    await expect(page.getByRole("button", { name: "列表视图" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "网格视图" }).click();
    for (const width of [390, 768, 1440, 1680, 1920, 2560]) {
      await page.setViewportSize({ width, height: width < 1000 ? 844 : 1080 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(async () => { const card = await page.locator(".asset-library-card").boundingBox(); return card!.x + card!.width; }).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`reference-library-${width}.png`) });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Control+k");
    await expect(searchDialog).toBeVisible();
    await searchDialog.getByLabel("搜索项目和资料").fill("Reference Library Needle");
    await expect(searchDialog.getByRole("button", { name: /Reference Library Needle/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/library/${ownSource.id}$`));
  } finally {
    await db.sourceItem.deleteMany({ where: { id: { in: [ownSource.id, archived.id] } } });
    await db.workspace.delete({ where: { id: other.id } });
  }
});

test("project and material lifecycle menus are exclusive, readable and recoverable", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await page.context().addCookies(ownerCookies);
  await page.setViewportSize({ width: 1440, height: 900 });
  const created = await page.request.post("/api/projects", { data: { title: "Lifecycle Project" } });
  expect(created.status()).toBeLessThan(300);
  const project = await created.json() as { id: string };
  await db.contentProject.update({ where: { id: project.id }, data: { status: "WRITING" } });
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", title: "Lifecycle Material", rawText: "Persistent source", status: "READY" } });
  await db.projectSource.create({ data: { projectId: project.id, sourceItemId: source.id } });
  await page.goto("/projects?view=all");
  const triggers = page.locator(".project-card-menu-trigger");
  await triggers.nth(0).click();
  await triggers.nth(1).click();
  await expect(page.locator(".sidebar-command-surface")).toHaveCount(1);
  await expect(triggers.nth(0)).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar-command-surface")).toHaveCount(0);
  await page.getByRole("button", { name: "更多项目操作：Lifecycle Project", exact: true }).click();
  await page.getByRole("button", { name: "归档项目", exact: true }).click();
  const archiveDialog = page.getByRole("dialog", { name: "归档项目", exact: true });
  await expect(archiveDialog).toBeVisible();
  await archiveDialog.getByRole("button", { name: "确认归档" }).click();
  await expect(page.getByRole("button", { name: "更多项目操作：Lifecycle Project", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "项目状态" }).getByRole("link", { name: "已归档", exact: true }).click();
  await page.getByRole("button", { name: "更多项目操作：Lifecycle Project", exact: true }).click();
  await page.getByRole("button", { name: "恢复项目", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复项目", exact: true }).getByRole("button", { name: "恢复项目", exact: true }).click();
  await expect.poll(async () => (await db.contentProject.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("WRITING");

  const viewer = await browser.newContext({ baseURL: "http://localhost:3001" });
  await viewer.addCookies(viewerCookies);
  expect((await viewer.request.post(`/api/projects/${project.id}/restore`)).status()).toBe(403);
  expect((await viewer.request.post(`/api/projects/${project.id}/transition`, { data: { to: "ARCHIVED" } })).status()).toBe(403);
  expect((await viewer.request.delete(`/api/projects/${project.id}`)).status()).toBe(403);
  expect((await viewer.request.patch(`/api/source-items/${source.id}`, { data: { action: "RESTORE" } })).status()).toBe(403);
  await viewer.close();

  await page.goto("/library");
  await page.getByRole("button", { name: "更多资料操作：Lifecycle Material", exact: true }).click();
  await expect(page.locator(".sidebar-command-surface")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: testInfo.outputPath("opaque-material-menu.png") });
  await page.getByRole("button", { name: "删除资料", exact: true }).click();
  await page.getByRole("dialog", { name: "删除资料", exact: true }).getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByRole("dialog", { name: "删除资料", exact: true }).getByRole("alert")).toContainText("引用");
  await page.getByRole("dialog", { name: "删除资料", exact: true }).getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "归档资料", exact: true }).click();
  await page.getByRole("dialog", { name: "归档资料", exact: true }).getByRole("button", { name: "确认归档" }).click();
  await expect(page.getByRole("button", { name: "更多资料操作：Lifecycle Material", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "资料用途" }).getByRole("link", { name: "已归档" }).click();
  await page.getByRole("button", { name: "更多资料操作：Lifecycle Material", exact: true }).click();
  await page.getByRole("button", { name: "恢复资料", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复资料", exact: true }).getByRole("button", { name: "恢复资料", exact: true }).click();
  await expect.poll(async () => (await db.sourceItem.findUniqueOrThrow({ where: { id: source.id } })).status).toBe("READY");
  await page.goto("/projects?view=all");
  await page.getByRole("button", { name: "更多项目操作：Lifecycle Project", exact: true }).click();
  await page.getByRole("button", { name: "删除项目", exact: true }).click();
  await page.getByRole("dialog", { name: "删除项目", exact: true }).getByRole("button", { name: "永久删除" }).click();
  await expect.poll(() => db.contentProject.findUnique({ where: { id: project.id } })).toBeNull();
  expect(await db.sourceItem.findUnique({ where: { id: source.id } })).not.toBeNull();
  await page.goto("/library");
  await page.getByRole("button", { name: "更多资料操作：Lifecycle Material", exact: true }).click();
  await page.getByRole("button", { name: "删除资料", exact: true }).click();
  await page.getByRole("dialog", { name: "删除资料", exact: true }).getByRole("button", { name: "永久删除" }).click();
  await expect.poll(() => db.sourceItem.findUnique({ where: { id: source.id } })).toBeNull();
});

test("folder-first library opens a second-level page and creates inside the selected personal folder", async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  await page.context().addCookies(ownerCookies);
  await page.setViewportSize({ width: 1680, height: 945 });
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: "打开文件夹：未分组", exact: true })).toBeVisible();
  await expect(page.locator(".project-card-menu-trigger")).toHaveCount(0);
  await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
  await page.getByRole("dialog", { name: "新建文件夹" }).getByLabel("名称").fill("分层验收");
  await page.getByRole("dialog", { name: "新建文件夹" }).getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/projects\?folder=/);
  const folderId = new URL(page.url()).searchParams.get("folder")!;
  await expect(page.getByRole("navigation", { name: "面包屑" })).toContainText("分层验收");
  await page.getByRole("button", { name: "新建创作", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建创作", exact: true });
  await dialog.getByLabel("项目名称").fill("文件夹中的第一篇创作");
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`projects\\?folder=${folderId}`));
  await expect(page.getByRole("link", { name: "打开项目：文件夹中的第一篇创作", exact: true })).toBeVisible();
  const project = await db.contentProject.findFirstOrThrow({ where: { workspaceId, title: "文件夹中的第一篇创作" } });
  const preference = await db.userProjectPreference.findUniqueOrThrow({ where: { workspaceId_userId_projectId: { workspaceId, userId: ownerId, projectId: project.id } } });
  expect(preference.folderId).toBe(folderId);
  await page.reload();
  await expect(page.getByRole("link", { name: "打开项目：文件夹中的第一篇创作", exact: true })).toBeVisible();
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, title: "文件夹引用资料", sourceType: "TEXT", status: "READY", rawText: "A source" } });
  await db.projectSource.create({ data: { projectId: project.id, sourceItemId: source.id } });
  await page.getByRole("navigation", { name: "文件夹内容" }).getByRole("link", { name: "引用资料", exact: true }).click();
  await expect(page.getByRole("link", { name: /文件夹引用资料/ })).toBeVisible();
  await page.getByRole("navigation", { name: "文件夹内容" }).getByRole("link", { name: "创作页", exact: true }).click();
  await page.screenshot({ path: info.outputPath("folder-detail.png") });
  await page.getByRole("link", { name: "打开项目：文件夹中的第一篇创作", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`dashboard\\?project=${project.id}`));
  await page.goto(`/projects?folder=${folderId}`);
  await page.getByRole("button", { name: "更多项目操作：文件夹中的第一篇创作", exact: true }).click();
  await page.getByRole("dialog", { name: "项目操作：文件夹中的第一篇创作", exact: true }).getByRole("button", { name: "未分组", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开项目：文件夹中的第一篇创作", exact: true })).toHaveCount(0);
  await page.goto("/projects?folder=ungrouped");
  await expect(page.getByRole("link", { name: "打开项目：文件夹中的第一篇创作", exact: true })).toBeVisible();
  const viewer = await browser.newContext({ baseURL: "http://localhost:3001" });
  await viewer.addCookies(viewerCookies);
  const ownView = await (await viewer.request.get("/api/sidebar")).json() as { folders: Array<{ folderId: string }> };
  expect(ownView.folders.some((folder) => folder.folderId === folderId)).toBe(false);
  expect((await page.request.post("/api/projects", { data: { title: "Invalid Folder Creation", folderId: "missing-folder" } })).status()).toBe(404);
  expect(await db.contentProject.count({ where: { workspaceId, title: "Invalid Folder Creation" } })).toBe(0);
  await viewer.close();
  await page.goto("/projects");
  await page.screenshot({ path: info.outputPath("folder-home.png") });
  for (const width of [390, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 945 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
