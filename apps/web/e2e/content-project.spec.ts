import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `project-e2e-${runId}@example.test`;
const otherEmail = `project-e2e-other-${runId}@example.test`;
const password = "safe-e2e-password";

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: [email, otherEmail] } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

test("library source → project → my supplement with isolation", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Project E2E User");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Project E2E Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "阶段四素材", rawText: "这是一条用于真实项目闭环的素材正文。" } });

  const projectResponse = await page.request.post("/api/projects", { data: { title: "阶段四真实创作项目", sourceItemId: source.id } });
  expect(projectResponse.status()).toBe(201);
  const projectId = (await projectResponse.json() as { id: string }).id;
  await page.goto(`/projects/${projectId}/studio`);
  await expect(page.getByRole("button", { name: /阶段四素材/ })).toBeVisible();

  const evidence = await page.request.post(`/api/projects/${projectId}/evidence`, { data: { type: "VIEWPOINT", sourceItemId: source.id, claim: "素材支持阶段四核心观点", excerpt: "真实项目闭环的素材正文" } });
  expect(evidence.status()).toBe(201);
  await page.reload();
  await expect(page.getByRole("heading", { name: "1. 参考素材" })).toBeVisible();

  await page.getByLabel("我的核心观点").fill("先组织证据，再写可靠母稿");
  await page.getByRole("button", { name: "保存我的补充" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await expect(page.getByRole("heading", { name: "3. 我的口播稿" })).toBeVisible();
  const otherUser = await db.user.create({ data: { name: "Other Project User", email: otherEmail } });
  const otherWorkspace = await db.workspace.create({ data: { name: "Other Project Workspace", slug: `project-other-${runId}`, members: { create: { userId: otherUser.id, role: "OWNER" } } } });
  const otherProject = await db.contentProject.create({ data: { workspaceId: otherWorkspace.id, createdById: otherUser.id, title: "Other private project" } });
  expect((await page.request.get(`/api/projects/${otherProject.id}`)).status()).toBe(404);
  expect((await page.request.post(`/api/projects/${otherProject.id}/sources`, { data: { sourceItemId: source.id, role: "REFERENCE" } })).status()).toBe(404);
  expect((await db.contentProject.findUniqueOrThrow({ where: { id: projectId } })).status).toBe("DRAFT");
});
