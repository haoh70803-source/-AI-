import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { minioStorageFromEnv } from "@content-center/providers";
import { createContentIngestWorker, createTranscribeSourceWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);
const runId = randomUUID();
const email = `doubao-e2e-${runId}@example.test`;
const password = "safe-e2e-password";
const douyinUrl = "https://www.douyin.com/video/doubao-e2e-fixture";
const doubaoKey = `doubao-e2e-key-${runId}`;
let fixture: Server;
let fixtureOrigin = "";
let videoBody: Buffer;
let temporaryDirectory = "";
let ingestWorker: ReturnType<typeof createContentIngestWorker>;
let transcriptionWorker: ReturnType<typeof createTranscribeSourceWorker>;
let parseCalls = 0;
let transcriptionCalls = 0;

test.beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "content-center-doubao-e2e-"));
  const videoPath = join(temporaryDirectory, "fixture.mp4");
  await execFileAsync("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-shortest", "-c:v", "libx264", "-c:a", "aac", "-y", videoPath,
  ]);
  videoBody = await readFile(videoPath);
  fixture = createServer(async (request, response) => {
    if (request.url === "/story/api/parseWork/parse") {
      parseCalls += 1;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toMatchObject({ url: douyinUrl });
      response.writeHead(200, { "content-type": "application/json", "x-request-id": "doubao-e2e-redfox-log" });
      response.end(JSON.stringify({
        code: 200,
        data: {
          awemeType: "video",
          platform: "dy",
          title: "RedFox 到 Doubao 真实链路",
          videoUrl: `${fixtureOrigin}/fixture.mp4`,
        },
      }));
      return;
    }
    if (request.url === "/fixture.mp4") {
      response.writeHead(200, { "content-type": "video/mp4", "content-length": videoBody.byteLength });
      response.end(videoBody);
      return;
    }
    if (request.url === "/api/v3/auc/bigmodel/recognize/flash") {
      transcriptionCalls += 1;
      expect(request.headers["x-api-key"]).toBe(doubaoKey);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { audio: { data?: string; url?: string } };
      expect(body.audio.url).toBeUndefined();
      expect(Buffer.from(body.audio.data ?? "", "base64").byteLength).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 150));
      response.writeHead(200, {
        "content-type": "application/json",
        "X-Api-Status-Code": "20000000",
        "X-Api-Message": "OK",
        "X-Tt-Logid": `doubao-e2e-log-${transcriptionCalls}`,
      });
      response.end(JSON.stringify({
        audio_info: { duration: 1_000 },
        result: {
          text: "豆包真实转写已完成。",
          utterances: [
            { start_time: 0, end_time: 400, text: "豆包真实转写" },
            { start_time: 400, end_time: 1_000, text: "已完成。" },
          ],
        },
      }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Doubao E2E fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
  process.env.INGEST_TEST_FIXTURE_ORIGIN = fixtureOrigin;
  ingestWorker = createContentIngestWorker();
  transcriptionWorker = createTranscribeSourceWorker();
  await Promise.all([ingestWorker.waitUntilReady(), transcriptionWorker.waitUntilReady()]);
});

test.afterAll(async () => {
  await Promise.all([ingestWorker.close(), transcriptionWorker.close()]);
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const workspace = await db.workspace.findFirst({ where: { members: { some: { userId: user.id } } }, select: { id: true } });
    if (workspace) {
      const assets = await db.sourceAsset.findMany({ where: { workspaceId: workspace.id }, select: { storageKey: true } });
      for (const asset of assets) if (asset.storageKey) await minioStorageFromEnv().delete(asset.storageKey);
      await db.workspace.delete({ where: { id: workspace.id } });
    }
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
  await rm(temporaryDirectory, { recursive: true, force: true });
  delete process.env.INGEST_TEST_FIXTURE_ORIGIN;
});

test("RedFox video waits for a user request before Doubao transcription", async ({ page }) => {
  test.setTimeout(90_000);
  expect((await page.request.post("/api/internal-signup", { data: { name: "Doubao E2E Owner", email, password, inviteCode: "test-invite" } })).ok()).toBe(true);
  expect((await page.request.post("/api/auth/sign-in/email", { data: { email, password } })).ok()).toBe(true);
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const integrations = new IntegrationService();
  await integrations.saveIntegrationConfig({ workspaceId, userId: user.id, provider: "REDFOX", config: { baseUrl: fixtureOrigin, apiKey: "redfox-e2e-key" } });
  await integrations.saveIntegrationConfig({ workspaceId, userId: user.id, provider: "DOUBAO_ASR", config: { authMode: "API_KEY", baseUrl: fixtureOrigin, apiKey: doubaoKey } });
  await integrations.saveIntegrationConfig({ workspaceId, userId: user.id, provider: "TRANSCRIPTION", config: { source: "DOUBAO", qualityMode: "BALANCED", selectionMode: "AUTO", fallbackToDoubao: false } });

  const created = await page.request.post("/api/source-items", { data: { kind: "DOUYIN", shareText: douyinUrl } });
  expect(created.status()).toBe(202);
  const { sourceItemId: sourceId } = await created.json() as { sourceItemId: string };
  await expect.poll(async () => (await db.sourceItem.findUnique({ where: { id: sourceId } }))?.status, { timeout: 30_000 }).toBe("READY");
  expect(await db.ingestJob.count({ where: { sourceItemId: sourceId, jobType: "TRANSCRIBE" } })).toBe(0);
  await expect(db.transcript.findUnique({ where: { sourceItemId: sourceId } })).resolves.toBeNull();
  expect(transcriptionCalls).toBe(0);

  await page.goto(`/library/${sourceId}`);
  await page.getByRole("button", { name: "来源与处理" }).click();
  await page.getByRole("navigation", { name: "资料属性分类" }).getByRole("button", { name: "处理与文件" }).click();
  const rail = page.getByRole("complementary", { name: "资料属性与操作" });
  await expect(rail.getByText("未转录", { exact: true })).toBeVisible();
  await rail.getByRole("button", { name: "开始转录" }).click();
  await expect.poll(async () => (await db.transcript.findUnique({ where: { sourceItemId: sourceId } }))?.provider, { timeout: 30_000 }).toBe("DOUBAO_ASR");
  await page.reload();
  await expect(page.locator(".source-text-content")).toContainText("豆包真实转写");
  await expect(page.locator(".source-text-content")).toContainText("已完成。");

  const source = await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId }, include: { assets: true, transcript: true, ingestJobs: true } });
  expect(source).toMatchObject({ status: "READY", transcript: { provider: "DOUBAO_ASR", providerMode: "REAL" } });
  expect(source.transcript?.fullText).toBe("豆包真实转写已完成。");
  expect(source.assets.map((asset) => asset.assetType)).toEqual(expect.arrayContaining(["VIDEO", "AUDIO"]));
  expect(source.assets.find((asset) => asset.assetType === "AUDIO")).toMatchObject({ status: "STORED", sourceProvider: "FFMPEG" });
  expect(source.ingestJobs.map((job) => job.jobType)).toEqual(expect.arrayContaining(["PROCESS_MEDIA", "TRANSCRIBE"]));
  expect(parseCalls).toBe(1);
  expect(transcriptionCalls).toBe(1);
  expect(await db.apiUsage.count({ where: { workspaceId: source.workspaceId, provider: "REDFOX", operation: "PARSE_WORK" } })).toBe(1);
  expect(await db.apiUsage.count({ where: { workspaceId: source.workspaceId, provider: "DOUBAO_ASR", operation: "TRANSCRIBE_FLASH" } })).toBe(1);
  expect(await db.materialAnalysis.count({ where: { sourceItemId: sourceId } })).toBe(0);

  await page.getByRole("button", { name: "来源与处理" }).click();
  await page.getByRole("navigation", { name: "资料属性分类" }).getByRole("button", { name: "处理与文件" }).click();
  await page.getByRole("complementary", { name: "资料属性与操作" }).getByRole("button", { name: "重新转录" }).click();
  await expect.poll(() => transcriptionCalls, { timeout: 30_000 }).toBe(2);
  await expect.poll(async () => await db.ingestJob.count({ where: { sourceItemId: sourceId, jobType: "TRANSCRIBE", status: "SUCCEEDED" } }), { timeout: 30_000 }).toBe(2);
  expect(await db.sourceAsset.count({ where: { sourceItemId: sourceId, assetType: "AUDIO", status: "STORED" } })).toBe(1);
});
