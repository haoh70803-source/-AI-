import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { minioStorageFromEnv } from "@content-center/providers";
import { createContentIngestWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `discovery-e2e-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let worker: ReturnType<typeof createContentIngestWorker>;
const calls: Record<string, number> = {};

function workIdForKeyword(keyword: string) {
  if (keyword.includes("选题")) return "idea-e2e";
  if (keyword.includes("项目")) return "project-e2e";
  return "library-e2e";
}

async function requestBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1); const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test.beforeAll(async () => {
  fixture = createServer(async (request, response) => {
    const path = request.url ?? "";
    calls[path] = (calls[path] ?? 0) + 1;
    if (path === "/fixture.mp4") {
      const body = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
      response.writeHead(200, { "content-type": "video/mp4", "content-length": body.length });
      response.end(body);
      return;
    }
    const body = await requestBody(request);
    if (path === "/story/api/parseWork/parse") {
      expect(request.headers["x-api-key"]).toBe("ak_discovery_e2e");
      const sourceUrl = String(body.url);
      const externalId = sourceUrl.split("/").filter(Boolean).at(-1) ?? "fixture-work";
      response.writeHead(200, { "content-type": "application/json", "x-request-id": `parse-${externalId}` });
      response.end(JSON.stringify({ code: 2000, data: { awemeType: "video", platform: "dy", awemeId: externalId, title: `已收录 ${externalId}`, description: "Content Discovery E2E fixture", videoUrl: `${fixtureOrigin}/fixture.mp4` } }));
      return;
    }
    expect(request.headers.redfox_api_key).toBe("ak_discovery_e2e");
    let data: unknown;
    if (path.endsWith("/searchArticle")) {
      const keyword = String(body.keyword ?? "");
      const externalId = workIdForKeyword(keyword);
      data = path.includes("xhsUser") ? { total: 0, hasMore: false, list: [] } : {
        total: 1,
        hasMore: false,
        list: [{ awemeId: externalId, awemeType: "video", desc: `发现内容 ${externalId}`, author: { uid: "author-e2e", nickname: "内容创作者" }, statistics: { diggCount: 128 }, shareUrl: `https://www.douyin.com/video/${externalId}` }],
      };
    } else if (path.endsWith("/searchUser")) {
      data = path.includes("xhsUser") ? { list: [] } : { list: [{ accountId: "benchmark-e2e", nickname: "对标创作者", signature: "只做可验证的内容", fansCount: 2000, originalUrl: "https://www.douyin.com/user/benchmark-e2e" }] };
    } else if (path.endsWith("/queryWorkList")) {
      data = { total: 2, hasMore: false, list: [
        { awemeId: "benchmark-work-e2e", awemeType: "video", desc: "对标账号作品", shareUrl: "https://www.douyin.com/video/benchmark-work-e2e" },
        { awemeId: "benchmark-uncollected-e2e", awemeType: "video", desc: "未收录的对标作品", shareUrl: "https://www.douyin.com/video/benchmark-uncollected-e2e" },
      ] };
    } else if (path.endsWith("/queryUser") || path.endsWith("/queryAccountDetail")) {
      data = { accountId: "benchmark-e2e", nickname: "对标创作者", signature: "只做可验证的内容" };
    } else if (path.endsWith("/queryWork") || path.endsWith("/queryWorkDetail")) {
      data = { awemeId: "detail-e2e", awemeType: "video", desc: "单作品详情", shareUrl: "https://www.douyin.com/video/detail-e2e" };
    } else {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", "x-request-id": `discovery-${calls[path]}` });
    response.end(JSON.stringify({ code: 2000, data }));
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Content Discovery fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
  process.env.INGEST_TEST_FIXTURE_ORIGIN = fixtureOrigin;
  worker = createContentIngestWorker();
  await worker.waitUntilReady();
});

test.afterAll(async () => {
  await worker.close();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const workspaces = await db.workspace.findMany({ where: { members: { some: { userId: user.id } } }, select: { id: true } });
    const workspaceIds = workspaces.map((item) => item.id);
    const assets = await db.sourceAsset.findMany({ where: { workspaceId: { in: workspaceIds }, storageKey: { not: null } }, select: { storageKey: true } });
    const storage = minioStorageFromEnv();
    for (const asset of assets) if (asset.storageKey) await storage.delete(asset.storageKey);
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
  delete process.env.INGEST_TEST_FIXTURE_ORIGIN;
});

test("discovery search → idea/library/project/benchmark stays explicit and isolated", async ({ page }) => {
  test.setTimeout(120_000);
  const registration = await auth.api.signUpEmail({ body: { name: "Discovery E2E Owner", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  const registered = await registration.clone().json() as { user: { id: string } };
  await ensurePersonalWorkspaceForUser(db, { userId: registered.user.id });
  await page.context().addCookies(sessionCookies(registration));
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  await page.goto("/settings/integrations");
  await page.getByLabel("RedFox Base URL").fill(fixtureOrigin);
  await page.getByLabel("RedFox API Key").fill("ak_discovery_e2e");
  await page.getByLabel("RedFox 配置").getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByLabel("RedFox 配置").getByText("已配置", { exact: true })).toBeVisible();

  await page.goto("/discovery");
  await expect(page.getByRole("heading", { name: "研究", exact: true })).toBeVisible();
  expect(await db.apiUsage.count({ where: { workspaceId } })).toBe(0);
  expect(calls["/story/api/dyData/searchArticle"]).toBeUndefined();
  await page.locator("summary").filter({ hasText: "搜索范围" }).click();
  await page.getByRole("button", { name: "抖音", exact: true }).click();

  await page.getByLabel("搜索内容").fill("选题测试");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const ideaCard = page.getByTestId("content-card-DOUYIN-idea-e2e");
  await expect(ideaCard).toContainText("发现内容 idea-e2e");
  for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) { await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }
  await page.setViewportSize({ width: 375, height: 812 }); await ideaCard.getByRole("button", { name: "加入选题" }).click();
  const mobileDialog = page.getByRole("dialog"); await expect(mobileDialog).toBeVisible(); expect(await mobileDialog.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight; })).toBe(true); await mobileDialog.getByRole("button", { name: "关闭" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(calls["/story/api/dyData/searchArticle"]).toBe(1);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(ideaCard).toBeVisible();
  expect(calls["/story/api/dyData/searchArticle"]).toBe(1);
  expect(await db.sourceItem.count({ where: { workspaceId, externalId: "idea-e2e" } })).toBe(0);
  await ideaCard.getByRole("button", { name: "加入选题" }).click();
  await page.getByLabel("选题标题").fill("为什么企业用了 AI 反而更忙？");
  await page.getByRole("dialog").getByRole("button", { name: "确认" }).click();
  const ideaNotice = page.getByRole("status").filter({ hasText: "已加入选题" });
  await expect(ideaNotice.getByRole("link", { name: "查看选题" })).toBeVisible();
  const idea = await expect.poll(() => db.contentIdea.findFirst({ where: { workspaceId, title: "为什么企业用了 AI 反而更忙？" }, include: { references: true } })).not.toBeNull();
  void idea;
  const storedIdea = await db.contentIdea.findFirstOrThrow({ where: { workspaceId, title: "为什么企业用了 AI 反而更忙？" }, include: { references: true } });
  expect(storedIdea.references[0]).toMatchObject({ externalId: "idea-e2e", sourceItemId: null });
  expect(await db.ingestJob.count({ where: { workspaceId } })).toBe(0);
  await ideaNotice.getByRole("link", { name: "查看选题" }).click();
  await expect(page).toHaveURL(new RegExp(`/discovery/ideas/${storedIdea.id}$`));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "开始创作" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/studio$/);
  await expect.poll(async () => (await db.sourceItem.findFirst({ where: { workspaceId, externalId: "idea-e2e" } }))?.status).toBe("READY");
  await expect(db.contentIdea.findUniqueOrThrow({ where: { id: storedIdea.id } })).resolves.toMatchObject({ status: "IN_PROGRESS" });

  await page.goto("/discovery");
  await page.getByRole("button", { name: "抖音", exact: true }).click();
  await page.getByLabel("搜索内容").fill("素材收录");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const libraryCard = page.getByTestId("content-card-DOUYIN-library-e2e");
  await libraryCard.getByRole("button", { name: "收录资料" }).click();
  const collectNotice = page.getByRole("status").filter({ hasText: "资料已收录" });
  await expect(collectNotice.getByRole("link", { name: "查看资料" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await collectNotice.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= window.innerWidth; })).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(libraryCard.getByRole("link", { name: "查看资料" })).toBeVisible();
  await libraryCard.getByRole("link", { name: "查看资料" }).click();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  const librarySource = await db.sourceItem.findFirstOrThrow({ where: { workspaceId, externalId: "library-e2e" }, include: { assets: true } });
  expect(librarySource.assets).toHaveLength(1);
  expect(librarySource.assets[0]).toMatchObject({ status: "STORED", sourceProvider: "REDFOX" });

  await page.goto("/discovery");
  await page.getByRole("button", { name: "抖音", exact: true }).click();
  await page.getByLabel("搜索内容").fill("直接项目");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByTestId("content-card-DOUYIN-project-e2e").getByRole("button", { name: "开始创作" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/studio$/);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;
  const projectSource = await db.projectSource.findFirstOrThrow({ where: { projectId }, include: { sourceItem: true } });
  expect(projectSource).toMatchObject({ role: "REFERENCE", sourceItem: { externalId: "project-e2e", workspaceId } });

  await page.goto("/discovery");
  await page.getByRole("button", { name: "添加对标账号" }).click();
  const benchmarkDialog = page.getByRole("dialog");
  await benchmarkDialog.getByPlaceholder("输入账号名称或主页链接").fill("对标创作者");
  await benchmarkDialog.getByRole("button", { name: "搜索" }).click();
  await benchmarkDialog.getByRole("button", { name: "添加" }).click();
  await expect(page.getByRole("link", { name: /\u5bf9\u6807\u521b\u4f5c\u8005/ })).toBeVisible();
  await page.getByRole("link", { name: /\u5bf9\u6807\u521b\u4f5c\u8005/ }).click();
  await page.getByRole("button", { name: "加载作品" }).click();
  await expect(page.getByRole("heading", { name: "对标账号作品" })).toBeVisible();
  expect(await db.sourceItem.count({ where: { workspaceId, externalId: { in: ["benchmark-work-e2e", "benchmark-uncollected-e2e"] } } })).toBe(0);
  const benchmarkWork = page.getByRole("heading", { name: "对标账号作品" }).locator("..");
  await benchmarkWork.getByRole("button", { name: "收录资料" }).click();
  await expect.poll(() => db.sourceItem.count({ where: { workspaceId, externalId: "benchmark-work-e2e" } })).toBe(1);
  expect(await db.sourceItem.count({ where: { workspaceId, externalId: "benchmark-uncollected-e2e" } })).toBe(0);

  const otherUser = await db.user.create({ data: { name: "Other Discovery User", email: `other-${email}` } });
  const otherWorkspace = await db.workspace.create({ data: { name: "Other Discovery Workspace", slug: `other-discovery-${runId}`, members: { create: { userId: otherUser.id, role: "OWNER" } } } });
  const otherIdea = await db.contentIdea.create({ data: { workspaceId: otherWorkspace.id, createdById: otherUser.id, title: "Other private idea" } });
  expect((await page.request.get(`/api/discovery/ideas/${otherIdea.id}`)).status()).toBe(404);
  await db.workspace.delete({ where: { id: otherWorkspace.id } });
  await db.user.delete({ where: { id: otherUser.id } });

  expect(calls["/story/api/dyData/queryWorkList"]).toBe(1);
  expect(calls["/story/api/parseWork/parse"]).toBeGreaterThanOrEqual(4);
  expect(await db.apiUsage.count({ where: { workspaceId, provider: "REDFOX", operation: { startsWith: "DISCOVERY_" } } })).toBeGreaterThanOrEqual(4);
});
