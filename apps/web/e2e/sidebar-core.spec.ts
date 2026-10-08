import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

let ownerId = "";
let viewerId = "";
let workspaceId = "";
let projectId = "";
let ownerCookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];
let viewerCookies: typeof ownerCookies = [];

function cookies(response: Response) {
  return response.headers.getSetCookie().map((value) => {
    const pair = value.split(";")[0]!;
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test.beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== "LOCAL_TEST") throw new Error("LOCAL_TEST required");
  const suffix = randomUUID();
  const owner = await auth.api.signUpEmail({ body: { name: "Sidebar Core Owner", email: `sidebar-core-owner-${suffix}@example.test`, password: "sidebar-core-password" }, asResponse: true });
  const viewer = await auth.api.signUpEmail({ body: { name: "Sidebar Core Viewer", email: `sidebar-core-viewer-${suffix}@example.test`, password: "sidebar-core-password" }, asResponse: true });
  expect(owner.ok && viewer.ok).toBe(true);
  ownerId = ((await owner.clone().json()) as { user: { id: string } }).user.id;
  viewerId = ((await viewer.clone().json()) as { user: { id: string } }).user.id;
  ownerCookies = cookies(owner); viewerCookies = cookies(viewer);
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId: ownerId })).id;
  await db.workspaceMember.create({ data: { workspaceId, userId: viewerId, role: "VIEWER" } });
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Sidebar Core Project" } })).id;
});

test.afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (ownerId || viewerId) await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
  await db.$disconnect();
});

test("owner can create a folder, organize a project and create a lightweight project", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(ownerCookies);
  await page.goto("/dashboard");
  if (await page.getByRole("button", { name: "展开侧栏" }).isVisible()) await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("button", { name: "创建项目文件夹" }).click();
  const folderDialog = page.getByRole("dialog", { name: "新建文件夹" });
  await folderDialog.getByLabel("名称").fill("核心文件夹");
  await folderDialog.getByRole("button", { name: "保存" }).click();
  const folder = page.locator(".app-sidebar-folder").filter({ hasText: "核心文件夹" });
  await expect(folder).toBeVisible();
  await page.getByRole("region", { name: "未分组" }).getByRole("button", { name: "项目菜单：Sidebar Core Project" }).click();
  await page.getByRole("button", { name: "核心文件夹", exact: true }).click();
  await expect(folder).toContainText("Sidebar Core Project");
  await folder.getByRole("button", { name: "项目菜单：Sidebar Core Project" }).click();
  await page.getByRole("button", { name: "置顶", exact: true }).click();
  await expect(page.getByRole("region", { name: "置顶" })).toContainText("Sidebar Core Project");
  await folder.getByRole("button", { name: "项目菜单：Sidebar Core Project" }).click();
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page.getByRole("dialog", { name: "重命名项目" }).getByLabel("名称").fill("Sidebar Core Renamed");
  await page.getByRole("dialog", { name: "重命名项目" }).getByRole("button", { name: "保存" }).click();
  await expect(folder).toContainText("Sidebar Core Renamed");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await page.getByRole("dialog", { name: "新建项目" }).getByLabel("项目名称").fill("Sidebar Basic Draft");
  const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/sidebar/projects") && response.request().method() === "POST");
  await page.getByRole("dialog", { name: "新建项目" }).getByRole("button", { name: "创建并进入" }).click();
  expect((await createdResponse).status()).toBe(201);
  await expect(page).toHaveURL(/dashboard\?project=/, { timeout: 30_000 });
  expect(await db.contentProject.findFirstOrThrow({ where: { workspaceId, title: "Sidebar Basic Draft" } })).toMatchObject({ title: "Sidebar Basic Draft", goal: null, audience: null });
  await expect.poll(() => db.userProjectPreference.findFirst({ where: { workspaceId, userId: ownerId, projectId: projectId }, select: { folderId: true } })).not.toBeNull();
});

test("viewer can keep private organization without creating or renaming projects", async ({ page }) => {
  test.setTimeout(60_000);
  await page.context().addCookies(viewerCookies);
  await page.goto("/dashboard");
  if (await page.getByRole("button", { name: "展开侧栏" }).isVisible()) await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(page.getByRole("button", { name: "创建项目", exact: true })).toHaveCount(0);
  const title = (await db.contentProject.findUniqueOrThrow({ where: { id: projectId } })).title;
  await page.getByRole("button", { name: `项目菜单：${title}` }).first().click();
  await expect(page.getByRole("button", { name: "重命名", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "置顶", exact: true }).click();
  await expect.poll(() => db.userProjectPreference.findFirst({ where: { workspaceId, userId: viewerId, projectId }, select: { pinnedAt: true } })).toMatchObject({ pinnedAt: expect.any(Date) });
  await page.reload();
  await expect(page.getByRole("region", { name: "置顶" })).toContainText(title);
  expect((await db.userProjectPreference.findFirst({ where: { workspaceId, userId: ownerId, projectId } }))?.pinnedAt).not.toBeNull();
  expect((await db.userProjectPreference.findFirst({ where: { workspaceId, userId: viewerId, projectId } }))?.pinnedAt).not.toBeNull();
  expect((await page.request.post("/api/sidebar/projects", { data: { title: "Denied" } })).status()).toBe(403);
});
