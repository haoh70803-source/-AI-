import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db } from "@content-center/db";
import { minioStorageFromEnv } from "@content-center/providers";
import { createContentIngestWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `redfox-e2e-${runId}@example.test`;
const password = "safe-e2e-password";
const douyinUrl = "https://www.douyin.com/video/redfox-e2e-fixture";
let fixture: Server;
let fixtureOrigin = "";
let worker: ReturnType<typeof createContentIngestWorker>;
let parseCalls = 0;

test.beforeAll(async () => {
  fixture = createServer(async (request, response) => {
    if (request.url === "/story/api/parseWork/parse") {
      parseCalls += 1;
      expect(request.headers["x-api-key"]).toBe("ak_redfox_e2e_fixture");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { url: string };
      expect(body.url).toBe(douyinUrl);
      response.writeHead(200, { "content-type": "application/json", "x-request-id": "e2e-redfox-request" });
      response.end(JSON.stringify({
        code: 200,
        data: {
          awemeType: "video",
          platform: "dy",
          title: "RedFox E2E 真实链路",
          description: "来自本地 HTTP fixture 的确定性 RedFox 响应",
          videoUrl: `${fixtureOrigin}/fixture.mp4`,
        },
      }));
      return;
    }
    if (request.url === "/fixture.mp4") {
      const body = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
      response.writeHead(200, { "content-type": "video/mp4", "content-length": body.length });
      response.end(body);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("RedFox E2E fixture did not bind");
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
    await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
  delete process.env.INGEST_TEST_FIXTURE_ORIGIN;
});

test("OWNER configures RedFox and ingests a Douyin video into private MinIO storage", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/register");
  await page.getByLabel("姓名").fill("RedFox E2E Owner");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("RedFox E2E Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "资料", exact: true }).click();
  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByRole("button", { name: "抖音视频" }).click();
  await page.getByLabel("抖音分享链接或分享文案").fill(`复制打开抖音 ${douyinUrl}`);
  await page.getByRole("button", { name: "提交收录" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("请先在 设置 → AI 与外部服务 配置红狐 API");
  expect(parseCalls).toBe(0);

  await page.goto("/settings/integrations");
  await page.getByLabel("RedFox Base URL").fill(fixtureOrigin);
  await page.getByLabel("RedFox API Key").fill("ak_redfox_e2e_fixture");
  await page.getByLabel("RedFox 配置").getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByText("已配置", { exact: true }).first()).toBeVisible();
  await page.getByLabel("RedFox 配置").getByRole("button", { name: "禁用" }).click();
  await expect(page.getByText("已禁用", { exact: true }).first()).toBeVisible();

  await page.goto("/library");
  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByRole("button", { name: "抖音视频" }).click();
  await page.getByLabel("抖音分享链接或分享文案").fill(douyinUrl);
  await page.getByRole("button", { name: "提交收录" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("红狐 API 已禁用");
  expect(parseCalls).toBe(0);

  await page.goto("/settings/integrations");
  await page.getByLabel("RedFox 配置").getByRole("button", { name: "启用" }).click();
  await expect(page.getByLabel("RedFox 配置").getByRole("button", { name: "禁用" })).toBeVisible();
  await page.goto("/library");
  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByRole("button", { name: "抖音视频" }).click();
  await page.getByLabel("抖音分享链接或分享文案").fill(`3.21 复制打开抖音，看看作品\n${douyinUrl}`);
  await page.getByRole("button", { name: "提交收录" }).click();
  await expect(page.getByRole("dialog").getByText("处理中", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看资料" }).click();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "RedFox E2E 真实链路" })).toBeVisible();
  await page.getByRole("tab", { name: "处理", exact: true }).click();
  await page.getByText("高级处理信息", { exact: true }).click();
  await expect(page.getByText(/PROCESS_MEDIA · SUCCEEDED · REAL/)).toBeVisible();
  await expect(page.getByText("语音转写服务暂时不可用，请联系管理员。", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "文字稿" })).toBeVisible();
  const video = page.locator("video");
  await expect(video).toBeVisible();
  const signedUrl = await video.getAttribute("src");
  expect(signedUrl).toContain("X-Amz-Signature");
  expect((await page.request.get(signedUrl!)).status()).toBe(200);
  expect(parseCalls).toBe(1);

  const sourceId = new URL(page.url()).pathname.split("/").pop();
  if (!sourceId) throw new Error("Missing RedFox source id");
  const source = await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId }, include: { assets: true, transcript: true, ingestJobs: true } });
  expect(source).toMatchObject({ status: "READY", sourceType: "VIDEO", sourcePlatform: "DOUYIN", transcript: null });
  expect(source.ingestJobs[0]).toMatchObject({ provider: "REDFOX", providerMode: "REAL", status: "SUCCEEDED" });
  expect(source.assets).toHaveLength(1);
  expect(source.assets[0]).toMatchObject({ status: "STORED", sourceProvider: "REDFOX", mimeType: "video/mp4" });
  expect(await db.apiUsage.count({ where: { workspaceId: source.workspaceId, provider: "REDFOX", operation: "PARSE_WORK" } })).toBe(1);

  const asset = source.assets[0]!;
  const storage = minioStorageFromEnv();
  const preDeleteUrl = (await storage.getSignedUrl(asset.storageKey!)).data.url;
  await page.goto("/library");
  await page.getByRole("button", { name: "收录内容" }).click();
  await page.getByRole("button", { name: "抖音视频" }).click();
  await page.getByLabel("抖音分享链接或分享文案").fill(douyinUrl);
  await page.getByRole("button", { name: "提交收录" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("素材库中已经存在");
  expect(parseCalls).toBe(1);
  await page.getByRole("link", { name: "查看已有资料" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("更多操作").click();
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(db.sourceItem.findUnique({ where: { id: sourceId } })).resolves.toBeNull();
  expect((await page.request.get(preDeleteUrl)).status()).toBe(404);
});
