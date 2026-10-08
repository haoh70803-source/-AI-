import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `app-shell-${runId}@example.test`;
const password = "safe-app-shell-password";
let userId = "";
let workspaceId = "";
let projectId = "";
let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];

test.beforeAll(async () => {
  const registration = await auth.api.signUpEmail({ body: { name: "App Shell QA", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "Shell 验收项目" } })).id;
  const primaryDraft = await db.draftBranch.create({ data: { workspaceId, projectId, title: "主稿", createdById: userId, updatedById: userId } });
  await db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: primaryDraft.id } });
  cookies = registration.headers.getSetCookie().map((value) => {
    const pair = value.split(";")[0]!;
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
});

test.afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

async function shellMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".xsj-app-sidebar");
    const topbar = document.querySelector<HTMLElement>(".xsj-app-topbar");
    const main = document.querySelector<HTMLElement>("main.app-main");
    const root = document.querySelector<HTMLElement>('.app-shell[data-shell="v4"]');
    const stylesheetSources = Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).filter((rule) => rule.cssText.includes("--app-shell-contract")).map(() => sheet.href || "inline");
      } catch {
        return [];
      }
    });
    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? null,
      systemBarHeight: topbar?.getBoundingClientRect().height ?? null,
      appMainLeft: main?.getBoundingClientRect().left ?? null,
      documentOverflowX: getComputedStyle(document.documentElement).overflowX,
      appMainOverflowX: mainStyle?.overflowX ?? null,
      rootContract: root ? getComputedStyle(root).getPropertyValue("--app-shell-contract").trim() : "",
      sidebarPosition: sidebarStyle?.position ?? "",
      topbarPosition: topbarStyle?.position ?? "",
      stylesheetSources,
    };
  });
}

test("AppShell contract keeps one shell, project active state and computed style ownership", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.context().addCookies(cookies);
  await page.setViewportSize({ width: 1680, height: 945 });
  await page.goto("/dashboard");

  const mainNav = page.getByRole("navigation", { name: "主导航" }).first();
  await expect(mainNav.getByRole("link", { name: "开始工作", exact: true })).toHaveAttribute("href", "/dashboard");
  for (const label of ["项目", "资料", "Skill", "研究"]) await expect(mainNav.getByRole("link", { name: label, exact: true })).toBeVisible();
  await expect(mainNav.getByRole("link", { name: "首页", exact: true })).toHaveCount(0);
  await expect(mainNav.getByRole("link", { name: "开始工作", exact: true })).toHaveAttribute("aria-current", "page");

  const expanded = await shellMetrics(page);
  expect(expanded.rootContract).toBe("v4");
  expect(expanded.sidebarPosition).toBe("fixed");
  expect(expanded.topbarPosition).toBe("fixed");
  expect(expanded.documentOverflowX).toBe("clip");
  expect(expanded.appMainOverflowX).toBe("clip");
  expect(expanded.stylesheetSources.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("shell-expanded-1680.png"), fullPage: false });

  await page.goto(`/dashboard?project=${projectId}`);
  await expect(mainNav.getByRole("link", { name: "开始工作", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(mainNav.getByRole("link", { name: "项目", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "未分组" }).getByRole("link", { name: "Shell 验收项目", exact: true })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "收起侧栏" }).first().click();
  await expect(page.locator(".xsj-app-sidebar")).toHaveClass(/is-collapsed/);
  await expect.poll(async () => (await page.locator(".xsj-app-sidebar").boundingBox())?.width ?? 0).toBe(68);
  const collapsed = await shellMetrics(page);
  expect(collapsed.sidebarWidth).toBeLessThan(expanded.sidebarWidth!);
  expect(collapsed.appMainLeft).toBeLessThan(expanded.appMainLeft!);
  expect(collapsed.rootContract).toBe("v4");
  expect(collapsed.stylesheetSources.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("shell-collapsed-project-1680.png"), fullPage: false });

  await page.getByRole("button", { name: "展开侧栏" }).first().click();
  await expect(page.locator(".xsj-app-sidebar")).not.toHaveClass(/is-collapsed/);
  await expect.poll(async () => (await page.locator(".xsj-app-sidebar").boundingBox())?.width ?? 0).toBe(236);
  await page.locator('summary[aria-label="账户菜单"]').click();
  await expect(page.getByRole("link", { name: "个人设置", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "系统管理", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("shell-user-account-1680.png"), fullPage: false });

  await db.user.update({ where: { id: userId }, data: { systemRole: "SYSTEM_ADMIN" } });
  await page.reload();
  await page.locator('summary[aria-label="账户菜单"]').click();
  await expect(page.getByRole("link", { name: "系统管理", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("shell-admin-account-1680.png"), fullPage: false });

  for (const width of [1440, 1680, 1920, 2560]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : width === 1680 ? 945 : width === 1920 ? 1080 : 1440 });
    await page.goto("/dashboard");
    await expect(page.locator(".app-shell[data-shell='v4']")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Shell overflows at ${width}px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`shell-${width}.png`), fullPage: false });
  }
});

test("AppShell account menu keeps ordinary and admin visibility separated", async ({ page }, testInfo) => {
  await page.context().addCookies(cookies);
  await page.setViewportSize({ width: 1680, height: 945 });
  await db.user.update({ where: { id: userId }, data: { systemRole: "USER" } });
  await page.goto("/dashboard");
  await page.locator('summary[aria-label="账户菜单"]').click();
  await expect(page.getByRole("link", { name: "个人设置", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "系统管理", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("shell-user-account-isolated-1680.png"), fullPage: false });

  await db.user.update({ where: { id: userId }, data: { systemRole: "SYSTEM_ADMIN" } });
  await page.reload();
  await page.locator('summary[aria-label="账户菜单"]').click();
  await expect(page.getByRole("link", { name: "系统管理", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("shell-admin-account-isolated-1680.png"), fullPage: false });
});
