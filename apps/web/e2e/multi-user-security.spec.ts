import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test, type Page } from "@playwright/test";

const runId = randomUUID();
const password = "safe-security-password";
const emails = {
  admin: `security-admin-${runId}@example.test`,
  a: `security-a-${runId}@example.test`,
  b: `security-b-${runId}@example.test`,
};
const ids: Record<string, string> = {};

async function createAccount(email: string, name: string, admin = false) {
  const registration = await auth.api.signUpEmail({ body: { email, name, password } });
  if (admin) await db.user.update({ where: { id: registration.user.id }, data: { systemRole: "SYSTEM_ADMIN" } });
  const workspace = await ensurePersonalWorkspaceForUser(db, { userId: registration.user.id });
  return { userId: registration.user.id, workspaceId: workspace.id };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeAll(async () => {
  await createAccount(emails.admin, "Security Admin", true);
  const a = await createAccount(emails.a, "Security A");
  const b = await createAccount(emails.b, "Security B");
  const [sourceA, sourceB] = await Promise.all([
    db.sourceItem.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: `A private source ${runId}`, rawText: "A private", status: "READY" } }),
    db.sourceItem.create({ data: { workspaceId: b.workspaceId, createdById: b.userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: `B private source ${runId}`, rawText: "B private", status: "READY" } }),
  ]);
  const [projectA, projectB, collectionB] = await Promise.all([
    db.contentProject.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, title: `A private project ${runId}` } }),
    db.contentProject.create({ data: { workspaceId: b.workspaceId, createdById: b.userId, title: `B private project ${runId}` } }),
    db.collection.create({ data: { workspaceId: b.workspaceId, createdById: b.userId, name: `B private collection ${runId}` } }),
  ]);
  const [motherA, motherB] = await Promise.all([
    db.motherContent.create({ data: { workspaceId: a.workspaceId, projectId: projectA.id, createdById: a.userId, title: "A mother", body: "A body", outline: [] } }),
    db.motherContent.create({ data: { workspaceId: b.workspaceId, projectId: projectB.id, createdById: b.userId, title: "B mother", body: "B body", outline: [] } }),
  ]);
  const [variantA, variantB] = await Promise.all([
    db.platformVariant.create({ data: { workspaceId: a.workspaceId, projectId: projectA.id, motherContentId: motherA.id, createdById: a.userId, platform: "DOUYIN", body: "A variant", hashtags: [], mediaPlan: {}, metadata: {}, sourceMotherVersion: 1 } }),
    db.platformVariant.create({ data: { workspaceId: b.workspaceId, projectId: projectB.id, motherContentId: motherB.id, createdById: b.userId, platform: "DOUYIN", body: "B variant", hashtags: [], mediaPlan: {}, metadata: {}, sourceMotherVersion: 1 } }),
  ]);
  await Promise.all([
    db.reviewRecord.create({ data: { workspaceId: b.workspaceId, projectId: projectB.id, platformVariantId: variantB.id, reviewerId: b.userId, issues: [], result: "APPROVED" } }),
    db.sourceAsset.create({ data: { workspaceId: b.workspaceId, sourceItemId: sourceB.id, sourceProvider: "FIXTURE", assetType: "VIDEO", status: "REMOTE", remoteUrl: "https://example.invalid/private.mp4" } }),
  ]);
  const publishB = await db.publishTask.create({ data: { workspaceId: b.workspaceId, projectId: projectB.id, platformVariantId: variantB.id, createdById: b.userId, platform: "DOUYIN", status: "DRAFT", scheduledAt: new Date(), contentSnapshot: {} } });
  await db.apiUsage.createMany({ data: [
    { workspaceId: a.workspaceId, userId: a.userId, provider: "KIMI", operation: "GENERATE_MOTHER_CONTENT", requestId: `kimi-${runId}`, success: true, inputTokens: 10, outputTokens: 5 },
    { workspaceId: a.workspaceId, userId: a.userId, provider: "REDFOX", operation: "INGEST", requestId: `redfox-${runId}`, success: true },
    { workspaceId: a.workspaceId, userId: a.userId, provider: "DOUBAO_ASR", operation: "TRANSCRIBE", requestId: `asr-${runId}`, success: true, metadata: { durationMs: 60_000, audioDurationSeconds: 60, sourceItemId: sourceA.id } },
  ] });
  ids.userA = a.userId; ids.userB = b.userId; ids.sourceA = sourceA.id; ids.sourceB = sourceB.id; ids.projectB = projectB.id; ids.motherB = motherB.id; ids.variantB = variantB.id; ids.publishB = publishB.id; ids.collectionB = collectionB.id;
  void variantA;
});

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: Object.values(emails) } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

test("User A cannot read, edit, delete, search, or relate User B resources", async ({ page }) => {
  await login(page, emails.a);
  expect((await page.request.get(`/api/source-items/${ids.sourceB}`)).status()).toBe(404);
  expect((await page.request.patch(`/api/source-items/${ids.sourceB}`, { data: { title: "leaked" } })).status()).toBe(404);
  expect((await page.request.delete(`/api/source-items/${ids.sourceB}`)).status()).toBe(404);
  expect((await page.request.get(`/api/projects/${ids.projectB}`)).status()).toBe(404);
  expect((await page.request.patch(`/api/projects/${ids.projectB}`, { data: { title: "leaked" } })).status()).toBe(404);
  expect((await page.request.get(`/api/projects/${ids.projectB}/mother-content`)).status()).toBe(404);
  expect((await page.request.put(`/api/projects/${ids.projectB}/mother-content`, { data: { title: "x", body: "x", outline: [], expectedVersion: 1 } })).status()).toBe(404);
  expect((await page.request.get(`/api/publish-tasks/${ids.publishB}`)).status()).toBe(404);
  expect((await page.request.post(`/api/source-items/${ids.sourceA}/collections`, { data: { collectionId: ids.collectionB } })).status()).toBe(404);

  await page.goto(`/library?search=${encodeURIComponent(`B private source ${runId}`)}`);
  await expect(page.getByText(`B private source ${runId}`)).toHaveCount(0);
  await page.goto(`/projects?search=${encodeURIComponent(`B private project ${runId}`)}`);
  await expect(page.getByText(`B private project ${runId}`)).toHaveCount(0);
  const studioResponse = await page.goto(`/projects/${ids.projectB}/studio`);
  expect(studioResponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("ordinary users receive 403 from every system-admin API", async ({ page }) => {
  await login(page, emails.b);
  expect((await page.request.get("/api/admin/usage")).status()).toBe(403);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  expect((await page.request.get("/api/admin/system")).status()).toBe(403);
  expect((await page.request.put("/api/admin/system/providers/KIMI", { data: {} })).status()).toBe(403);
  expect((await page.request.get("/api/admin/system/providers/DOUBAO_ASR")).status()).toBe(403);
  expect((await page.request.put("/api/admin/system/providers/DOUBAO_ASR", { data: { config: {} } })).status()).toBe(403);
});

test("System Admin sees system pages but ordinary content APIs stay workspace-scoped", async ({ page }) => {
  await login(page, emails.admin);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();
  await page.goto("/admin/system");
  await expect(page.getByRole("heading", { name: "系统服务" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "豆包录音文件识别 2.0", exact: true })).toBeVisible();
  await expect(page.getByText("协议：Recording File 2.0（固定）")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "豆包 API Key" })).toHaveAttribute("type", "password");
  const doubaoView = await page.request.get("/api/admin/system/providers/DOUBAO_ASR");
  expect(doubaoView.status()).toBe(200);
  const doubaoBody = await doubaoView.json();
  expect(JSON.stringify(doubaoBody)).not.toContain("apiKey");
  expect(JSON.stringify(doubaoBody)).not.toContain("accessToken");
  const invalidDoubao = await page.request.put("/api/admin/system/providers/DOUBAO_ASR", {
    data: { config: { authMode: "API_KEY", baseUrl: "not-a-url", resourceId: "", apiKey: "never-saved" } },
  });
  expect(invalidDoubao.status()).toBe(400);
  await page.goto("/admin/usage");
  await expect(page.getByRole("heading", { name: "用量中心" })).toBeVisible();
  const usageA = await page.request.get(`/api/admin/usage?range=7d&userId=${ids.userA}`);
  expect(usageA.status()).toBe(200);
  expect((await usageA.json()).users).toMatchObject([{ id: ids.userA, aiCalls: 1, kimiInputTokens: 10, kimiOutputTokens: 5, redfoxCalls: 1, transcriptionMinutes: 1, doubaoMinutes: 1 }]);
  const usageB = await page.request.get(`/api/admin/usage?range=7d&userId=${ids.userB}`);
  expect(usageB.status()).toBe(200);
  expect((await usageB.json()).users).toMatchObject([{ id: ids.userB, aiCalls: 0, redfoxCalls: 0, transcriptionMinutes: 0 }]);
  expect((await page.request.get(`/api/source-items/${ids.sourceB}`)).status()).toBe(404);
});
