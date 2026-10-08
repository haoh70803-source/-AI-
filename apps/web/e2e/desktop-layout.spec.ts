import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `desktop-layout-${runId}@example.test`;
const password = "safe-e2e-password";

test.afterAll(async () => {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

test("desktop shell uses available width without page overflow", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Desktop Layout Owner");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Desktop Layout Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const mainNav = page.getByRole("navigation", { name: "主导航" }).first();
  for (const [label, href] of [["创作", "/dashboard"], ["资料", "/library"], ["研究", "/discovery"], ["方法", "/library/methods"]] as const) {
    await expect(mainNav.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  }
  await expect(mainNav.getByRole("link", { name: "项目", exact: true })).toHaveCount(0);
  await mainNav.getByRole("link", { name: "资料", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "资料", exact: true })).toBeVisible();
  await page.goto("/dashboard");

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const sources = await Promise.all(Array.from({ length: 4 }, (_, index) => db.sourceItem.create({
    data: { workspaceId, createdById: user.id, sourceType: "TEXT", sourcePlatform: "GENERIC", title: `桌面素材 ${index + 1}`, rawText: "用于验证桌面布局的素材正文。", status: "READY" },
  })));
  const project = await db.contentProject.create({
    data: {
      workspaceId,
      createdById: user.id,
      title: "桌面创作空间",
      sources: { create: { sourceItemId: sources[0]!.id, role: "REFERENCE" } },
      motherContent: { create: { workspaceId, createdById: user.id, title: "桌面口播稿", body: "这是一份用于验证桌面编辑器尺寸的口播稿。", outline: ["开场", "正文", "结尾"] } },
    },
  });

  const keyRoutes = ["/dashboard", "/library", `/library/${sources[0]!.id}`, `/projects/${project.id}/studio`];
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const [routeIndex, route] of keyRoutes.entries()) {
      await page.goto(route);
      await expect(page.locator("main.app-main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} overflows at ${viewport.width}px`).toBe(true);
      if (viewport.width !== 1600) await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-${["dashboard", "library", "material", "studio"][routeIndex]}.png`), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ["/discovery", "/projects", "/calendar", "/settings", "/settings/integrations", "/settings/members"]) {
    await page.goto(route);
    await expect(page.locator("main.app-main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} overflows at 1440px`).toBe(true);
  }

  await page.goto(`/projects/${project.id}/studio`);
  await page.getByRole("button", { name: "平台内容与审核" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("aside").first()).toHaveCSS("width", "224px");
  await page.getByRole("button", { name: "创作", exact: true }).click();
  const editor = page.getByLabel("口播稿正文");
  await expect(editor).toBeVisible();
  expect((await editor.boundingBox())!.height).toBeGreaterThanOrEqual(520);

  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/dashboard");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
