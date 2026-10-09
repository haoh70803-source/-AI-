import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { buildSourceAssetObjectKey, minioStorageFromEnv } from "@content-center/providers";
import { QueueEvents } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTranscribeSourceQueue,
  createTranscribeSourceWorker,
  TRANSCRIBE_SOURCE,
  TRANSCRIBE_SOURCE_QUEUE,
} from "./queue";
import { createRedisConnection, queuePrefix } from "./redis-connection";
import { cleanupExpiredAsrAudio, requestSourceTranscription, resolveWorkspaceTranscriptionPlan, TranscriptionAlreadyRunningError } from "./transcription";

const execFileAsync = promisify(execFile);

describe("TRANSCRIBE_SOURCE integration", () => {
  const originalEncryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  const runId = randomUUID();
  const userId = `transcription-${runId}`;
  const apiKey = `doubao-fixture-${runId}`;
  let workspaceId = "";
  let fixture: Server | undefined;
  let fixtureOrigin = "";
  let temporaryDirectory = "";
  let providerCalls = 0;
  let fixtureMode: "SUCCESS" | "EMPTY" = "SUCCESS";
  let completedSourceId = "";
  const worker = createTranscribeSourceWorker();
  const events = new QueueEvents(TRANSCRIBE_SOURCE_QUEUE, { connection: createRedisConnection(), prefix: queuePrefix() });

  beforeAll(async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    fixture = createServer(async (request, response) => {
      if (request.url !== "/api/v3/auc/bigmodel/recognize/flash") {
        response.writeHead(404).end();
        return;
      }
      providerCalls += 1;
      expect(request.headers["x-api-key"]).toBe(apiKey);
      expect(request.headers["x-api-resource-id"]).toBe("volc.bigasr.auc_turbo");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        audio: { data?: string; url?: string };
        request: { model_name: string; show_utterances: boolean };
      };
      expect(body.audio.url).toBeUndefined();
      expect(Buffer.from(body.audio.data ?? "", "base64").byteLength).toBeGreaterThan(0);
      expect(body.request).toMatchObject({ model_name: "bigmodel", show_utterances: true });
      response.writeHead(200, {
        "content-type": "application/json",
        "X-Api-Status-Code": "20000000",
        "X-Api-Message": "OK",
        "X-Tt-Logid": "doubao-worker-log",
      });
      response.end(JSON.stringify({
        audio_info: { duration: 1_000 },
        result: {
          text: fixtureMode === "EMPTY" ? "" : "这是一段真实链路测试转写。",
          utterances: fixtureMode === "EMPTY" ? [] : [{ start_time: 0, end_time: 1_000, text: "这是一段真实链路测试转写。" }],
        },
      }));
    });
    await new Promise<void>((resolve) => fixture!.listen(0, "127.0.0.1", resolve));
    const address = fixture.address();
    if (!address || typeof address === "string") throw new Error("Fixture did not bind");
    fixtureOrigin = `http://127.0.0.1:${address.port}`;
    process.env.PROVIDER_TEST_ORIGIN = fixtureOrigin;

    await db.user.create({ data: { id: userId, name: "Transcription Test", email: `${userId}@example.test` } });
    const workspace = await db.workspace.create({
      data: { name: "Transcription Test", slug: `transcription-${runId}`, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await new IntegrationService().saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", baseUrl: fixtureOrigin, apiKey },
    });
    await new IntegrationService().saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "TRANSCRIPTION",
      config: { source: "DOUBAO", qualityMode: "BALANCED", selectionMode: "AUTO", fallbackToDoubao: false },
    });
    await Promise.all([worker.waitUntilReady(), events.waitUntilReady()]);
  });

  afterAll(async () => {
    delete process.env.PROVIDER_TEST_ORIGIN;
    const storage = minioStorageFromEnv();
    if (workspaceId) {
      const assets = await db.sourceAsset.findMany({ where: { workspaceId }, select: { storageKey: true } });
      for (const asset of assets) if (asset.storageKey) await storage.delete(asset.storageKey);
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.user.deleteMany({ where: { id: userId } });
    await Promise.all([
      worker.close(),
      events.close(),
      fixture ? new Promise<void>((resolve) => fixture!.close(() => resolve())) : Promise.resolve(),
    ]);
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    await db.$disconnect();
    if (originalEncryptionKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = originalEncryptionKey;
  });

  it("prefers configured Doubao even when legacy settings select local and local is offline", async () => {
    const service = new IntegrationService();
    try {
      await service.saveIntegrationConfig({
        workspaceId,
        userId,
        provider: "TRANSCRIPTION",
        config: {
          source: "LOCAL_FUNASR",
          qualityMode: "BALANCED",
          selectionMode: "AUTO",
          fallbackToDoubao: false,
          endpoint: "http://127.0.0.1:1",
        },
      });
      await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).resolves.toMatchObject({ provider: "DOUBAO_ASR", fallbackToLocal: true });

      await service.saveIntegrationConfig({
        workspaceId,
        userId,
        provider: "TRANSCRIPTION",
        config: {
          source: "LOCAL_FUNASR",
          qualityMode: "BALANCED",
          selectionMode: "AUTO",
          fallbackToDoubao: true,
          endpoint: "http://127.0.0.1:1",
        },
      });
      await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).resolves.toMatchObject({
        provider: "DOUBAO_ASR",
        fallbackToLocal: true,
        fallbackToDoubao: false,
      });
    } finally {
      await service.saveIntegrationConfig({
        workspaceId,
        userId,
        provider: "TRANSCRIPTION",
        config: { source: "DOUBAO", qualityMode: "BALANCED", selectionMode: "AUTO", fallbackToDoubao: false },
      });
    }
  });

  it("runs VIDEO STORED through FFmpeg, MinIO, Doubao and Transcript", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "content-center-worker-asr-"));
    const videoPath = join(temporaryDirectory, "fixture.mp4");
    await execFileAsync("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-shortest", "-c:v", "libx264", "-c:a", "aac", "-y", videoPath,
    ]);
    const videoBody = await readFile(videoPath);
    const source = await db.sourceItem.create({
      data: { workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", status: "READY", title: "ASR fixture" },
    });
    completedSourceId = source.id;
    const videoAsset = await db.sourceAsset.create({
      data: {
        workspaceId,
        sourceItemId: source.id,
        assetType: "VIDEO",
        sourceProvider: "REDFOX",
        remoteUrl: null,
        storageKey: `workspaces/${workspaceId}/sources/${source.id}/assets/video-fixture/original`,
        mimeType: "video/mp4",
        sizeBytes: BigInt(videoBody.byteLength),
        status: "STORED",
        storedAt: new Date(),
      },
    });
    await minioStorageFromEnv().upload({ key: videoAsset.storageKey!, body: videoBody, contentType: "video/mp4" });
    const requested = await requestSourceTranscription({ workspaceId, sourceItemId: source.id, requestedById: userId, mediaAssetId: videoAsset.id });
    expect(requested.job.status).toBe("QUEUED");
    await expect.poll(async () => (await db.ingestJob.findUnique({ where: { id: requested.job.id } }))?.status, { timeout: 30_000 }).toBe("SUCCEEDED");

    expect(providerCalls).toBe(1);
    await expect(db.sourceItem.findUnique({ where: { id: source.id } })).resolves.toMatchObject({ status: "READY" });
    const audio = await db.sourceAsset.findFirstOrThrow({ where: { sourceItemId: source.id, assetType: "AUDIO" } });
    expect(audio).toMatchObject({ status: "STORED", sourceProvider: "FFMPEG", mimeType: "audio/mpeg", remoteUrl: null });
    expect(audio.storageKey).toBe(`workspaces/${workspaceId}/sources/${source.id}/assets/${audio.id}/audio.mp3`);
    expect((await fetch((await minioStorageFromEnv().getSignedUrl(audio.storageKey!)).data.url)).status).toBe(200);
    await expect(db.transcript.findUnique({ where: { sourceItemId: source.id } })).resolves.toMatchObject({
      provider: "DOUBAO_ASR",
      providerMode: "REAL",
      fullText: "这是一段真实链路测试转写。",
      durationMs: 1_000,
    });
    expect(await db.materialAnalysis.count({ where: { sourceItemId: source.id } })).toBe(0);
    await expect(db.apiUsage.findFirst({ where: { workspaceId, provider: "DOUBAO_ASR", operation: "TRANSCRIBE_FLASH" } })).resolves.toMatchObject({
      success: true,
      cost: null,
      providerRequestId: "doubao-worker-log",
    });
  }, 40_000);

  it("rejects a second transcription request while one is active", async () => {
    const source = await db.sourceItem.findUniqueOrThrow({ where: { id: completedSourceId }, include: { assets: true } });
    const video = source.assets.find((asset) => asset.assetType === "VIDEO" && asset.status === "STORED");
    if (!video) throw new Error("Missing video fixture");
    const active = await db.ingestJob.create({
      data: {
        workspaceId,
        sourceItemId: source.id,
        requestedById: userId,
        jobType: "TRANSCRIBE",
        provider: "DOUBAO_ASR",
        providerMode: "REAL",
        status: "QUEUED",
      },
    });
    const countBefore = await db.ingestJob.count({ where: { workspaceId, sourceItemId: source.id, jobType: "TRANSCRIBE" } });

    await expect(requestSourceTranscription({
      workspaceId,
      sourceItemId: source.id,
      requestedById: userId,
      videoAssetId: video.id,
    })).rejects.toBeInstanceOf(TranscriptionAlreadyRunningError);
    expect(await db.ingestJob.count({ where: { workspaceId, sourceItemId: source.id, jobType: "TRANSCRIBE" } })).toBe(countBefore);

    await db.ingestJob.update({ where: { id: active.id }, data: { status: "CANCELLED" } });
  });

  it("keeps the old Transcript and reuses AUDIO when retranscription fails", async () => {
    fixtureMode = "EMPTY";
    const source = await db.sourceItem.findUniqueOrThrow({ where: { id: completedSourceId }, include: { assets: true, transcript: true } });
    const video = source.assets.find((asset) => asset.assetType === "VIDEO");
    if (!video) throw new Error("Missing video fixture");
    const beforeText = source.transcript?.fullText;
    const beforeAudioCount = source.assets.filter((asset) => asset.assetType === "AUDIO" && asset.status === "STORED").length;
    const jobRecord = await db.ingestJob.create({
      data: {
        workspaceId,
        sourceItemId: source.id,
        requestedById: userId,
        jobType: "TRANSCRIBE",
        provider: "DOUBAO_ASR",
        providerMode: "REAL",
        maxAttempts: 3,
      },
    });
    const queue = createTranscribeSourceQueue();
    const queueJob = await queue.add(TRANSCRIBE_SOURCE, {
      jobId: jobRecord.id,
      workspaceId,
      sourceItemId: source.id,
      videoAssetId: video.id,
      requestedById: userId,
    }, { attempts: 3, removeOnComplete: true, removeOnFail: true });
    await expect(queueJob.waitUntilFinished(events, 20_000)).rejects.toThrow();
    await queue.close();

    await expect(db.ingestJob.findUnique({ where: { id: jobRecord.id } })).resolves.toMatchObject({
      status: "FAILED",
      attempt: 1,
      errorCode: "DOUBAO_EMPTY_TRANSCRIPT",
    });
    await expect(db.transcript.findUnique({ where: { sourceItemId: source.id } })).resolves.toMatchObject({ fullText: beforeText });
    await expect(db.sourceItem.findUnique({ where: { id: source.id } })).resolves.toMatchObject({ status: "READY" });
    expect(await db.sourceAsset.count({ where: { sourceItemId: source.id, assetType: "AUDIO", status: "STORED" } })).toBe(beforeAudioCount);
    expect(providerCalls).toBe(2);
  }, 30_000);

  it("retries only after an explicit request and keeps the existing transcript readable", async () => {
    fixtureMode = "SUCCESS";
    const source = await db.sourceItem.findUniqueOrThrow({ where: { id: completedSourceId }, include: { assets: true, transcript: true } });
    const video = source.assets.find((asset) => asset.assetType === "VIDEO" && asset.status === "STORED");
    if (!video) throw new Error("Missing video fixture");
    const previousText = source.transcript?.fullText;
    const requested = await requestSourceTranscription({ workspaceId, sourceItemId: source.id, requestedById: userId, mediaAssetId: video.id });
    expect(requested.job.status).toBe("QUEUED");
    await expect.poll(async () => (await db.ingestJob.findUnique({ where: { id: requested.job.id } }))?.status, { timeout: 30_000 }).toBe("SUCCEEDED");
    await expect(db.transcript.findUnique({ where: { sourceItemId: source.id } })).resolves.toMatchObject({ fullText: previousText });
    expect(await db.materialAnalysis.count({ where: { sourceItemId: source.id } })).toBe(0);
    expect(providerCalls).toBe(3);
  }, 40_000);

  it("creates one queued job and one provider call for concurrent requests, then permits retranscription", async () => {
    fixtureMode = "SUCCESS";
    const source = await db.sourceItem.findUniqueOrThrow({ where: { id: completedSourceId }, include: { assets: true } });
    const video = source.assets.find((asset) => asset.assetType === "VIDEO" && asset.status === "STORED");
    if (!video) throw new Error("Missing video fixture");
    const baseline = providerCalls;
    await worker.pause();
    let firstJobId = "";
    try {
      const requests = await Promise.allSettled([1, 2].map(() => requestSourceTranscription({ workspaceId, sourceItemId: source.id, requestedById: userId, mediaAssetId: video.id })));
      const accepted = requests.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof requestSourceTranscription>>> => result.status === "fulfilled");
      const rejected = requests.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(TranscriptionAlreadyRunningError);
      firstJobId = accepted[0]!.value.job.id;
      expect(await db.ingestJob.count({ where: { workspaceId, sourceItemId: source.id, jobType: "TRANSCRIBE", status: { in: ["QUEUED", "RUNNING"] } } })).toBe(1);
      const queue = createTranscribeSourceQueue();
      try {
        const jobs = await queue.getJobs(["waiting", "active", "delayed"]);
        expect(jobs.filter((job) => job.data.sourceItemId === source.id).map((job) => job.data.jobId)).toEqual([firstJobId]);
      } finally { await queue.close(); }
    } finally { await worker.resume(); }
    await expect.poll(async () => (await db.ingestJob.findUnique({ where: { id: firstJobId } }))?.status, { timeout: 30_000 }).toBe("SUCCEEDED");
    expect(providerCalls - baseline).toBe(1);

    const again = await requestSourceTranscription({ workspaceId, sourceItemId: source.id, requestedById: userId, mediaAssetId: video.id });
    expect(again.job.id).not.toBe(firstJobId);
    await expect.poll(async () => (await db.ingestJob.findUnique({ where: { id: again.job.id } }))?.status, { timeout: 30_000 }).toBe("SUCCEEDED");
    expect(providerCalls - baseline).toBe(2);
  }, 80_000);

  it("cleans only expired video-derived audio and preserves original audio and Transcript", async () => {
    const old = new Date("2020-01-01T00:00:00.000Z");
    const originalSource = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "AUDIO", title: "Uploaded original audio", status: "READY" } });
    const original = await db.sourceAsset.create({ data: {
      workspaceId, sourceItemId: originalSource.id, assetType: "AUDIO", sourceProvider: "LOCAL_UPLOAD", status: "DOWNLOADING", mimeType: "audio/mpeg",
    } });
    const originalKey = buildSourceAssetObjectKey({ workspaceId, sourceItemId: originalSource.id, assetId: original.id, assetType: "AUDIO", mimeType: "audio/mpeg" });
    await minioStorageFromEnv().upload({ key: originalKey, body: Buffer.from("ID3original-audio"), contentType: "audio/mpeg" });
    await db.sourceAsset.update({ where: { id: original.id }, data: { status: "STORED", storageKey: originalKey, sizeBytes: BigInt(17), storedAt: old } });

    const derived = await db.sourceAsset.findFirstOrThrow({ where: { workspaceId, sourceItemId: completedSourceId, assetType: "AUDIO", sourceProvider: "FFMPEG", status: "STORED" } });
    await db.sourceAsset.update({ where: { id: derived.id }, data: { storedAt: old } });
    const transcriptBefore = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: completedSourceId } });
    const result = await cleanupExpiredAsrAudio(Date.now(), workspaceId);
    expect(result.cleaned).toBe(1);
    await expect(db.sourceItem.findUnique({ where: { id: originalSource.id } })).resolves.toMatchObject({ status: "READY" });
    await expect(db.sourceAsset.findUnique({ where: { id: original.id } })).resolves.toMatchObject({ status: "STORED", storageKey: originalKey });
    expect((await fetch((await minioStorageFromEnv().getSignedUrl(originalKey)).data.url)).status).toBe(200);
    await expect(db.sourceAsset.findUnique({ where: { id: derived.id } })).resolves.toMatchObject({ status: "FAILED", storageKey: null });
    await expect(db.sourceItem.findUnique({ where: { id: completedSourceId } })).resolves.toMatchObject({ status: "READY" });
    await expect(db.transcript.findUnique({ where: { sourceItemId: completedSourceId } })).resolves.toMatchObject({ id: transcriptBefore.id, fullText: transcriptBefore.fullText });
  }, 30_000);
});
