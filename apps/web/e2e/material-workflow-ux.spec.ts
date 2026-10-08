import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { createSourceExternalMetadata, createSourceMetadataEnvelope } from "@content-center/providers";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `material-ux-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
let refreshCalls = 0;

async function body(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

test.beforeAll(async () => {
  fixture = createServer(async (request, response) => {
    if (request.url !== "/story/api/dyData/queryWork") {
      response.writeHead(404).end();
      return;
    }
    refreshCalls += 1;
    expect(request.headers.redfox_api_key).toBe("ak_material_ux");
    const input = await body(request);
    expect(input).toMatchObject({ workId: "material-ux-work", workUrl: "https://www.douyin.com/video/material-ux-work" });
    response.writeHead(200, { "content-type": "application/json", "x-request-id": `material-refresh-${refreshCalls}` });
    response.end(JSON.stringify({ code: 2000, data: {
      awemeId: "material-ux-work",
      awemeType: "video",
      title: "作品数据刷新后的标题",
      desc: "这是刷新后同步的真实 fixture 说明。",
      author: { uid: "material-author", nickname: "内容作者" },
      statistics: { playCount: 125_000, diggCount: 18_800, collectCount: 960, commentCount: 120, shareCount: 32 },
      shareUrl: "https://www.douyin.com/video/material-ux-work",
      publishTime: 1_777_665_600,
      duration: 18,
    } }));
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Material UX fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

test("dashboard links, metadata refresh and processing polling use real persisted state", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Material UX Owner");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Material UX Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId: user.id, provider: "REDFOX", config: { baseUrl: fixtureOrigin, apiKey: "ak_material_ux" } });
  const metadata = createSourceExternalMetadata({
    platform: "DOUYIN",
    externalId: "material-ux-work",
    originalTitle: "刷新前标题",
    description: "刷新前说明",
    authorId: null,
    authorName: "旧作者",
    authorAvatarUrl: null,
    publishedAt: null,
    originalUrl: "https://www.douyin.com/video/material-ux-work",
    coverUrl: null,
    durationMs: null,
    topics: [],
    metrics: { views: null, likes: null, favorites: null, comments: null, shares: null },
    providerFetchedAt: "2026-09-02T07:00:00.000Z",
    providerCrawlTime: null,
  });
  const source = await db.sourceItem.create({ data: {
    workspaceId,
    createdById: user.id,
    sourceType: "VIDEO",
    sourcePlatform: "DOUYIN",
    sourceProvider: "REDFOX",
    sourceUrl: metadata.originalUrl,
    canonicalUrl: metadata.originalUrl,
    externalId: metadata.externalId,
    title: metadata.originalTitle,
    author: metadata.authorName,
    description: metadata.description,
    metadata: createSourceMetadataEnvelope(metadata),
    status: "READY",
  } });
  const transcriptionJob = await db.ingestJob.create({ data: { workspaceId, sourceItemId: source.id, requestedById: user.id, jobType: "TRANSCRIBE", provider: "LOCAL_FUNASR", providerMode: "REAL", status: "QUEUED", metadata: { progressStage: "QUEUED" } } });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "待审核项目", motherContent: { create: { workspaceId, createdById: user.id, title: "母稿", body: "母稿正文", outline: [] } } }, include: { motherContent: true } });
  await db.platformVariant.create({ data: { workspaceId, projectId: project.id, motherContentId: project.motherContent!.id, platform: "DOUYIN", title: "待审核内容", body: "等待人工审核", hashtags: [], mediaPlan: {}, metadata: {}, status: "IN_REVIEW", sourceMotherVersion: 1, createdById: user.id } });

  await page.reload();
  const materialCard = page.getByRole("link", { name: /素材 1，查看详情/ });
  await expect(materialCard).toBeVisible();
  await materialCard.click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /待审核 1，查看详情/ }).click();
  await expect(page).toHaveURL(/\/projects\?review=pending$/);
  await expect(page.getByText("当前仅显示有平台内容待人工审核的项目。")).toBeVisible();

  let processingRequests = 0;
  page.on("request", (request) => { if (request.url().includes(`/api/source-items/${source.id}/processing`)) processingRequests += 1; });
  await page.goto(`/library/${source.id}`);
  for (const tab of ["信息", "创作", "处理", "整理"]) await page.getByRole("tab", { name: tab }).click();
  expect(refreshCalls).toBe(0);
  await page.getByRole("tab", { name: "处理" }).click();
  await expect(page.getByTestId("source-processing-status")).toContainText("处理中");
  await db.$transaction([
    db.ingestJob.update({ where: { id: transcriptionJob.id }, data: { status: "SUCCEEDED", metadata: { progressStage: "SUCCEEDED" }, startedAt: new Date(), finishedAt: new Date() } }),
    db.transcript.create({ data: { workspaceId, sourceItemId: source.id, provider: "LOCAL_FUNASR", providerMode: "REAL", language: "zh", durationMs: 1_000, fullText: "轮询完成后自动出现的真实持久化转写。", segments: [{ startMs: 0, endMs: 1_000, text: "轮询完成后自动出现的真实持久化转写。" }], metadata: { methodLabel: "本地转写", qualityMode: "BALANCED", processingMs: 1_200 } } }),
  ]);
  await expect(page.getByText("轮询完成后自动出现的真实持久化转写。", { exact: true }).first()).toBeVisible({ timeout: 12_000 });
  expect(processingRequests).toBeGreaterThan(0);
  const requestsAfterCompletion = processingRequests;
  await page.waitForTimeout(3_500);
  expect(processingRequests).toBe(requestsAfterCompletion);

  const beforeRefresh = {
    sources: await db.sourceItem.count({ where: { workspaceId } }),
    assets: await db.sourceAsset.count({ where: { sourceItemId: source.id } }),
    jobs: await db.ingestJob.count({ where: { sourceItemId: source.id } }),
    transcripts: await db.transcript.count({ where: { sourceItemId: source.id } }),
  };
  await page.getByRole("tab", { name: "信息" }).click();
  await page.getByRole("button", { name: "更新作品数据" }).click();
  await expect(page.getByText("作品数据已更新，不会重新下载或转写。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "作品数据刷新后的标题" })).toBeVisible();
  await expect(page.getByTestId("source-external-metadata")).toContainText("12.5万");
  expect(refreshCalls).toBe(1);
  await expect(db.sourceItem.count({ where: { workspaceId } })).resolves.toBe(beforeRefresh.sources);
  await expect(db.sourceAsset.count({ where: { sourceItemId: source.id } })).resolves.toBe(beforeRefresh.assets);
  await expect(db.ingestJob.count({ where: { sourceItemId: source.id } })).resolves.toBe(beforeRefresh.jobs);
  await expect(db.transcript.count({ where: { sourceItemId: source.id } })).resolves.toBe(beforeRefresh.transcripts);

  for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await db.ingestJob.update({ where: { id: transcriptionJob.id }, data: { status: "QUEUED", finishedAt: null, metadata: { progressStage: "QUEUED" } } });
  await page.reload();
  await expect.poll(() => processingRequests).toBeGreaterThan(requestsAfterCompletion);
  await page.goto("/dashboard");
  const requestsAfterUnmount = processingRequests;
  await page.waitForTimeout(3_500);
  expect(processingRequests).toBe(requestsAfterUnmount);
});
