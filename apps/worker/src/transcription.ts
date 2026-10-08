import { markDispatchPending } from "./job-recovery";
import { reserveExperienceUsage } from "./experience-limits";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ASR_AUDIO_SIGNED_URL_TTL_SECONDS, MAX_ASR_BINARY_DATA_BYTES, readAsrAudioRetentionHours } from "@content-center/config";
import { db, type Prisma } from "@content-center/db";
import {
  DOUBAO_DEFAULT_BASE_URL,
  DOUBAO_DEFAULT_RESOURCE_ID,
  IntegrationService,
  parseProviderConfig,
} from "@content-center/integrations";
import {
  assertFlashAudioLimits,
  DoubaoClient,
  DoubaoError,
  DoubaoRecordingFileClient,
  DoubaoRecordingFileTranscriptionProvider,
  DoubaoTranscriptionProvider,
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

type ProgressStage = "QUEUED" | "EXTRACTING_AUDIO" | "UPLOADING_AUDIO" | "TRANSCRIBING" | "PERSISTING" | "SUCCEEDED";
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
  protocol?: "FLASH" | "RECORDING_FILE_2_0";
};

const integrationService = new IntegrationService();
let benchmarkProfilePromise: Promise<LocalAsrBenchmarkProfile> | undefined;

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
  if (error instanceof DoubaoError || error instanceof LocalAsrError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof MediaProcessorError) return { code: error.code, message: error.message, retryable: false };
  if (error instanceof Error && (error.message === "ASR_VIDEO_NOT_AVAILABLE" || error.message === "ASR_MEDIA_NOT_AVAILABLE")) {
    return { code: "ASR_MEDIA_NOT_AVAILABLE", message: "没有可转写的已保存媒体。", retryable: false };
  }
  return { code: "INTERNAL_ERROR", message: "视频转写失败。", retryable: false };
}

async function updateProgress(jobId: string, amount: number, stage: ProgressStage, plan?: TranscriptionPlan) {
  await db.ingestJob.update({
    where: { id: jobId },
    data: { progress: amount, metadata: json({ progressStage: stage, ...(plan ? { transcriptionPlan: plan } : {}) }) },
  });
}

async function loadDoubaoConfig(workspaceId: string) {
  const status = await integrationService.getIntegrationStatus(workspaceId, "DOUBAO_ASR");
  if (status.status === "DISABLED") throw new DoubaoError("DOUBAO_DISABLED", "豆包 ASR 已禁用。", false);
  if (status.status !== "CONFIGURED") throw new DoubaoError("DOUBAO_NOT_CONFIGURED", "请先配置豆包 ASR。", false);
  const decrypted = await integrationService.getDecryptedIntegrationConfig(workspaceId, "DOUBAO_ASR");
  if (!decrypted) throw new DoubaoError("DOUBAO_NOT_CONFIGURED", "请先配置豆包 ASR。", false);
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
  return { ...parsed.data, protocol: decrypted.protocol === "RECORDING_FILE_2_0" ? "RECORDING_FILE_2_0" as const : "FLASH" as const };
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

export async function resolveWorkspaceTranscriptionPlan(workspaceId: string): Promise<TranscriptionPlan> {
  const config = await loadWorkspaceTranscriptionConfig(workspaceId);
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
        metadata: json({ progressStage: "QUEUED", mediaAssetId: mediaAsset.id, transcriptionPlan: plan }),
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
  protocol?: "FLASH" | "RECORDING_FILE_2_0";
  errorCode?: string;
}) {
  await db.apiUsage.create({
    data: {
      workspaceId: input.record.workspaceId,
      userId: input.record.requestedById,
      provider: input.provider,
      operation: transcriptionUsageOperation(input.provider, input.protocol ?? (input.metadata?.protocol as "FLASH" | "RECORDING_FILE_2_0" | undefined)),
      requestId: `${input.record.id}:${input.attempt}:${input.provider}`,
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

export function transcriptionUsageOperation(provider: TranscriptionProviderName, protocol?: "FLASH" | "RECORDING_FILE_2_0") {
  if (provider === "LOCAL_FUNASR") return "TRANSCRIBE_LOCAL" as const;
  return protocol === "RECORDING_FILE_2_0" ? "TRANSCRIBE_RECORDING_FILE_2_0" as const : "TRANSCRIBE_FLASH" as const;
}

export async function cleanupExpiredAsrAudio(now = Date.now(), workspaceId?: string) {
  const retentionHours = readAsrAudioRetentionHours();
  const cutoff = new Date(now - retentionHours * 60 * 60 * 1_000);
  const assets = await db.sourceAsset.findMany({
    where: { ...(workspaceId ? { workspaceId } : {}), assetType: "AUDIO", sourceProvider: "FFMPEG", sourceItem: { sourceType: "VIDEO" }, status: "STORED", storageKey: { not: null }, storedAt: { lt: cutoff } },
    select: { id: true, workspaceId: true, sourceItemId: true, storageKey: true, metadata: true },
    take: 100,
  });
  const storage = assets.length > 0 ? getStorageProvider() : null;
  let cleaned = 0;
  for (const asset of assets) {
    if (!asset.storageKey || !storage) continue;
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata as Record<string, unknown> : null;
    if (typeof metadata?.derivedFromAssetId !== "string" || !metadata.derivedFromAssetId) continue;
    try {
      await storage.delete(asset.storageKey, { workspaceId: asset.workspaceId, sourceItemId: asset.sourceItemId, assetId: asset.id });
      await db.sourceAsset.update({ where: { id: asset.id }, data: { status: "FAILED", storageKey: null, sizeBytes: null, storedAt: null } });
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

function planFromRecord(record: TranscriptionRecord): TranscriptionPlan | null {
  const candidate = object(record.metadata).transcriptionPlan;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as TranscriptionPlan : null;
}

async function transcribeWithProvider(input: {
  plan: TranscriptionPlan;
  providerInput: TranscriptionInput;
  record: TranscriptionRecord;
  attempt: number;
  durationMs: number;
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
    }));
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
      });
      if (!input.plan.fallbackToDoubao) throw error;
      const fallback = await transcribeWithProvider({
        ...input,
        plan: { provider: "DOUBAO_ASR", qualityMode: input.plan.qualityMode, fallbackToDoubao: false, fallbackUsed: true },
      });
      return { ...fallback, fallbackUsed: true };
    }
  }

  const config = await loadDoubaoConfig(input.record.workspaceId);
  const recordingFile = input.plan.protocol === "RECORDING_FILE_2_0" || config.protocol === "RECORDING_FILE_2_0";
  const provider = recordingFile
    ? new DoubaoRecordingFileTranscriptionProvider(new DoubaoRecordingFileClient(config))
    : new DoubaoTranscriptionProvider(new DoubaoClient(config));
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
      protocol: recordingFile ? "RECORDING_FILE_2_0" : "FLASH",
      providerRequestId: metadata.providerRequestId,
      metadata: { ...metadata, protocol: recordingFile ? "RECORDING_FILE_2_0" : "FLASH" },
    });
    return { transcript, provider: "DOUBAO_ASR", metadata };
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
      protocol: recordingFile ? "RECORDING_FILE_2_0" : "FLASH",
      providerRequestId: metadata.providerRequestId,
      metadata: { ...metadata, ...errorMetadata },
      errorCode: error instanceof DoubaoError ? error.code : "DOUBAO_INVALID_RESPONSE",
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
    include: { sourceItem: { include: { assets: true } } },
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
  const plan = planFromRecord(record) ?? (record.provider === "DOUBAO_ASR"
    ? { provider: "DOUBAO_ASR" as const, qualityMode: "BALANCED" as const, fallbackToDoubao: false }
    : await resolveWorkspaceTranscriptionPlan(record.workspaceId));
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
        metadata: json({ progressStage: "EXTRACTING_AUDIO", mediaAssetId, transcriptionPlan: plan }),
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

  let cleanup: (() => Promise<void>) | undefined;
  try {
    const media = record.sourceItem.assets.find((asset) =>
      asset.id === mediaAssetId && (asset.assetType === "VIDEO" || asset.assetType === "AUDIO") && asset.status === "STORED" && asset.storageKey,
    );
    if (!media?.storageKey) throw new Error("ASR_MEDIA_NOT_AVAILABLE");

    const storage = getStorageProvider();
    const processor = new FFmpegMediaProcessor();
    const mediaIsAudio = media.assetType === "AUDIO";
    if (!mediaIsAudio || !durationFromMetadata(media.metadata)) await processor.checkAvailability();
    let audio = mediaIsAudio ? media : record.sourceItem.assets
      .filter((asset) => asset.assetType === "AUDIO" && asset.status === "STORED" && asset.storageKey)
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
        const extracted = await processor.extractAudio(videoUrl, { limits: plan.provider === "DOUBAO_ASR" && plan.protocol !== "RECORDING_FILE_2_0" ? "DOUBAO_FLASH" : "NONE" });
        cleanup = extracted.cleanup;
        extractedPath = extracted.path;
        durationMs = extracted.durationMs;
        await updateProgress(record.id, 35, "UPLOADING_AUDIO", plan);
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
    const sizeBytes = Number(audio.sizeBytes);
    if (plan.provider === "DOUBAO_ASR" && plan.protocol !== "RECORDING_FILE_2_0") assertFlashAudioLimits({ sizeBytes, durationMs });
    const signedUrl = (await storage.getSignedUrl(audio.storageKey, ASR_AUDIO_SIGNED_URL_TTL_SECONDS, {
      assetScope: { workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, assetId: audio.id },
      purpose: plan.provider === "DOUBAO_ASR" ? "doubao" : "browser",
    })).data.url;
    const providerInput = plan.provider === "LOCAL_FUNASR"
      ? await localAudioInput({ signedUrl, extractedPath })
      : await doubaoAudioInput({ signedUrl, sizeBytes, extractedPath });
    await updateProgress(record.id, 65, "TRANSCRIBING", plan);
    const result = await transcribeWithProvider({ plan, providerInput, record, attempt, durationMs });

    await updateProgress(record.id, 90, "PERSISTING", plan);
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
          metadata: json({ progressStage: "SUCCEEDED", mediaAssetId: media.id, audioAssetId: audio.id, transcriptionPlan: plan, transcriptMetadata }),
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
      db.ingestJob.update({
        where: { id: record.id },
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
    await cleanup?.();
  }
}
