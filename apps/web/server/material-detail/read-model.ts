import "server-only";
import { expireMaterialProcessing } from "@content-center/worker/job-recovery";

import { db, findSourceForUser } from "@content-center/db";
import { sourceCapabilities, type SourceCapability } from "@content-center/core";
import { resolveWorkspaceTranscriptionPlan } from "@content-center/worker/transcription";
import { getStorageProvider, readSourceMetadataEnvelope, type SourceExternalMetrics } from "@content-center/providers";
import { getSourceProcessingState, materialTranscriptionViewState, type MaterialTranscriptionViewState } from "../../lib/source-processing-state";
import { getVisionRoute, understandingExpired } from "./understanding";

type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
type NamedResource = { id: string; name: string };
type Project = { id: string; title: string };

export type SourceAdminDetails = {
  processing: { sourceStatus: string; ingestStatus: string | null; transcriptionStatus: string | null; currentLabel: string };
  jobs: Array<{ typeLabel: string; statusLabel: string; startedAt: string | null; finishedAt: string | null; durationLabel: string | null; errorLabel: string | null }>;
  assets: Array<{ typeLabel: string; statusLabel: string; sizeLabel: string | null }>;
  transcript: { methodLabel: string; metadataSummary: string | null } | null;
};

export type SourceWorkspaceModel = {
  detail: {
    header: {
      id: string;
      title: string;
      author: string | null;
      publishTime: string | null;
      typeLabel: string;
      platformLabel: string;
      durationLabel: string | null;
      sourceLabel: string;
      originalUrl: string | null;
    };
    preview: {
      type: "VIDEO" | "AUDIO" | "DOCUMENT" | "IMAGE" | "URL" | "TEXT";
      playable: boolean;
      mediaUrl: string | null;
      coverUrl: string | null;
      documentUrl: string | null;
      rawTextPreview: string | null;
      unavailableReason: string | null;
    };
    transcript: {
      state: MaterialTranscriptionViewState | null;
      text: string | null;
      segments: Array<{ startMs: number | null; endMs: number | null; text: string }>;
    };
    tags: NamedResource[];
  };
  actions: {
    sourceId: string;
    sourceTitle: string;
    status: string;
    downloadUrl: string | null;
    failedJobId?: string;
    tags: NamedResource[];
    availableTags: NamedResource[];
    collections: NamedResource[];
    availableCollections: NamedResource[];
    availableProjects: Project[];
    relatedProjects: Project[];
    canManageProjects: boolean;
  };
  workspace: {
    capabilities: readonly SourceCapability[];
    understanding: { status: "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED"; text: string | null; error: string | null; available: boolean; unavailableReason: string | null; provider: string | null; model: string | null; updatedAt: string | null } | null;
    assetId: string | null;
    mimeType: string | null;
    sizeLabel: string | null;
    createdAt: string;
    updatedAt: string;
    transcriptUpdatedAt: string | null;
    transcriptionError: string | null;
    processingError?: string | null;
    configured: boolean;
    busy: boolean;
    canRefresh: boolean;
    processingLabel: string;
    metrics: SourceExternalMetrics;
  };
  adminDetails: SourceAdminDetails | null;
};

function segments(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    return typeof row.text === "string" && row.text.trim()
      ? [{ text: row.text.trim(), startMs: typeof row.startMs === "number" ? row.startMs : null, endMs: typeof row.endMs === "number" ? row.endMs : null }]
      : [];
  }) : [];
}

function durationLabel(milliseconds: number | null) {
  if (milliseconds === null) return null;
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

function bytesLabel(value: string | null) {
  const bytes = value ? Number(value) : NaN;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function processingStatusLabel(status: string | null) {
  if (!status) return null;
  return ({ QUEUED: "排队中", RUNNING: "处理中", PROCESSING: "处理中", COMPLETED: "已完成", SUCCEEDED: "已完成", FAILED: "失败", CANCELLED: "已取消", CANCELED: "已取消" } as Record<string, string>)[status] || "已记录";
}

const typeLabels = { VIDEO: "视频", AUDIO: "音频", DOCUMENT: "文档", IMAGE: "图片", URL: "链接", TEXT: "文字" } as const;
const platformLabels: Record<string, string> = { DOUYIN: "抖音", XIAOHONGSHU: "小红书", GENERIC: "来源链接", MANUAL: "手动导入", UPLOAD: "本地上传" };
const jobLabels: Record<string, string> = { EXTRACT_TEXT: "读取文字", FETCH_URL: "获取网页", TRANSCRIBE: "生成文字稿", PROCESS_MEDIA: "读取媒体" };
const assetLabels: Record<string, string> = { VIDEO: "视频资源", AUDIO: "音频资源", IMAGE: "图片资源", DOCUMENT: "文档资源", THUMBNAIL: "预览图" };

export async function getSourceWorkspaceModel(input: { workspaceId: string; userId: string; sourceItemId: string; role: Role }): Promise<SourceWorkspaceModel | null> {
  let source = await findSourceForUser(db, { workspaceId: input.workspaceId, userId: input.userId, sourceItemId: input.sourceItemId });
  if (!source) return null;
  if (["VIDEO", "AUDIO"].includes(source.sourceType)) {
    await expireMaterialProcessing({ workspaceId: input.workspaceId, sourceItemId: source.id });
    source = await findSourceForUser(db, { workspaceId: input.workspaceId, userId: input.userId, sourceItemId: input.sourceItemId });
    if (!source) return null;
  }

  const mediaSource = source.sourceType === "VIDEO" || source.sourceType === "AUDIO";
  const canManage = input.role !== "VIEWER";
  const [availableTags, availableCollections, availableProjects, relatedProjects, transcriptionPlan] = await Promise.all([
    canManage ? db.contentTag.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    canManage ? db.collection.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    canManage ? db.contentProject.findMany({ where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" }, sources: { none: { sourceItemId: source.id } } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 100 }) : [],
    db.contentProject.findMany({ where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" }, sources: { some: { sourceItemId: source.id } } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    mediaSource ? resolveWorkspaceTranscriptionPlan(input.workspaceId).catch(() => null) : null,
  ]);

  const external = readSourceMetadataEnvelope(source.metadata)?.external;
  const originalUrl = external?.originalUrl ?? source.sourceUrl ?? source.canonicalUrl;
  const title = source.title ?? external?.originalTitle ?? "未命名资料";
  const author = source.author ?? external?.authorName ?? null;
  const cover = external?.coverUrl ?? source.thumbnailUrl ?? null;
  const durationMs = external?.durationMs ?? source.transcript?.durationMs ?? null;
  const metrics: SourceExternalMetrics = {
    views: external?.metrics?.views ?? null,
    likes: external?.metrics?.likes ?? null,
    favorites: external?.metrics?.favorites ?? null,
    comments: external?.metrics?.comments ?? null,
    shares: external?.metrics?.shares ?? null,
  };
  const canRefresh = canManage && source.sourceProvider === "REDFOX" && ["DOUYIN", "XIAOHONGSHU"].includes(source.sourcePlatform) && Boolean(source.externalId || originalUrl);

  let storage: ReturnType<typeof getStorageProvider> | null = null;
  if (source.assets.some((asset) => asset.status === "STORED" && asset.storageKey)) {
    try { storage = getStorageProvider(); } catch { /* The text and metadata remain readable without storage. */ }
  }
  const assets = await Promise.all(source.assets.map(async (asset) => {
    let url: string | null = null;
    if (asset.status === "STORED" && asset.storageKey && storage) {
      try { url = (await storage.getSignedUrl(asset.storageKey, 300, { assetScope: { workspaceId: input.workspaceId, sourceItemId: source.id, assetId: asset.id } })).data.url; }
      catch { /* Preserve the material detail even when this preview is unavailable. */ }
    }
    return { id: asset.id, assetType: asset.assetType, status: asset.status, url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes?.toString() ?? null };
  }));
  const primaryType = source.sourceType === "TEXT" ? "DOCUMENT" : source.sourceType;
  const primaryAsset = assets.find((asset) => asset.assetType === primaryType && asset.status === "STORED") ?? assets.find((asset) => asset.assetType === primaryType);
  const capabilities = sourceCapabilities(source.sourceType, primaryAsset?.mimeType);
  const visual = capabilities.includes("understand") || capabilities.includes("understandPages");
  const savedUnderstanding = visual ? await db.sourceUnderstanding.findFirst({ where: { sourceItemId: source.id, workspaceId: input.workspaceId } }) : null;
  const vision = visual ? await getVisionRoute(input.workspaceId).catch(() => null) : null;
  const expired = savedUnderstanding ? understandingExpired(savedUnderstanding) : false;
  const text = source.transcript?.fullText.trim() || source.rawText?.trim() || null;
  const materialJobs = source.ingestJobs.filter((job) => job.jobType in jobLabels);
  const latestTranscription = materialJobs.find((job) => job.jobType === "TRANSCRIBE");
  const readingJob = materialJobs.find((job) => job.jobType !== "TRANSCRIBE");
  const configured = !mediaSource || transcriptionPlan !== null;
  const transcriptionBusy = latestTranscription?.status === "QUEUED" || latestTranscription?.status === "RUNNING";
  const contentBusy = readingJob?.status === "QUEUED" || readingJob?.status === "RUNNING";
  const busy = contentBusy || transcriptionBusy;
  const processing = getSourceProcessingState({ sourceStatus: source.status, transcriptionStatus: configured ? "CONFIGURED" : "UNCONFIGURED", hasTranscript: mediaSource ? Boolean(source.transcript?.fullText.trim()) : Boolean(text), assets: source.assets, jobs: materialJobs });
  const transcriptionState = materialTranscriptionViewState(source.sourceType, processing.transcription);
  const sourcePlatformLabel = originalUrl ? platformLabels[source.sourcePlatform] || "外部来源" : source.assets.length ? "本地上传" : "手动录入";
  const playable = Boolean(primaryAsset?.url && mediaSource);

  return {
    detail: {
      header: { id: source.id, title, author, publishTime: external?.publishedAt ?? null, typeLabel: typeLabels[source.sourceType], platformLabel: sourcePlatformLabel, durationLabel: durationLabel(durationMs), sourceLabel: sourcePlatformLabel, originalUrl },
      preview: { type: source.sourceType, playable, mediaUrl: primaryAsset?.url ?? null, coverUrl: cover, documentUrl: primaryAsset?.url ?? null, rawTextPreview: text?.slice(0, 800) ?? null, unavailableReason: source.status === "FAILED" ? "视频或原件下载失败，尚不能播放。请查看资料信息中的失败原因并重试。" : mediaSource && !primaryAsset?.url && !busy ? (text ? "已保存文字内容，但没有保存原音视频文件。可阅读文字，或打开原始来源查看。" : "这条资料尚未保存原音视频文件，当前没有可播放的内容。") : playable || cover || text ? null : "原始资料暂时没有可用的预览资源。" },
      transcript: { state: transcriptionState, text, segments: segments(source.transcript?.segments) },
      tags: source.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
    },
    actions: {
      sourceId: source.id, sourceTitle: title, status: source.status, downloadUrl: primaryAsset?.url ?? null, failedJobId: readingJob?.id,
      tags: source.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })), availableTags,
      collections: source.collections.map(({ collection }) => ({ id: collection.id, name: collection.name })), availableCollections,
      availableProjects, relatedProjects, canManageProjects: canManage,
    },
    workspace: {
      capabilities,
      understanding: visual ? {
        status: expired ? "FAILED" : savedUnderstanding?.status ?? "NOT_STARTED",
        text: savedUnderstanding?.text ?? null,
        error: expired ? "上次处理已中断，可以重试。" : savedUnderstanding?.errorMessage ?? null,
        available: Boolean(vision && primaryAsset && source.assets.some((asset) => asset.id === primaryAsset.id && asset.status === "STORED" && asset.storageKey)),
        unavailableReason: !vision ? "当前未配置可用的视觉模型。" : !primaryAsset?.url ? "原件暂时不可读取，请检查文件状态。" : null,
        provider: savedUnderstanding?.provider ?? null, model: savedUnderstanding?.model ?? null,
        updatedAt: savedUnderstanding?.updatedAt.toISOString() ?? null,
      } : null,
      assetId: primaryAsset?.id ?? null, mimeType: primaryAsset?.mimeType ?? null, sizeLabel: bytesLabel(primaryAsset?.sizeBytes ?? null),
      createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString(), transcriptUpdatedAt: source.transcript?.updatedAt.toISOString() ?? (text ? source.updatedAt.toISOString() : null),
      transcriptionError: latestTranscription?.status === "FAILED" ? latestTranscription.errorMessage?.slice(0, 200) ?? null : null,
      processingError: readingJob?.status === "FAILED" ? readingJob.errorMessage?.slice(0, 200) ?? "原文件读取失败，请重试或重新上传。" : source.status === "FAILED" ? "文件上传或读取未完成，请重新上传或重试。" : null,
      configured: Boolean(configured), busy, canRefresh: Boolean(canRefresh), processingLabel: processing.currentLabel, metrics,
    },
    adminDetails: input.role === "OWNER" || input.role === "ADMIN" ? {
      processing: { sourceStatus: ({ READY: "已准备", PROCESSING: "处理中", FAILED: "读取失败", ARCHIVED: "已归档", PENDING: "等待处理" } as Record<string, string>)[source.status] || "已记录", ingestStatus: processingStatusLabel(readingJob?.status ?? null), transcriptionStatus: processingStatusLabel(latestTranscription?.status ?? null), currentLabel: processing.currentLabel },
      jobs: materialJobs.map((job) => ({ typeLabel: jobLabels[job.jobType]!, statusLabel: processingStatusLabel(job.status) || "未开始", startedAt: job.startedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null, durationLabel: job.startedAt ? "已记录" : "未开始", errorLabel: job.errorCode ? "处理失败，请重试或联系管理员。" : null })),
      assets: source.assets.map((asset) => ({ typeLabel: assetLabels[asset.assetType] || "资料资源", statusLabel: processingStatusLabel(asset.status) || "已记录", sizeLabel: bytesLabel(asset.sizeBytes?.toString() ?? null) })),
      transcript: source.transcript ? { methodLabel: source.transcript.provider === "LOCAL_FUNASR" ? "本地转写" : source.transcript.provider === "MANUAL" || source.transcript.provider === "MANUAL_TEXT" ? "手动整理" : "云端转写", metadataSummary: source.transcript.metadata ? "已保存处理信息" : null } : null,
    } : null,
  };
}
