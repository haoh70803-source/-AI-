import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const suffix = randomUUID();
const email = `sidebar-foundation-${suffix}@example.test`;
const password = "safe-sidebar-foundation-password";
let userId = "";
let workspaceId = "";
let projectId = "";
let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];

test.beforeAll(async () => {
  const registration = await auth.api.signUpEmail({ body: { name: "Sidebar QA", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "Sidebar 状态机项目" } })).id;
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

async function sidebarState(page: import("@playwright/test").Page) {
  return page.locator(".xsj-app-sidebar").getAttribute("data-sidebar-state");
}

test("collapsed alignment, hover overlay, pin suppression and interaction locks", async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().addCookies([
    ...cookies,
    { name: "xsj_sidebar_pinned", value: "0", domain: "localhost", path: "/", httpOnly: false, sameSite: "Lax" },
  ]);
  await page.setViewportSize({ width: 1680, height: 945 });
  await page.goto("/dashboard");

  const sidebar = page.locator(".xsj-app-sidebar");
  const main = page.locator("main.app-main");
  await expect(page.locator('.app-shell[data-shell="v4"]')).toHaveAttribute("data-sidebar-initial", "collapsed");
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "COLLAPSED");
  await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(68);

  const centers = await page.evaluate(() => {
    const elements = [
      document.querySelector(".app-sidebar-brand .app-sidebar-icon-slot"),
      ...document.querySelectorAll(".app-sidebar-navigation .app-sidebar-icon-slot"),
      document.querySelector(".app-sidebar-account .app-sidebar-icon-slot"),
    ].filter((element): element is Element => Boolean(element));
    return elements.map((element) => {
      const box = element.getBoundingClientRect();
      return box.left + box.width / 2;
    });
  });
  expect(centers).toHaveLength(7);
  for (const center of centers) expect(Math.abs(center - 34)).toBeLessThanOrEqual(1);

  const collapsedMainLeft = Math.round((await main.boundingBox())!.x);
  await sidebar.hover();
  await expect.poll(() => sidebarState(page)).toBe("TEMP_EXPANDED");
  await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(236);
  expect(Math.round((await main.boundingBox())!.x)).toBe(collapsedMainLeft);

  await main.hover();
  await expect.poll(() => sidebarState(page)).toBe("COLLAPSED");

  await sidebar.hover();
  await expect.poll(() => sidebarState(page)).toBe("TEMP_EXPANDED");
  await page.getByRole("button", { name: "固定展开侧栏" }).click();
  await expect.poll(() => sidebarState(page)).toBe("PINNED_EXPANDED");
  await expect.poll(async () => Math.round((await main.boundingBox())!.x)).toBe(236);

  await page.getByRole("button", { name: "取消固定侧栏" }).click();
  await expect.poll(() => sidebarState(page)).toBe("COLLAPSED");
  await page.waitForTimeout(250);
  expect(await sidebarState(page)).toBe("COLLAPSED");
  await main.hover();
  await sidebar.hover();
  await expect.poll(() => sidebarState(page)).toBe("TEMP_EXPANDED");

  await page.locator('summary[aria-label="账户菜单"]').click();
  await page.mouse.move(420, 500);
  await expect.poll(() => sidebarState(page)).toBe("TEMP_EXPANDED");
  await expect(page.getByRole("link", { name: "个人设置", exact: true })).toBeVisible();
  await page.locator('summary[aria-label="账户菜单"]').click();
  await main.hover();
  await expect.poll(() => sidebarState(page)).toBe("COLLAPSED");

  await sidebar.hover();
  await page.getByRole("button", { name: "搜索工作和资料" }).click();
  await expect(page.getByRole("dialog", { name: "全局搜索" })).toBeVisible();
  await page.mouse.move(700, 400);
  await expect.poll(() => sidebarState(page)).toBe("TEMP_EXPANDED");
  await page.getByRole("button", { name: "关闭搜索", exact: true }).click();
  await main.hover();
  await expect.poll(() => sidebarState(page)).toBe("COLLAPSED");

  await sidebar.hover();
  await page.getByRole("button", { name: "固定展开侧栏" }).click();
  await page.reload();
  await expect(page.locator('.app-shell[data-shell="v4"]')).toHaveAttribute("data-sidebar-initial", "pinned");
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "PINNED_EXPANDED");
  await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(236);
});

test("global navigation active state includes the project workspace", async ({ page }) => {
  await page.context().addCookies(cookies);
  const routes = [
    { href: "/dashboard", active: "开始工作" },
    { href: "/projects", active: "项目" },
    { href: "/library", active: "资料" },
    { href: "/library/methods", active: "Skill" },
    { href: "/discovery", active: "研究" },
    { href: `/dashboard?project=${projectId}`, active: "项目" },
  ];

  for (const route of routes) {
    await page.goto(route.href);
    const navigation = page.getByRole("navigation", { name: "主导航" });
    await expect(navigation.getByRole("link", { name: route.active, exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
