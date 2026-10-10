import type { Job } from "bullmq";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscribeSourcePayload } from "./transcription-queue";

const mocks = vi.hoisted(() => ({
  status: vi.fn(), credentials: vi.fn(), health: vi.fn(), cloud: vi.fn(), local: vi.fn(),
  findJob: vi.fn(), update: vi.fn(), audit: vi.fn(), usage: vi.fn(), transcript: vi.fn(), signed: vi.fn(),
  updateMany: vi.fn(), extract: vi.fn(),
}));
vi.mock("@content-center/db", () => ({ db: {
  ingestJob: { findFirst: mocks.findJob, update: mocks.update, updateMany: mocks.updateMany },
  auditLog: { create: mocks.audit }, apiUsage: { create: mocks.usage }, transcript: { upsert: mocks.transcript },
  $transaction: async (operation: unknown) => typeof operation === "function"
    ? operation({ transcript: { upsert: mocks.transcript }, ingestJob: { update: mocks.update, findFirst: mocks.findJob }, auditLog: { create: mocks.audit } })
    : Promise.all(operation as Promise<unknown>[]),
} }));
vi.mock("@content-center/integrations", async original => ({
  ...await original<typeof import("@content-center/integrations")>(),
  IntegrationService: class { getIntegrationStatus = mocks.status; getDecryptedIntegrationConfig = mocks.credentials; },
}));
vi.mock("@content-center/providers", async original => ({
  ...await original<typeof import("@content-center/providers")>(),
  LocalAsrClient: class { health = mocks.health; },
  LocalFunASRTranscriptionProvider: class { transcribe = mocks.local; getLastRequestMetadata() { return {}; } },
  DoubaoTranscriptionProvider: class { transcribe = mocks.cloud; getLastRequestMetadata() { return {}; } },
  DoubaoRecordingFileTranscriptionProvider: class { transcribe = mocks.cloud; getLastRequestMetadata() { return {}; } },
  DoubaoStreamingTranscriptionProvider: class { transcribe = mocks.cloud; getLastRequestMetadata() { return {}; } },
  getStorageProvider: () => ({ getSignedUrl: mocks.signed }), resolvePublicAddress: vi.fn(),
  FFmpegMediaProcessor: class { extractAudio = mocks.extract; },
}));
import { DoubaoError, LocalAsrError } from "@content-center/providers";
import { processTranscribeSourceJob, resolveWorkspaceTranscriptionPlan } from "./transcription";

const workspaceId = "workspace-fixture";
const result = { data: { fullText: "识别文字", segments: [] } };
const job = { data: { jobId: "job", workspaceId, sourceItemId: "source", requestedById: "user", mediaAssetId: "audio" }, attemptsMade: 0 } as Job<TranscribeSourcePayload>;
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));
  mocks.status.mockImplementation(async (_workspace, provider) => provider === "TRANSCRIPTION"
    ? { status: "CONFIGURED", publicConfig: { source: "LOCAL_FUNASR", selectionMode: "MANUAL", manualModel: "SENSEVOICE_SMALL", fallbackToDoubao: false } }
    : { status: "CONFIGURED" });
  mocks.credentials.mockResolvedValue({ apiKey: "fixture-key" });
  mocks.health.mockResolvedValue({ hardware: { cudaAvailable: false }, models: [{ key: "SENSEVOICE_SMALL", installed: true, supported: true }] });
  mocks.cloud.mockResolvedValue(result); mocks.local.mockResolvedValue(result);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.extract.mockResolvedValue({ path: fileURLToPath(new URL("../../../services/local-asr/benchmark/audio/normal_zh.wav", import.meta.url)), cleanup: async () => {} });
  mocks.signed.mockResolvedValue({ data: { url: "https://fixture.example/scoped-audio.mp3" } });
  mocks.findJob.mockResolvedValue({ id: "job", workspaceId, sourceItemId: "source", requestedById: "user", attempt: 0, maxAttempts: 1,
    status: "QUEUED", metadata: { transcriptionPlan: { provider: "LOCAL_FUNASR" } },
    sourceItem: { workspaceId, status: "READY", assets: [{ id: "audio", assetType: "AUDIO", sourceProvider: "FFMPEG", status: "STORED", storageKey: "scoped/audio.mp3", sizeBytes: 3n, metadata: { durationMs: 1000 } }] },
  });
});

describe("material transcription cloud priority", () => {
  it("uses workspace cloud credentials without probing an offline local service", async () => {
    mocks.health.mockRejectedValue(new LocalAsrError("LOCAL_ASR_NOT_RUNNING", "本地未启动", false));
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).resolves.toMatchObject({ provider: "DOUBAO_ASR", fallbackToLocal: true, protocol: "FLASH" });
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.credentials).toHaveBeenCalledWith(workspaceId, "DOUBAO_ASR");
    await processTranscribeSourceJob(job);
    expect(mocks.cloud).toHaveBeenCalledOnce(); expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.transcript.mock.calls[0]![0].create).toMatchObject({ provider: "DOUBAO_ASR", metadata: { fallbackUsed: false } });
  });

  it("falls back to local bytes after a cloud failure and records both providers", async () => {
    mocks.cloud.mockRejectedValue(new DoubaoError("DOUBAO_TIMEOUT", "云端超时", true));
    await processTranscribeSourceJob(job);
    expect(mocks.local).toHaveBeenCalledWith({ audio: { mode: "BINARY_DATA", data: new Uint8Array([1, 2, 3]) }, contentType: "audio/mpeg" });
    expect(mocks.usage.mock.calls.map(([arg]) => [arg.data.provider, arg.data.success])).toEqual([["DOUBAO_ASR", false], ["LOCAL_FUNASR", true]]);
    expect(mocks.transcript.mock.calls[0]![0].create).toMatchObject({ provider: "LOCAL_FUNASR", metadata: { fallbackUsed: true } });
    expect(mocks.signed.mock.calls[1]![2]).toMatchObject({ purpose: "browser", assetScope: { workspaceId, sourceItemId: "source", assetId: "audio" } });
  });

  it("uses local when cloud credentials are missing", async () => {
    mocks.credentials.mockResolvedValue(null);
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).resolves.toMatchObject({ provider: "LOCAL_FUNASR", fallbackUsed: true, fallbackToDoubao: false });
  });

  it("sends private audio bytes to streaming 2.0 without requiring public storage", async () => {
    mocks.credentials.mockResolvedValue({ apiKey: "fixture-key", protocol: "STREAMING_2_0", resourceId: "volc.seedasr.sauc.duration" });
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).resolves.toMatchObject({ provider: "DOUBAO_ASR", protocol: "STREAMING_2_0" });
    await processTranscribeSourceJob(job);
    expect(mocks.cloud).toHaveBeenCalledWith({ audio: { mode: "BINARY_DATA", data: new Uint8Array([1, 2, 3]) }, contentType: "audio/mpeg" });
    expect(mocks.usage.mock.calls[0]![0].data).toMatchObject({ operation: "TRANSCRIBE_STREAMING_2_0", success: true });
  });

  it("retains the cloud error if local fallback is unavailable", async () => {
    mocks.cloud.mockRejectedValue(new DoubaoError("DOUBAO_TIMEOUT", "云端超时", true));
    mocks.health.mockRejectedValue(new LocalAsrError("LOCAL_ASR_NOT_RUNNING", "本地未启动", false));
    await expect(processTranscribeSourceJob(job)).rejects.toThrow("DOUBAO_TIMEOUT");
    expect(mocks.transcript).not.toHaveBeenCalled(); expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ status: "FAILED", errorCode: "DOUBAO_TIMEOUT" });
  });

  it("does not bypass administrator disabling transcription", async () => {
    mocks.status.mockResolvedValue({ status: "DISABLED" });
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).rejects.toThrow("管理员禁用");
    expect(mocks.credentials).not.toHaveBeenCalled(); expect(mocks.health).not.toHaveBeenCalled();
  });

  it("reports missing cloud credentials when both providers are unavailable", async () => {
    mocks.credentials.mockResolvedValue(null);
    mocks.health.mockRejectedValue(new LocalAsrError("LOCAL_ASR_NOT_RUNNING", "本地未启动", false));
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).rejects.toMatchObject({ code: "DOUBAO_NOT_CONFIGURED" });
    await expect(processTranscribeSourceJob(job)).rejects.toThrow("DOUBAO_NOT_CONFIGURED");
    expect(mocks.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ status: "FAILED", errorCode: "DOUBAO_NOT_CONFIGURED" });
  });

  it("does not resolve credentials or transcribe a foreign workspace source", async () => {
    const record = await mocks.findJob();
    record.sourceItem.workspaceId = "foreign-workspace";
    await expect(processTranscribeSourceJob(job)).rejects.toThrow("workspace mismatch");
    expect(mocks.credentials).not.toHaveBeenCalled(); expect(mocks.local).not.toHaveBeenCalled(); expect(mocks.cloud).not.toHaveBeenCalled();
  });

  it("splits audio exceeding whole-file flash limits and keeps its global timeline", async () => {
    const record = await mocks.findJob();
    record.sourceItem.assets[0].metadata.durationMs = 3 * 60 * 60 * 1000;
    mocks.cloud.mockResolvedValue({ data: { fullText: "识别文字", segments: [{ startMs: 100, endMs: 1000, text: "识别文字" }] } });
    await processTranscribeSourceJob(job);
    expect(mocks.cloud).toHaveBeenCalledTimes(60); expect(mocks.local).not.toHaveBeenCalled();
    const saved = mocks.transcript.mock.calls[0]![0].create;
    expect(saved).toMatchObject({ provider: "DOUBAO_ASR", durationMs: 10_800_000, metadata: { fallbackUsed: false, technical: { chunkCount: 60 } } });
    expect(saved.segments[59].startMs).toBe(59 * 180_000 - 1000 + 100);
  });

  it("processes the previously timed-out 11-minute stream as four bounded chunks", async () => {
    mocks.credentials.mockResolvedValue({ apiKey: "fixture-key", protocol: "STREAMING_2_0", resourceId: "volc.seedasr.sauc.duration" });
    const record = await mocks.findJob(); record.sourceItem.assets[0].metadata.durationMs = 673_961;
    mocks.cloud.mockResolvedValue({ data: { fullText: "识别文字", segments: [{ startMs: 0, endMs: 1000, text: "识别文字" }] } });
    await processTranscribeSourceJob(job);
    expect(mocks.cloud).toHaveBeenCalledTimes(4);
    expect(mocks.extract).toHaveBeenCalledTimes(4);
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.transcript.mock.calls[0]![0].create.durationMs).toBe(673_961);
    expect(mocks.updateMany.mock.calls.at(-1)![0].data.metadata.chunkProgress).toMatchObject({ total: 4, completed: 4 });
  });

  it("keeps successful cloud chunks after exhaustion and never publishes an incomplete transcript", async () => {
    const record = await mocks.findJob(); record.sourceItem.assets[0].metadata.durationMs = 673_961;
    mocks.credentials.mockResolvedValue({ apiKey: "fixture-key", protocol: "STREAMING_2_0", resourceId: "volc.seedasr.sauc.duration" });
    mocks.cloud.mockResolvedValueOnce({ data: { fullText: "识别文字", segments: [{ startMs: 0, endMs: 1000, text: "识别文字" }] } }).mockRejectedValue(new DoubaoError("DOUBAO_TIMEOUT", "timeout", true));
    await expect(processTranscribeSourceJob(job)).rejects.toThrow("已保存 1/4 段");
    expect(mocks.transcript).not.toHaveBeenCalled(); expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ status: "FAILED", errorCode: "DOUBAO_TIMEOUT" });
    expect(Object.keys(mocks.updateMany.mock.calls.at(-2)![0].data.metadata.chunkCheckpoint.chunks)).toHaveLength(1);
  }, 10_000);

  it("prefers explicitly configured flash and returns to the saved stream if flash is unauthorized", async () => {
    mocks.credentials.mockResolvedValue({ apiKey: "fixture-key", protocol: "STREAMING_2_0", resourceId: "volc.seedasr.sauc.duration", flashResourceId: "volc.bigasr.auc_turbo" });
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId)).resolves.toMatchObject({ protocol: "FLASH" });
    mocks.cloud.mockRejectedValueOnce(new DoubaoError("DOUBAO_PERMISSION_DENIED", "denied", false)).mockResolvedValue(result);
    await processTranscribeSourceJob(job);
    expect(mocks.usage.mock.calls.map(([arg]) => arg.data.operation)).toEqual(["TRANSCRIBE_FLASH", "TRANSCRIBE_STREAMING_2_0"]);
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it("keeps microphone dictation on its existing workspace policy", async () => {
    await expect(resolveWorkspaceTranscriptionPlan(workspaceId, "WORKSPACE")).resolves.toMatchObject({ provider: "LOCAL_FUNASR" });
    expect(mocks.credentials).not.toHaveBeenCalled();
  });
});
