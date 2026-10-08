import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { createContentIngestWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `library-${runId}@example.test`;
const otherEmail = `library-other-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let worker: ReturnType<typeof createContentIngestWorker>;

test.beforeAll(async () => {
  fixture = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end('<!doctype html><html><head><title>E2E Fixture Article</title><meta name="author" content="Fixture Writer"><meta name="description" content="Local deterministic fixture"></head><body><article><h1>E2E Fixture Article</h1><p>This article is served by the local Playwright fixture and extracted as normalized plain text.</p><p>It never calls the public internet.</p></article></body></html>');
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
  process.env.INGEST_TEST_FIXTURE_ORIGIN = fixtureOrigin;
  worker = createContentIngestWorker();
  await worker.waitUntilReady();
});

test.afterAll(async () => {
  await worker.close();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const users = await db.user.findMany({ where: { email: { in: [email, otherEmail] } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) await db.workspace.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
  delete process.env.INGEST_TEST_FIXTURE_ORIGIN;
});

test("manual and URL ingest → tags → collection → search with workspace isolation", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Library E2E User");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Library E2E Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "资料", exact: true }).click();
  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByLabel("标题（可选）").fill("阶段二真实手工素材");
  await page.getByLabel("正文").fill("这是一段由用户真实输入并通过 BullMQ Worker 入库的正文，不是模拟业务数据。");
  await page.getByLabel("备注（可选）").fill("E2E 手工烟雾验证");
  await page.getByRole("button", { name: "提交收录" }).click();
  await expect(page.getByRole("dialog").getByText("处理中", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看资料" }).click();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/这是一段由用户真实输入/)).toBeVisible();
  const manualSourceId = new URL(page.url()).pathname.split("/").pop();
  if (!manualSourceId) throw new Error("Missing manual source id");

  await page.getByRole("tab", { name: "信息" }).click();
  await page.getByLabel("新标签").fill("阶段二");
  await page.getByRole("button", { name: "添加标签" }).click();
  await expect(page.getByText("#阶段二")).toBeVisible();
  await page.getByText("素材集", { exact: true }).click();
  await page.getByLabel("新素材集").fill("重点素材");
  await page.getByRole("button", { name: "新建并加入" }).click();
  await expect(page.getByRole("button", { name: "移出素材集 重点素材" })).toBeVisible();

  const otherUser = await db.user.create({ data: { name: "Other Workspace User", email: otherEmail } });
  const otherWorkspace = await db.workspace.create({ data: { name: "Other Workspace", slug: `other-${runId}`, members: { create: { userId: otherUser.id, role: "OWNER" } } } });
  const otherSource = await db.sourceItem.create({ data: { workspaceId: otherWorkspace.id, createdById: otherUser.id, sourceType: "TEXT", sourcePlatform: "GENERIC", rawText: "private", status: "READY" } });
  const [otherJob, otherTag, otherCollection] = await Promise.all([
    db.ingestJob.create({ data: { workspaceId: otherWorkspace.id, sourceItemId: otherSource.id, requestedById: otherUser.id, jobType: "EXTRACT_TEXT", provider: "MANUAL", providerMode: "REAL", status: "SUCCEEDED" } }),
    db.contentTag.create({ data: { workspaceId: otherWorkspace.id, name: "Other Tag", slug: `other-${runId}` } }),
    db.collection.create({ data: { workspaceId: otherWorkspace.id, createdById: otherUser.id, name: `Other Collection ${runId}` } }),
  ]);
  expect((await page.request.get(`/api/source-items/${otherSource.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/ingest-jobs/${otherJob.id}`)).status()).toBe(404);
  expect((await page.request.post(`/api/source-items/${otherSource.id}/tags`, { data: { tagId: otherTag.id } })).status()).toBe(404);
  expect((await page.request.post(`/api/source-items/${manualSourceId}/collections`, { data: { collectionId: otherCollection.id } })).status()).toBe(404);

  await page.getByRole("link", { name: "返回资料" }).click();
  await page.getByLabel("搜索素材").fill("阶段二真实手工素材");
  await page.getByRole("button", { name: "筛选" }).click();
  await expect(page.getByRole("link", { name: "阶段二真实手工素材" })).toBeVisible();

  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByRole("button", { name: "网页链接" }).click();
  await page.getByLabel("网页链接").fill(`${fixtureOrigin}/article`);
  await page.getByRole("button", { name: "提交收录" }).click();
  await expect(page.getByRole("dialog").getByText("处理中", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看资料" }).click();
  await expect(page.getByRole("heading", { name: "E2E Fixture Article" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/served by the local Playwright fixture/)).toBeVisible();
});
