import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { expect, test, type Page } from "@playwright/test";

const suffix = randomUUID();
const password = "safe-e2e-password";
const emails = [1, 2, 3].map((index) => `publishing-${index}-${suffix}@example.test`);

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

async function register(page: Page, index: number) {
  await page.goto("/register");
  await page.getByLabel("姓名").fill(`Publishing E2E ${index}`);
  await page.getByLabel("邮箱").fill(emails[index - 1]!);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill(`Publishing Workspace ${index}`);
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return db.user.findUniqueOrThrow({ where: { email: emails[index - 1]! }, include: { workspaceMemberships: true } });
}

async function approvedProject(user: Awaited<ReturnType<typeof register>>, title: string, stale = false) {
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const profile = await db.creatorProfile.create({ data: { workspaceId, userId: user.id, displayName: "阶段八创作者", positioning: "可靠内容", targetAudience: "内容团队", tone: "直接", preferredStyle: "自然", forbiddenStyle: "", coreTopics: [], personalViews: [], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, creatorProfileId: profile.id, title, motherContent: { create: { workspaceId, createdById: user.id, title: "GPT Web 母稿", body: "人工从 GPT 网页确认并带回的可靠母稿正文。", outline: ["开场", "方法", "结尾"], origin: "GPT_WEB", version: stale ? 2 : 1, confirmedVersion: stale ? 2 : 1 } } } });
  const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId: project.id } });
  const variant = await db.platformVariant.create({ data: { workspaceId, projectId: project.id, motherContentId: mother.id, platform: "DOUYIN", title: "发布中心闭环", hook: "先看这条人工审核内容", body: "人工从 GPT 网页确认并带回的可靠母稿正文。", summary: "发布中心说明", hashtags: ["内容方法", "人工审核"], mediaPlan: { shots: ["正面口播", "流程卡片"] }, metadata: { duration: "60 秒" }, status: "APPROVED", sourceMotherVersion: 1, createdById: user.id } });
  return { workspaceId, project, mother, variant };
}

test("approved → schedule → calendar → package copy → manual publish → published list", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const user = await register(page, 1);
  const { workspaceId, project } = await approvedProject(user, "阶段八发布闭环项目");
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const scheduledLocal = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T10:00`;

  await page.goto(`/projects/${project.id}/studio`);
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await page.getByRole("button", { name: "加入发布中心" }).click();
  await page.getByLabel("计划发布时间").fill(scheduledLocal);
  await page.getByRole("button", { name: "按此时间排期" }).click();
  await expect(page).toHaveURL(/\/calendar\/tasks\//);
  const taskId = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("口播脚本", { exact: true })).toBeVisible();
  await expect(page.getByText("人工从 GPT 网页确认并带回的可靠母稿正文。", { exact: true })).toBeVisible();

  await page.goto(`/calendar?month=${scheduledLocal.slice(0, 7)}`);
  await expect(page.getByText("阶段八发布闭环项目", { exact: true })).toBeVisible();
  await page.goto(`/calendar/tasks/${taskId}`);
  await page.getByRole("button", { name: "复制完整发布包" }).click();
  await expect(page.getByRole("status")).toHaveText("完整发布包已复制。");
  await page.getByLabel("外部发布链接").fill("https://example.com/published/stage-8");
  await page.getByLabel("发布备注").fill("人工登录平台发布完成");
  const publishedResponse = page.waitForResponse((response) => response.url().endsWith(`/api/publish-tasks/${taskId}/published`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "标记已发布" }).click();
  expect((await publishedResponse).status()).toBe(200);
  await expect.poll(async () => (await db.publishTask.findUnique({ where: { id: taskId } }))?.status).toBe("PUBLISHED");
  await page.goto("/calendar?view=published");
  await expect(page.getByText("阶段八发布闭环项目", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /抖音 已发布 阶段八发布闭环项目/ })).toBeVisible();
  expect(await db.apiUsage.count({ where: { workspaceId } })).toBe(0);
  await expect(db.auditLog.findFirst({ where: { resourceId: taskId, action: "publish_package.copied" } })).resolves.not.toBeNull();
});

test("Mother update makes an approved variant stale and blocks task creation", async ({ page }) => {
  const user = await register(page, 2);
  const { project } = await approvedProject(user, "阶段八过期门禁项目", true);
  await page.goto(`/projects/${project.id}/studio`);
  await page.getByRole("button", { name: "平台内容与审核", exact: true }).click();
  await page.getByRole("button", { name: /^抖音/ }).click();
  await expect(page.getByRole("button", { name: "加入发布中心" })).toBeDisabled();
  await expect(page.getByText("母稿已更新，必须重新生成并审核。", { exact: true })).toBeVisible();
  const response = await page.request.post("/api/publish-tasks", { data: { projectId: project.id, platform: "DOUYIN", scheduledAt: null } });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ error: "VARIANT_STALE" });
});

test("existing task keeps its approved snapshot after the variant changes", async ({ page }) => {
  const user = await register(page, 3);
  const { project, variant } = await approvedProject(user, "阶段八 Snapshot 项目");
  const created = await page.request.post("/api/publish-tasks", { data: { projectId: project.id, platform: "DOUYIN", scheduledAt: null } });
  expect(created.status()).toBe(201);
  const task = await created.json() as { id: string };
  await db.platformVariant.update({ where: { id: variant.id }, data: { body: "这是审核后修改的新内容，不应进入旧任务。", version: { increment: 1 }, status: "DRAFT" } });
  await page.goto(`/calendar/tasks/${task.id}`);
  await expect(page.getByText("当前内容已经发生变化", { exact: true })).toBeVisible();
  await expect(page.getByText("该任务仍使用创建时固定的已审核内容快照，不会随最新平台草稿自动更新。", { exact: true })).toBeVisible();
  await expect(page.getByText("人工从 GPT 网页确认并带回的可靠母稿正文。", { exact: true })).toBeVisible();
  await expect(page.getByText("这是审核后修改的新内容，不应进入旧任务。", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "继续使用当前发布包" })).toBeVisible();
  await expect(page.getByRole("link", { name: "重新审核并创建新任务" })).toHaveAttribute("href", `/projects/${project.id}/studio`);
});
