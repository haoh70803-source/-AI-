import { markDispatchPending } from "./job-recovery";
import { ensureVideoPreview } from "./video-preview";
import { randomUUID } from "node:crypto";
import { reserveExperienceUsage } from "./experience-limits";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, resolve } from "node:path";
import { ASR_AUDIO_SIGNED_URL_TTL_SECONDS, MAX_ASR_BINARY_DATA_BYTES, readAsrAudioRetentionHours } from "@content-center/config";
import { db, type Prisma } from "@content-center/db";
import {
  DOUBAO_DEFAULT_BASE_URL,
  DOUBAO_DEFAULT_RESOURCE_ID,
  IntegrationService,
  parseProviderConfig,
  type DoubaoProtocol,
} from "@content-center/integrations";
import {
  assertFlashAudioLimits,
  DoubaoClient,
  DoubaoError,
  DoubaoRecordingFileClient,
  DoubaoRecordingFileTranscriptionProvider,
  DoubaoTranscriptionProvider,
  DoubaoStreamingClient,
  DoubaoStreamingTranscriptionProvider,
  doubaoErrorMetadata,
  doubaoRuntimeConfigSchema,
  FFmpegMediaProcessor,
  LocalAsrClient,
  LocalAsrError,
  LocalFunASRTranscriptionProvider,
  MediaProcessorError,
  buildSourceAssetObjectKey,
  getStorageProvider,
  resolvePublicAddress,
  TranscriptionQualityResolver,
  type LocalAsrBenchmarkProfile,
  type LocalAsrDevice,
  type LocalAsrModel,
  type TranscriptionInput,
  type TranscriptionQualityMode,
} from "@content-center/providers";
import { UnrecoverableError, type Job } from "bullmq";
import { enqueueTranscribeSource, type TranscribeSourcePayload } from "./transcription-queue";
import { audioChunks, checkpointKey, readChunkCheckpoint, transcribeChunks, TranscriptionChunkError, TRANSCRIPTION_CHUNK_MS } from "./transcription-chunks";

type ProgressStage = "QUEUED" | "PREPARING_VIDEO_PREVIEW" | "EXTRACTING_AUDIO" | "UPLOADING_AUDIO" | "TRANSCRIBING" | "PERSISTING" | "SUCCEEDED";
type TranscriptionRecord = Prisma.IngestJobGetPayload<{ include: { sourceItem: { include: { assets: true } } } }>;
type TranscriptionProviderName = "LOCAL_FUNASR" | "DOUBAO_ASR";
type WorkspaceTranscriptionConfig = {
  source: "LOCAL_FUNASR" | "DOUBAO";
  qualityMode: TranscriptionQualityMode;
  selectionMode: "AUTO" | "MANUAL";
  manualModel?: LocalAsrModel;
  fallbackToDoubao: boolean;
  endpoint: string;
};
type TranscriptionPlan = {
  provider: TranscriptionProviderName;
  qualityMode: TranscriptionQualityMode;
  endpoint?: string;
  model?: LocalAsrModel;
  device?: LocalAsrDevice;
  fallbackToDoubao: boolean;
  fallbackUsed?: boolean;
  fallbackToLocal?: boolean;
  protocol?: DoubaoProtocol;
};

const integrationService = new IntegrationService();
let benchmarkProfilePromise: Promise<LocalAsrBenchmarkProfile> | undefined;

// Short, ephemeral dictation uses the same workspace credentials and model policy.
export async function prepareVoiceTranscription(workspaceId: string, signal?: AbortSignal) {
  const plan = await resolveWorkspaceTranscriptionPlan(workspaceId, "WORKSPACE");
  const config = plan.provider === "DOUBAO_ASR" ? await loadDoubaoConfig(workspaceId) : null;
  const provider = plan.provider === "LOCAL_FUNASR"
    ? new LocalFunASRTranscriptionProvider(new LocalAsrClient({ endpoint: plan.endpoint!, model: plan.model!, device: plan.device! }, { timeoutMs: 90_000, signal }))
    : config!.protocol === "RECORDING_FILE_2_0"
      ? new DoubaoRecordingFileTranscriptionProvider(new DoubaoRecordingFileClient(config!, { submissionTimeoutMs: 10_000, queryTimeoutMs: 10_000, overallTimeoutMs: 60_000, signal }))
      : config!.protocol === "STREAMING_2_0"
        ? new DoubaoStreamingTranscriptionProvider(new DoubaoStreamingClient(config!, { overallTimeoutMs: 90_000, signal }))
        : new DoubaoTranscriptionProvider(new DoubaoClient(config!, { timeoutMs: 90_000, signal }));
  return async (input: TranscriptionInput, userId: string, durationMs: number) => {
    const release = await reserveExperienceUsage({ workspaceId, userId, operation: "TRANSCRIBE" });
    const started = Date.now(); let success = false, errorCode: string | undefined;
    let temporary: { sourceId: string; key: string; scope: { workspaceId: string; sourceItemId: string; assetId: string } } | undefined;
    let storage: ReturnType<typeof getStorageProvider> | undefined;
    try {
      if (config?.protocol === "RECORDING_FILE_2_0" && input.audio.mode === "BINARY_DATA") {
        storage = getStorageProvider();
        // Archived temporary media is scoped and inventoried, never added to the user's library.
        const { source, asset } = await db.$transaction(async tx => {
          const source = await tx.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "AUDIO", sourceProvider: "VOICE_INPUT", status: "ARCHIVED", title: "语音输入临时录音" } });
          const asset = await tx.sourceAsset.create({ data: { workspaceId, sourceItemId: source.id, sourceProvider: "VOICE_INPUT", assetType: "AUDIO", status: "DOWNLOADING", storedAt: new Date() } });
          return { source, asset };
        });
        const scope = { workspaceId, sourceItemId: source.id, assetId: asset.id };
        const key = buildSourceAssetObjectKey({ ...scope, assetType: "AUDIO", mimeType: "audio/mpeg" });
        temporary = { sourceId: source.id, key, scope };
        // Inventory the key before upload so a interrupted request remains cleanable.
        await db.sourceAsset.update({ where: { id: asset.id }, data: { storageKey: key } });
        await storage.upload({ key, body: input.audio.data, contentType: "audio/mpeg", contentLength: input.audio.data.byteLength, assetScope: scope, signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]) });
        await db.sourceAsset.update({ where: { id: asset.id }, data: { status: "STORED", storageKey: key, storedAt: new Date() } });
        const url = (await storage.getSignedUrl(key, 300, { purpose: "doubao", assetScope: scope })).data.url;
        await resolvePublicAddress(url);
        input = { audio: { mode: "REMOTE_URL", url }, contentType: "audio/mpeg" };
      }
      const text = (await provider.transcribe(input)).data.fullText.trim(); success = true; return text;
    } catch (error) { errorCode = publicFailure(error).code; throw error; }
    finally {
      await release();
      if (temporary && storage) {
        try { await storage.delete(temporary.key, temporary.scope); await db.sourceItem.delete({ where: { id: temporary.sourceId } }); }
        catch { await db.sourceAsset.update({ where: { id: temporary.scope.assetId }, data: { status: "STORED", storageKey: temporary.key, storedAt: new Date(0) } }); }
      }
      await db.apiUsage.create({ data: { workspaceId, userId, provider: plan.provider, operation: transcriptionUsageOperation(plan.provider, config?.protocol), requestId: `voice:${randomUUID()}`, success, units: 1, cost: plan.provider === "LOCAL_FUNASR" ? 0 : null, metadata: json({ purpose: "VOICE_INPUT", durationMs, processingMs: Date.now() - started, errorCode, protocol: config?.protocol, providerMode: "REAL" }) } });
    }
  };
}

export class TranscriptionAlreadyRunningError extends Error {
  readonly code = "TRANSCRIPTION_ALREADY_RUNNING";

  constructor(readonly jobId: string) {
    super("转写任务已在进行中。");
    this.name = "TranscriptionAlreadyRunningError";
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function object(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicFailure(error: unknown) {
  if (error instanceof TranscriptionChunkError) return { code: error.code, message: error.message, retryable: false };
  if (error instanceof DoubaoError || error instanceof LocalAsrError) {
    return { code: error.code, message: error.code.endsWith("TIMEOUT") ? "转录超时，已停止等待。请重试，已保存的原文件会保留。" : error.message, retryable: error.retryable && !error.code.endsWith("TIMEOUT") };
  }
  if (error instanceof MediaProcessorError) return { code: error.code, message: error.message, retryable: false };
  if (error instanceof Error && (error.message === "ASR_VIDEO_NOT_AVAILABLE" || error.message === "ASR_MEDIA_NOT_AVAILABLE")) {
    return { code: "ASR_MEDIA_NOT_AVAILABLE", message: "没有可转写的已保存媒体。", retryable: false };
  }
  return { code: "INTERNAL_ERROR", message: "视频转写失败。", retryable: false };
}

async function updateProgress(jobId: string, amount: number, stage: ProgressStage, plan?: TranscriptionPlan, metadata: Record<string, unknown> = {}) {
  await db.ingestJob.update({
    where: { id: jobId },
    data: { progress: amount, metadata: json({ ...metadata, progressStage: stage, ...(plan ? { transcriptionPlan: plan } : {}) }) },
  });
}

async function loadDoubaoConfig(workspaceId: string) {
  const status = await integrationService.getIntegrationStatus(workspaceId, "DOUBAO_ASR");
  if (status.status === "DISABLED") throw new DoubaoError("DOUBAO_DISABLED", "豆包 ASR 已禁用。", false);
  if (status.status !== "CONFIGURED") throw new DoubaoError("DOUBAO_NOT_CONFIGURED", "请先配置豆包 ASR 的 API Key 或凭证，再重试；已保存的文件无需重新上传。", false);
  const decrypted = await integrationService.getDecryptedIntegrationConfig(workspaceId, "DOUBAO_ASR");
  if (!decrypted) throw new DoubaoError("DOUBAO_NOT_CONFIGURED", "请先配置豆包 ASR 的 API Key 或凭证，再重试；已保存的文件无需重新上传。", false);
  const authMode = decrypted.authMode === "LEGACY_APP_TOKEN" || (!decrypted.authMode && decrypted.appId)
    ? "LEGACY_APP_TOKEN"
    : "API_KEY";
  const parsed = doubaoRuntimeConfigSchema.safeParse({
    ...decrypted,
    authMode,
    baseUrl: decrypted.baseUrl ?? DOUBAO_DEFAULT_BASE_URL,
    resourceId: decrypted.resourceId ?? DOUBAO_DEFAULT_RESOURCE_ID,
  });
  if (!parsed.success) throw new DoubaoError("DOUBAO_NOT_CONFIGURED", "豆包 ASR Integration 配置无效。", false);
  const protocol: DoubaoProtocol = decrypted.protocol === "STREAMING_2_0" ? "STREAMING_2_0" : decrypted.protocol === "RECORDING_FILE_2_0" ? "RECORDING_FILE_2_0" : "FLASH";
  return { ...parsed.data, protocol };
}

async function loadWorkspaceTranscriptionConfig(workspaceId: string): Promise<WorkspaceTranscriptionConfig> {
  const status = await integrationService.getIntegrationStatus(workspaceId, "TRANSCRIPTION");
  if (status.status === "DISABLED") throw new LocalAsrError("LOCAL_ASR_NOT_RUNNING", "语音转写已被管理员禁用。", false);
  return parseProviderConfig("TRANSCRIPTION", status.publicConfig) as WorkspaceTranscriptionConfig;
}

async function loadBenchmarkProfile() {
  benchmarkProfilePromise ??= readFile(resolve(process.cwd(), "services/local-asr/model-profile.json"), "utf8")
    .catch(() => readFile(resolve(process.cwd(), "../../services/local-asr/model-profile.json"), "utf8"))
    .then((content) => JSON.parse(content) as LocalAsrBenchmarkProfile)
    .catch((error) => {
      benchmarkProfilePromise = undefined;
      throw new LocalAsrError("LOCAL_ASR_MODEL_NOT_INSTALLED", "本机模型策略尚未完成 benchmark。", false, {
        reason: error instanceof Error ? error.name : "UNKNOWN",
      });
    });
  return benchmarkProfilePromise;
}

function manualDevice(model: LocalAsrModel, profile: LocalAsrBenchmarkProfile, cudaAvailable: boolean): LocalAsrDevice {
  const profiled = [profile.FAST, profile.BALANCED, profile.QUALITY].find((selection) => selection.model === model);
  if (profiled?.device === "CUDA" && cudaAvailable) return "CUDA";
  return model === "FUN_ASR_NANO" ? "CUDA" : "CPU";
}

async function resolveLocalPlan(config: WorkspaceTranscriptionConfig): Promise<TranscriptionPlan> {
  const probe = new LocalAsrClient({ endpoint: config.endpoint, model: "SENSEVOICE_SMALL", device: "CPU" });
  const health = await probe.health();
  const profile = await loadBenchmarkProfile();
  if (config.selectionMode === "MANUAL") {
    const model = health.models.find((candidate) => candidate.key === config.manualModel);
    if (!model?.installed) throw new LocalAsrError("LOCAL_ASR_MODEL_NOT_INSTALLED", "手动指定的本地模型尚未安装。", false);
    if (!model.supported) throw new LocalAsrError("LOCAL_ASR_UNSUPPORTED_HARDWARE", "当前设备不支持手动指定的模型。", false);
    return {
      provider: "LOCAL_FUNASR",
      qualityMode: config.qualityMode,
      endpoint: config.endpoint,
      model: config.manualModel!,
      device: manualDevice(config.manualModel!, profile, health.hardware.cudaAvailable),
      fallbackToDoubao: config.fallbackToDoubao,
    };
  }
  const resolved = new TranscriptionQualityResolver().resolve({
    qualityMode: config.qualityMode,
    hardwareCapabilities: health.hardware,
    installedModels: health.models,
    benchmarkProfile: profile,
  });
  return {
    provider: resolved.resolvedProvider,
    qualityMode: config.qualityMode,
    endpoint: config.endpoint,
    model: resolved.resolvedModel,
    device: resolved.resolvedDevice,
    fallbackToDoubao: config.fallbackToDoubao,
  };
}

export async function resolveWorkspaceTranscriptionPlan(workspaceId: string, policy: "CLOUD_FIRST" | "WORKSPACE" = "CLOUD_FIRST"): Promise<TranscriptionPlan> {
  const config = await loadWorkspaceTranscriptionConfig(workspaceId);
  if (policy === "CLOUD_FIRST") {
    try {
      const doubao = await loadDoubaoConfig(workspaceId);
      return { provider: "DOUBAO_ASR", qualityMode: config.qualityMode, fallbackToDoubao: false, fallbackToLocal: true, protocol: doubao.flashResourceId ? "FLASH" : doubao.protocol };
    } catch (cloudError) {
      try {
        return { ...await resolveLocalPlan(config), fallbackToDoubao: false, fallbackUsed: true };
      } catch {
        // Preserve the actionable cloud failure instead of reporting only local downtime.
        throw cloudError;
      }
    }
  }
  if (config.source === "DOUBAO") {
    const doubao = await loadDoubaoConfig(workspaceId);
    return { provider: "DOUBAO_ASR", qualityMode: config.qualityMode, fallbackToDoubao: false, protocol: doubao.protocol };
  }
  try {
    return await resolveLocalPlan(config);
  } catch (error) {
    if (!config.fallbackToDoubao) throw error;
    await loadDoubaoConfig(workspaceId);
    return { provider: "DOUBAO_ASR", qualityMode: config.qualityMode, fallbackToDoubao: true, fallbackUsed: true };
  }
}

export async function requestSourceTranscription(input: {
  workspaceId: string;
  sourceItemId: string;
  requestedById: string;
  mediaAssetId?: string;
  videoAssetId?: string;
}) {
  const plan = await resolveWorkspaceTranscriptionPlan(input.workspaceId);
  const mediaAssetId = input.mediaAssetId ?? input.videoAssetId;
  const mediaAsset = await db.sourceAsset.findFirst({
    where: {
      id: mediaAssetId,
      ...(!mediaAssetId ? { sourceProvider: { not: "FFMPEG_VIDEO_PREVIEW" } } : {}),
      workspaceId: input.workspaceId,
      sourceItemId: input.sourceItemId,
      assetType: { in: ["VIDEO", "AUDIO"] },
      status: "STORED",
      storageKey: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!mediaAsset) throw new Error("ASR_MEDIA_NOT_AVAILABLE");
  const job = await db.$transaction(async (tx) => {
    // Serialize requests for this source before checking for an active job.
    const source = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SourceItem"
      WHERE "id" = ${input.sourceItemId} AND "workspaceId" = ${input.workspaceId}
      FOR UPDATE
    `;
    if (!source.length) throw new Error("SOURCE_NOT_FOUND");
    const active = await tx.ingestJob.findFirst({
      where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, jobType: "TRANSCRIBE", status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (active) throw new TranscriptionAlreadyRunningError(active.id);
    const previous = await tx.ingestJob.findFirst({
      where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, jobType: "TRANSCRIBE", status: "FAILED" },
      orderBy: { createdAt: "desc" }, select: { metadata: true },
    });
    const prior = object(previous?.metadata ?? null);
    await reserveExperienceUsage({ workspaceId: input.workspaceId, userId: input.requestedById, operation: "TRANSCRIBE" });
    const created = await tx.ingestJob.create({
      data: {
        workspaceId: input.workspaceId,
        sourceItemId: input.sourceItemId,
        requestedById: input.requestedById,
        jobType: "TRANSCRIBE",
        provider: plan.provider,
        providerMode: "REAL",
        status: "QUEUED",
        progress: 0,
        maxAttempts: 3,
        metadata: json({ progressStage: "QUEUED", mediaAssetId: mediaAsset.id, transcriptionPlan: plan,
          ...(prior.mediaAssetId === mediaAsset.id && prior.chunkCheckpoint ? { chunkCheckpoint: prior.chunkCheckpoint } : {}),
          ...(prior.mediaAssetId === mediaAsset.id && prior.chunkCheckpoints ? { chunkCheckpoints: prior.chunkCheckpoints } : {}),
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.requestedById,
        action: "transcription.queued",
        resourceType: "ingest_job",
        resourceId: created.id,
        metadata: json({ sourceItemId: input.sourceItemId, mediaAssetId: mediaAsset.id, provider: plan.provider, qualityMode: plan.qualityMode }),
      },
    });
    return created;
  });
  try {
    await enqueueTranscribeSource({
      jobId: job.id,
      workspaceId: input.workspaceId,
      sourceItemId: input.sourceItemId,
      mediaAssetId: mediaAsset.id,
      requestedById: input.requestedById,
    }, job.maxAttempts);
  } catch {
    await markDispatchPending(job.id, input.workspaceId);

  }
  return { job, created: true as const };
}

async function recordUsage(input: {
  record: TranscriptionRecord;
  attempt: number;
  provider: TranscriptionProviderName;
  durationMs: number;
  processingMs: number;
  success: boolean;
  providerRequestId?: string;
  metadata?: Record<string, unknown>;
  protocol?: DoubaoProtocol;
  errorCode?: string;
  partId?: string;
}) {
  await db.apiUsage.create({
    data: {
      workspaceId: input.record.workspaceId,
      userId: input.record.requestedById,
      provider: input.provider,
      operation: transcriptionUsageOperation(input.provider, input.protocol ?? (input.metadata?.protocol as DoubaoProtocol | undefined)),
      requestId: `${input.record.id}:${input.attempt}:${input.provider}${input.partId ? `:${input.partId}` : ""}`,
      providerRequestId: input.providerRequestId,
      success: input.success,
      units: 1,
      cost: input.provider === "LOCAL_FUNASR" ? 0 : null,
      metadata: json({
        sourceItemId: input.record.sourceItemId,
        durationMs: input.durationMs,
        audioDurationSeconds: Math.round(input.durationMs / 100) / 10,
        processingMs: input.processingMs,
        providerMode: "REAL",
        errorCode: input.errorCode,
        attempt: input.attempt,
        ...input.metadata,
      }),
    },
  });
}

export function transcriptionUsageOperation(provider: TranscriptionProviderName, protocol?: DoubaoProtocol) {
  if (provider === "LOCAL_FUNASR") return "TRANSCRIBE_LOCAL" as const;
  return protocol === "STREAMING_2_0" ? "TRANSCRIBE_STREAMING_2_0" as const : protocol === "RECORDING_FILE_2_0" ? "TRANSCRIBE_RECORDING_FILE_2_0" as const : "TRANSCRIBE_FLASH" as const;
}

export async function cleanupExpiredAsrAudio(now = Date.now(), workspaceId?: string) {
  const retentionHours = readAsrAudioRetentionHours();
  const cutoff = new Date(now - retentionHours * 60 * 60 * 1_000);
  const assets = await db.sourceAsset.findMany({
    where: { ...(workspaceId ? { workspaceId } : {}), assetType: "AUDIO", storageKey: { not: null }, sourceItem: { ingestJobs: { none: { jobType: "TRANSCRIBE", status: { in: ["QUEUED", "RUNNING"] } } } }, OR: [{ sourceProvider: "FFMPEG", sourceItem: { sourceType: "VIDEO" }, status: "STORED", storedAt: { lt: cutoff } }, { sourceProvider: "VOICE_INPUT", sourceItem: { status: "ARCHIVED" }, status: { in: ["STORED", "DOWNLOADING"] }, storedAt: { lt: new Date(now - 10 * 60_000) } }] },
    select: { id: true, workspaceId: true, sourceItemId: true, storageKey: true, metadata: true, sourceProvider: true },
    take: 100,
  });
  const storage = assets.length > 0 ? getStorageProvider() : null;
  let cleaned = 0;
  for (const asset of assets) {
    if (!asset.storageKey || !storage) continue;
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata as Record<string, unknown> : null;
    if (asset.sourceProvider !== "VOICE_INPUT" && (typeof metadata?.derivedFromAssetId !== "string" || !metadata.derivedFromAssetId)) continue;
    try {
      await storage.delete(asset.storageKey, { workspaceId: asset.workspaceId, sourceItemId: asset.sourceItemId, assetId: asset.id });
      await db.sourceAsset.update({ where: { id: asset.id }, data: { status: "FAILED", storageKey: null, sizeBytes: null, storedAt: null } });
      if (asset.sourceProvider === "VOICE_INPUT") await db.sourceItem.deleteMany({ where: { id: asset.sourceItemId, workspaceId: asset.workspaceId, sourceProvider: "VOICE_INPUT", status: "ARCHIVED" } });
      cleaned += 1;
    } catch {
      // Keep STORED when physical deletion fails so the asset remains retryable and discoverable.
      console.warn("ASR_AUDIO_CLEANUP_FAILED", { assetId: asset.id });
    }
  }
  return { scanned: assets.length, cleaned };
}

async function localAudioInput(input: { signedUrl: string; extractedPath?: string }): Promise<TranscriptionInput> {
  if (input.extractedPath) return { audio: { mode: "BINARY_DATA", data: await readFile(input.extractedPath) }, contentType: "audio/mpeg" };
  const response = await fetch(input.signedUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new LocalAsrError("LOCAL_ASR_TRANSCRIPTION_FAILED", "无法读取已保存音频。", true);
  return { audio: { mode: "BINARY_DATA", data: new Uint8Array(await response.arrayBuffer()) }, contentType: "audio/mpeg" };
}

async function doubaoAudioInput(input: { signedUrl: string; sizeBytes: number; extractedPath?: string }): Promise<TranscriptionInput> {
  try {
    await resolvePublicAddress(input.signedUrl);
    return { audio: { mode: "REMOTE_URL", url: input.signedUrl }, contentType: "audio/mpeg" };
  } catch {
    if (input.sizeBytes > MAX_ASR_BINARY_DATA_BYTES) {
      throw new DoubaoError("ASR_AUDIO_NOT_PUBLICLY_REACHABLE", "音频地址不可公网访问，且文件不适合二进制上传。", false);
    }
    return localAudioInput(input);
  }
}

function durationFromMetadata(metadata: Prisma.JsonValue | null) {
  const value = object(metadata).durationMs;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function offlineTranscriptionTimeout(protocol: DoubaoProtocol | "LOCAL", durationMs: number) {
  if (protocol === "STREAMING_2_0") return Math.min(60 * 60_000, Math.max(120_000, durationMs * 1.5 + 60_000));
  if (protocol === "FLASH") return Math.min(20 * 60_000, Math.max(120_000, durationMs / 4 + 60_000));
  return Math.min(60 * 60_000, Math.max(8 * 60_000, durationMs * 1.5 + 60_000));
}

async function downloadAudioForChunks(signedUrl: string, expectedBytes: number) {
  const directory = await mkdtemp(join(tmpdir(), "content-center-asr-chunks-"));
  const path = join(directory, "audio");
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    const response = await fetch(signedUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "无法读取已保存音频。");
    let bytes = 0;
    const bounded = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > expectedBytes + 1024 ? new MediaProcessorError("ASR_AUDIO_TOO_LARGE", "已保存音频大小与记录不一致。") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), bounded, createWriteStream(path), { signal: AbortSignal.timeout(120_000) });
    if (!bytes || bytes !== expectedBytes) throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "已保存音频大小与记录不一致。");
    return { path, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

async function transcribeWithProvider(input: {
  plan: TranscriptionPlan;
  providerInput: TranscriptionInput;
  record: TranscriptionRecord;
  attempt: number;
  durationMs: number;
  partId?: string;
  signal?: AbortSignal;
}): Promise<{
  transcript: { language?: string; durationMs?: number; fullText: string; segments: Array<{ startMs: number; endMs: number; text: string }> };
  provider: TranscriptionProviderName;
  metadata: Record<string, unknown>;
  fallbackUsed?: boolean;
}> {
  if (input.plan.provider === "LOCAL_FUNASR") {
    if (!input.plan.endpoint || !input.plan.model || !input.plan.device) {
      throw new LocalAsrError("LOCAL_ASR_INVALID_RESPONSE", "转写任务缺少本地模型解析结果。", false);
    }
    const provider = new LocalFunASRTranscriptionProvider(new LocalAsrClient({
      endpoint: input.plan.endpoint,
      model: input.plan.model,
      device: input.plan.device,
      language: "auto",
    }, { timeoutMs: offlineTranscriptionTimeout("LOCAL", input.durationMs), signal: input.signal }));
    const started = Date.now();
    try {
      const transcript = (await provider.transcribe(input.providerInput)).data;
      const metadata = provider.getLastRequestMetadata();
      await recordUsage({
        record: input.record,
        attempt: input.attempt,
        provider: "LOCAL_FUNASR",
        durationMs: input.durationMs,
        processingMs: typeof metadata.processingMs === "number" ? metadata.processingMs : Date.now() - started,
        success: true,
        metadata,
        partId: input.partId,
      });
      return { transcript, provider: "LOCAL_FUNASR", metadata };
    } catch (error) {
      await recordUsage({
        record: input.record,
        attempt: input.attempt,
        provider: "LOCAL_FUNASR",
        durationMs: input.durationMs,
        processingMs: Date.now() - started,
        success: false,
        errorCode: error instanceof LocalAsrError ? error.code : "LOCAL_ASR_TRANSCRIPTION_FAILED",
        partId: input.partId,
      });
      if (!input.plan.fallbackToDoubao) throw error;
      const fallback = await transcribeWithProvider({
        ...input,
        plan: { provider: "DOUBAO_ASR", qualityMode: input.plan.qualityMode, fallbackToDoubao: false, fallbackUsed: true },
      });
      return { ...fallback, fallbackUsed: true };
    }
  }

  const configured = await loadDoubaoConfig(input.record.workspaceId);
  const protocol = input.plan.protocol ?? configured.protocol;
  const config = protocol === "FLASH" && configured.protocol !== "FLASH" && configured.flashResourceId
    ? { ...configured, resourceId: String(configured.flashResourceId) } : configured;
  const timeoutMs = offlineTranscriptionTimeout(protocol, input.durationMs);
  const provider = protocol === "STREAMING_2_0"
    ? new DoubaoStreamingTranscriptionProvider(new DoubaoStreamingClient(config, { overallTimeoutMs: timeoutMs, signal: input.signal }))
    : protocol === "RECORDING_FILE_2_0"
    ? new DoubaoRecordingFileTranscriptionProvider(new DoubaoRecordingFileClient(config, { overallTimeoutMs: timeoutMs, signal: input.signal }))
    : new DoubaoTranscriptionProvider(new DoubaoClient(config, { timeoutMs, signal: input.signal }));
  const started = Date.now();
  try {
    const transcript = (await provider.transcribe(input.providerInput)).data;
    const metadata = provider.getLastRequestMetadata();
    await recordUsage({
      record: input.record,
      attempt: input.attempt,
      provider: "DOUBAO_ASR",
      durationMs: input.durationMs,
      processingMs: Date.now() - started,
      success: true,
      protocol,
      providerRequestId: metadata.providerRequestId,
      metadata: { ...metadata, protocol },
      partId: input.partId,
    });
    return { transcript, provider: "DOUBAO_ASR", metadata: { ...metadata, protocol } };
  } catch (error) {
    const errorMetadata = doubaoErrorMetadata(error);
    const metadata = provider.getLastRequestMetadata();
    await recordUsage({
      record: input.record,
      attempt: input.attempt,
      provider: "DOUBAO_ASR",
      durationMs: input.durationMs,
      processingMs: Date.now() - started,
      success: false,
      protocol,
      providerRequestId: metadata.providerRequestId,
      metadata: { ...metadata, ...errorMetadata },
      errorCode: error instanceof DoubaoError ? error.code : "DOUBAO_INVALID_RESPONSE",
      partId: input.partId,
    });
    throw error;
  }
}

export async function processTranscribeSourceJob(job: Job<TranscribeSourcePayload>) {
  const startedAt = new Date();
  const record = await db.ingestJob.findFirst({
    where: {
      id: job.data.jobId,
      workspaceId: job.data.workspaceId,
      sourceItemId: job.data.sourceItemId,
      requestedById: job.data.requestedById,
      jobType: "TRANSCRIBE",
    },
    include: { sourceItem: { include: { assets: { where: { workspaceId: job.data.workspaceId } } } } },
  });
  if (!record) throw new UnrecoverableError("Transcription job scope mismatch");
  if (record.sourceItem.workspaceId !== record.workspaceId) throw new UnrecoverableError("Transcription parent workspace mismatch");
  if (record.status === "SUCCEEDED") return { status: "already-succeeded" as const };
  if (record.status === "CANCELLED" || record.sourceItem.status === "ARCHIVED") {
    throw new UnrecoverableError("Transcription job is no longer runnable");
  }

  const mediaAssetId = job.data.mediaAssetId ?? job.data.videoAssetId;
  if (!mediaAssetId) throw new UnrecoverableError("Transcription media asset is missing");
  const attempt = Math.max(job.attemptsMade + 1, record.attempt + 1);
  let plan: TranscriptionPlan = { provider: "DOUBAO_ASR", qualityMode: "BALANCED", fallbackToDoubao: false };
  let cleanup: (() => Promise<void>) | undefined;
  let jobMetadata = { ...object(record.metadata) };
  const controller = new AbortController();
  const executionSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(7 * 60 * 60_000)]);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let claimed = false;
  try {
    plan = await resolveWorkspaceTranscriptionPlan(record.workspaceId);
    await db.$transaction([
      db.ingestJob.update({
        where: { id: record.id },
        data: {
          provider: plan.provider,
          status: "RUNNING",
          attempt,
          progress: 5,
          startedAt,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          metadata: json({ ...jobMetadata, progressStage: "EXTRACTING_AUDIO", mediaAssetId, transcriptionPlan: plan }),
        },
      }),
      db.auditLog.create({
        data: {
          workspaceId: record.workspaceId,
          userId: record.requestedById,
          action: "transcription.started",
          resourceType: "ingest_job",
          resourceId: record.id,
          metadata: json({ sourceItemId: record.sourceItemId, provider: plan.provider, qualityMode: plan.qualityMode, attempt }),
        },
      }),
    ]);
    claimed = true;
    let heartbeatRunning = false;
    heartbeat = setInterval(() => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;
      void db.ingestJob.updateMany({ where: { id: record.id, workspaceId: record.workspaceId, status: "RUNNING", attempt }, data: { updatedAt: new Date() } })
        .then(updated => { if (!updated.count) controller.abort(); })
        .catch(() => console.warn("TRANSCRIPTION_HEARTBEAT_FAILED"))
        .finally(() => { heartbeatRunning = false; });
    }, 60_000);
    heartbeat.unref();
    const media = record.sourceItem.assets.find((asset) =>
      asset.id === mediaAssetId && (asset.assetType === "VIDEO" || asset.assetType === "AUDIO") && asset.status === "STORED" && asset.storageKey,
    );
    if (!media?.storageKey) throw new Error("ASR_MEDIA_NOT_AVAILABLE");

    const storage = getStorageProvider();
    const processor = new FFmpegMediaProcessor();
    const mediaIsAudio = media.assetType === "AUDIO";
    const originalVideoId = !mediaIsAudio ? media.id : typeof object(media.metadata).derivedFromAssetId === "string" ? object(media.metadata).derivedFromAssetId as string : undefined;
    if (originalVideoId) {
      await updateProgress(record.id, 20, "PREPARING_VIDEO_PREVIEW", plan, jobMetadata);
      await ensureVideoPreview({ workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, assetId: originalVideoId });
    }
    if (!mediaIsAudio || !durationFromMetadata(media.metadata)) await processor.checkAvailability();
    let audio = mediaIsAudio ? media : record.sourceItem.assets
      .filter((asset) => asset.assetType === "AUDIO" && asset.status === "STORED" && asset.storageKey && object(asset.metadata).derivedFromAssetId === media.id)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    let extractedPath: string | undefined;
    let durationMs = audio ? durationFromMetadata(audio.metadata) : undefined;

    if (!audio?.storageKey && !mediaIsAudio) {
      const pendingAudio = await db.sourceAsset.create({
        data: {
          workspaceId: record.workspaceId,
          sourceItemId: record.sourceItemId,
          assetType: "AUDIO",
          sourceProvider: "FFMPEG",
          remoteUrl: null,
          status: "DOWNLOADING",
          metadata: { derivedFromAssetId: media.id },
        },
      });
      await db.auditLog.create({
        data: {
          workspaceId: record.workspaceId,
          userId: record.requestedById,
          action: "source_asset.audio_extraction_started",
          resourceType: "source_asset",
          resourceId: pendingAudio.id,
            metadata: { sourceItemId: record.sourceItemId, derivedFromAssetId: media.id },
        },
      });
      try {
        const videoUrl = (await storage.getSignedUrl(media.storageKey, 15 * 60, {
          assetScope: { workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, assetId: media.id },
        })).data.url;
        const extracted = await processor.extractAudio(videoUrl, { limits: "NONE" });
        cleanup = extracted.cleanup;
        extractedPath = extracted.path;
        durationMs = extracted.durationMs;
        await updateProgress(record.id, 35, "UPLOADING_AUDIO", plan, jobMetadata);
        const storageKey = buildSourceAssetObjectKey({
          workspaceId: record.workspaceId,
          sourceItemId: record.sourceItemId,
          assetId: pendingAudio.id,
          assetType: "AUDIO",
          mimeType: "audio/mpeg",
        });
        await storage.upload({
          key: storageKey,
          body: createReadStream(extracted.path),
          contentType: "audio/mpeg",
          contentLength: extracted.sizeBytes,
          assetScope: { workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, assetId: pendingAudio.id },
        });
        audio = await db.sourceAsset.update({
          where: { id: pendingAudio.id },
          data: {
            status: "STORED",
            storageKey,
            mimeType: "audio/mpeg",
            sizeBytes: BigInt(extracted.sizeBytes),
            storedAt: new Date(),
            metadata: { derivedFromAssetId: media.id, durationMs: extracted.durationMs },
          },
        });
        await db.auditLog.create({
          data: {
            workspaceId: record.workspaceId,
            userId: record.requestedById,
            action: "source_asset.audio_stored",
            resourceType: "source_asset",
            resourceId: audio.id,
            metadata: { sourceItemId: record.sourceItemId, sizeBytes: extracted.sizeBytes, durationMs: extracted.durationMs },
          },
        });
      } catch (error) {
        await db.sourceAsset.update({ where: { id: pendingAudio.id }, data: { status: "FAILED", storageKey: null } });
        throw error;
      }
    }

    if (!audio?.storageKey || audio.sizeBytes === null) {
      throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "已保存音频缺少必要元数据。");
    }
    durationMs ??= durationFromMetadata(audio.metadata);
    if (durationMs === undefined && mediaIsAudio) {
      const probeUrl = (await storage.getSignedUrl(media.storageKey, 15 * 60, { assetScope: { workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, assetId: media.id } })).data.url;
      durationMs = await processor.probeDuration(probeUrl);
    }
    if (durationMs === undefined) throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "已保存音频缺少时长信息。");
    const transcriptionAudio = audio;
    const transcriptionDurationMs = durationMs;
    const sizeBytes = Number(audio.sizeBytes);
    const runProvider = async () => {
      executionSignal.throwIfAborted();
      const signedUrl = (await storage.getSignedUrl(transcriptionAudio.storageKey!, ASR_AUDIO_SIGNED_URL_TTL_SECONDS, {
        assetScope: { workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, assetId: transcriptionAudio.id },
        purpose: plan.provider === "DOUBAO_ASR" ? "doubao" : "browser",
      })).data.url;
      const chunked = plan.protocol !== "RECORDING_FILE_2_0" && (
        plan.protocol === "FLASH" ? sizeBytes > MAX_ASR_BINARY_DATA_BYTES || transcriptionDurationMs > 2 * 60 * 60_000
          : transcriptionDurationMs > TRANSCRIPTION_CHUNK_MS);
      if (chunked) {
        const chunks = audioChunks(transcriptionDurationMs);
        const config = plan.provider === "DOUBAO_ASR" ? await loadDoubaoConfig(record.workspaceId) : undefined;
        const key = checkpointKey({ workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, audioAssetId: transcriptionAudio.id,
          durationMs: transcriptionDurationMs, sizeBytes, route: [plan.provider, plan.protocol, plan.model, plan.device, plan.endpoint, config?.baseUrl,
            plan.protocol === "FLASH" && config?.protocol !== "FLASH" ? config?.flashResourceId : config?.resourceId, config?.boostingTableId, config?.boostingTableName] });
        const checkpoints = jobMetadata.chunkCheckpoints && typeof jobMetadata.chunkCheckpoints === "object" && !Array.isArray(jobMetadata.chunkCheckpoints)
          ? jobMetadata.chunkCheckpoints as Record<string, unknown> : {};
        const checkpoint = readChunkCheckpoint(checkpoints[key] ?? jobMetadata.chunkCheckpoint, key, chunks);
        let localPath = extractedPath;
        // Read the saved audio once; avoid loading a multi-hour file entirely into RAM.
        if (!localPath && Object.keys(checkpoint.chunks).length < chunks.length) {
          const downloaded = await downloadAudioForChunks(signedUrl, sizeBytes);
          const previousCleanup = cleanup;
          cleanup = async () => { try { await downloaded.cleanup(); } finally { await previousCleanup?.(); } };
          localPath = downloaded.path;
        }
        const transcript = await transcribeChunks({ durationMs: transcriptionDurationMs, checkpoint, concurrency: plan.provider === "LOCAL_FUNASR" ? 1 : 2,
          persist: async (value, progress) => {
            jobMetadata = { ...jobMetadata, mediaAssetId, audioAssetId: transcriptionAudio.id, chunkCheckpoint: value,
              chunkCheckpoints: { ...checkpoints, [key]: value }, chunkProgress: progress };
            const updated = await db.ingestJob.updateMany({ where: { id: record.id, workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, status: "RUNNING", attempt },
              data: { progress: 40 + Math.floor(45 * progress.completed / progress.total), metadata: json({ ...jobMetadata, progressStage: "TRANSCRIBING", transcriptionPlan: plan }) } });
            if (!updated.count) throw new UnrecoverableError("Transcription execution was superseded or stopped");
          },
          recognize: async chunk => {
            executionSignal.throwIfAborted();
            const slice = await processor.extractAudio(localPath!, { limits: "NONE", localOnly: true, startMs: chunk.startMs, maxDurationMs: chunk.endMs - chunk.startMs });
            try {
              const providerInput = await localAudioInput({ signedUrl, extractedPath: slice.path });
              return (await transcribeWithProvider({ plan, providerInput, record, attempt, durationMs: chunk.endMs - chunk.startMs, partId: `chunk-${chunk.index}-${randomUUID()}`, signal: executionSignal })).transcript;
            } finally { await slice.cleanup(); }
          },
        });
        return { transcript, provider: plan.provider, metadata: { protocol: plan.protocol, chunkCount: chunks.length, processingMs: Date.now() - startedAt.getTime() }, fallbackUsed: plan.fallbackUsed };
      }
      if (plan.provider === "DOUBAO_ASR" && plan.protocol === "FLASH") assertFlashAudioLimits({ sizeBytes, durationMs: transcriptionDurationMs });
      if (plan.protocol === "STREAMING_2_0" && !extractedPath && transcriptionAudio.sourceProvider !== "FFMPEG") {
        // Original audio uploads may use another codec/rate/bitrate. Preserve
        // the saved original and stream the same controlled encoding as video.
        const normalized = await processor.extractAudio(signedUrl, { limits: "NONE" });
        const previousCleanup = cleanup;
        cleanup = async () => { try { await normalized.cleanup(); } finally { await previousCleanup?.(); } };
        extractedPath = normalized.path;
      }
      const providerInput = plan.provider === "LOCAL_FUNASR" || plan.protocol === "STREAMING_2_0"
        ? await localAudioInput({ signedUrl, extractedPath })
        : await doubaoAudioInput({ signedUrl, sizeBytes, extractedPath });
      await updateProgress(record.id, 65, "TRANSCRIBING", plan, jobMetadata);
      return transcribeWithProvider({ plan, providerInput, record, attempt, durationMs: transcriptionDurationMs, signal: executionSignal });
    };
    let result: Awaited<ReturnType<typeof transcribeWithProvider>>;
    const runLocalFallback = async (cloudError: unknown) => {
      // Keep completed cloud chunks; a whole-file provider fallback would redo them.
      if (cloudError instanceof TranscriptionChunkError && cloudError.completed > 0) throw cloudError;
      if (plan.provider !== "DOUBAO_ASR" || !plan.fallbackToLocal) throw cloudError;
      try {
        const config = await loadWorkspaceTranscriptionConfig(record.workspaceId);
        plan = { ...await resolveLocalPlan(config), fallbackToDoubao: false, fallbackUsed: true };
      } catch { throw cloudError; }
      return runProvider();
    };
    try {
      result = await runProvider();
    } catch (cloudError) {
      if (plan.provider === "DOUBAO_ASR" && plan.protocol === "FLASH" &&
        (cloudError instanceof DoubaoError || cloudError instanceof TranscriptionChunkError) && cloudError.code === "DOUBAO_PERMISSION_DENIED") {
        const configured = await loadDoubaoConfig(record.workspaceId);
        if (configured.flashResourceId && configured.protocol !== "FLASH") {
          plan = { ...plan, protocol: configured.protocol, fallbackUsed: true };
          try { result = await runProvider(); }
          catch (fallbackError) { result = await runLocalFallback(fallbackError); }
        } else result = await runLocalFallback(cloudError);
      } else {
        result = await runLocalFallback(cloudError);
      }
    }

    await updateProgress(record.id, 90, "PERSISTING", plan, jobMetadata);
    const finishedAt = new Date();
    const transcriptMetadata = {
      method: result.provider === "LOCAL_FUNASR" ? "LOCAL" : "DOUBAO",
      methodLabel: result.provider === "LOCAL_FUNASR" ? "本地转写" : "豆包云端",
      qualityMode: plan.qualityMode,
      processingMs: result.metadata.processingMs,
      fallbackUsed: Boolean(result.fallbackUsed || plan.fallbackUsed),
      audioRetentionHours: readAsrAudioRetentionHours(),
      technical: result.metadata,
    };
    await db.$transaction(async (tx) => {
      const current = await tx.ingestJob.findFirst({ where: { id: record.id, workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, status: "RUNNING", attempt }, select: { id: true } });
      if (!current) throw new UnrecoverableError("Transcription execution was superseded or stopped");
      await tx.transcript.upsert({
        where: { sourceItemId: record.sourceItemId },
        create: {
          workspaceId: record.workspaceId,
          sourceItemId: record.sourceItemId,
          provider: result.provider,
          providerMode: "REAL",
          language: result.transcript.language,
          durationMs: result.transcript.durationMs ?? durationMs,
          fullText: result.transcript.fullText,
          segments: json(result.transcript.segments),
          metadata: json(transcriptMetadata),
        },
        update: {
          provider: result.provider,
          providerMode: "REAL",
          language: result.transcript.language,
          durationMs: result.transcript.durationMs ?? durationMs,
          fullText: result.transcript.fullText,
          segments: json(result.transcript.segments),
          metadata: json(transcriptMetadata),
        },
      });
      await tx.ingestJob.update({
        where: { id: record.id },
        data: {
          provider: result.provider,
          status: "SUCCEEDED",
          progress: 100,
          metadata: json({ ...jobMetadata, progressStage: "SUCCEEDED", mediaAssetId: media.id, audioAssetId: audio.id, transcriptionPlan: plan, transcriptMetadata }),
          finishedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: record.workspaceId,
          userId: record.requestedById,
          action: "transcription.succeeded",
          resourceType: "ingest_job",
          resourceId: record.id,
          metadata: json({ sourceItemId: record.sourceItemId, provider: result.provider, providerMode: "REAL", attempt, durationMs, audioAssetId: audio.id, qualityMode: plan.qualityMode }),
        },
      });
    });
    return { status: "ok" as const, sourceItemId: record.sourceItemId };
  } catch (error) {
    const failure = publicFailure(error);
    const willRetry = failure.retryable && attempt < record.maxAttempts;
    await db.$transaction([
      db.ingestJob.updateMany({
        where: { id: record.id, workspaceId: record.workspaceId, status: { in: ["QUEUED", "RUNNING"] }, attempt: claimed ? attempt : record.attempt },
        data: {
          status: willRetry ? "QUEUED" : "FAILED",
          progress: 0,
          errorCode: failure.code,
          errorMessage: failure.message,
          finishedAt: willRetry ? null : new Date(),
        },
      }),
      db.auditLog.create({
        data: {
          workspaceId: record.workspaceId,
          userId: record.requestedById,
          action: "transcription.failed",
          resourceType: "ingest_job",
          resourceId: record.id,
          metadata: json({ sourceItemId: record.sourceItemId, provider: plan.provider, attempt, retrying: willRetry, errorCode: failure.code }),
        },
      }),
    ]);
    if (!failure.retryable) throw new UnrecoverableError(`${failure.code}: ${failure.message}`);
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    controller.abort();
    await cleanup?.();
  }
}
