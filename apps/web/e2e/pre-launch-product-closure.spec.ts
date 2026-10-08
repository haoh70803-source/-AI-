import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { auth } from "@/lib/auth";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";

const runId = randomUUID();
const email = `closure-e2e-${runId}@example.test`;
const password = "safe-closure-password";
let userId = "";
let workspaceId = "";
let projectId = "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeAll(async () => {
  const registration = await auth.api.signUpEmail({ body: { email, name: "Closure E2E", password } });
  userId = registration.user.id;
  const workspace = await ensurePersonalWorkspaceForUser(db, { userId });
  workspaceId = workspace.id;
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Closure reference", rawText: "参考素材正文" } });
  await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: userId, version: 1, status: "COMPLETED", summary: "参考素材整理", tags: [], keywords: [], keyPoints: [], transcriptUpdatedAtAtAnalysis: new Date(), understanding: { whatItSays: { summary: "待核实内容", keyPoints: [] }, reusable: [], doNotCopy: [], uncertain: [{ content: "待核实实体", reason: "原始素材没有足够依据。" }] } } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "Closure project", sources: { create: { sourceItemId: source.id } }, creativeBrief: { create: { workspaceId, createdById: userId, topic: "Closure", angle: "Evidence", audience: "Team", coreMessage: "我的补充", keyPoints: [], structure: [], tone: "直接", risks: [] } }, motherContent: { create: { workspaceId, createdById: userId, title: "待确认口播稿", body: "这是一份待确认的口播稿。", outline: [] } } } });
  projectId = project.id;
});

test.afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("requires mother confirmation before platform generation", async ({ page }) => {
  await login(page);
  await page.goto("/library");
  await expect(page.getByText("MOCK MODE", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/UNCONFIGURED|CONFIGURED|NEEDS_RECONFIGURATION|DISABLED|ERROR/, { exact: false })).toHaveCount(0);
  await page.goto(`/projects/${projectId}/studio`);
  await expect(page.getByText("MOCK MODE", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/UNCONFIGURED|CONFIGURED|NEEDS_RECONFIGURATION|DISABLED|ERROR/, { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "平台内容与审核" }).click();
  await expect(page.getByRole("heading", { name: "请先确认当前口播稿" })).toBeVisible();
  await expect(page.getByText("确认后才能生成平台版本")).toBeVisible();
});

test("shows warning details, persists acknowledgement and enters platform after confirmation", async ({ page }) => {
  await login(page);
  await page.goto(`/projects/${projectId}/studio`);
  await expect(page.getByRole("button", { name: /有 1 处需要确认/ })).toBeVisible();
  await page.getByRole("button", { name: /有 1 处需要确认/ }).click();
  await expect(page.getByText("风险原因：原始素材没有足够依据。", { exact: true })).toBeVisible();
  await expect(page.getByText("建议处理：核对原始转写或补充可靠来源后再使用。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我已确认" }).click();
  await expect(page.getByRole("status")).toHaveText("已记录这项确认。");
  await page.getByRole("button", { name: "确认这版口播稿，进入平台适配" }).click();
  await expect(page.getByRole("heading", { name: "平台适配" })).toBeVisible();
});
