import "server-only";
import {ensureFeishuSource,FeishuError} from "@content-center/integrations";

import { db, findSourceForUser, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { getStorageProvider, readSourceMetadataEnvelope, type SourceExternalMetrics } from "@content-center/providers";
import { resolveWorkspaceTranscriptionPlan } from "@content-center/worker/transcription";
import { getMaterialAnalysis, type MaterialAnalysisDTO } from "../material-analysis/service";
import { getMaterialDistillation, type MaterialDistillationDTO } from "../material-distillation/service";
import { getMaterialKnowledge } from "../material-knowledge/service";
import { getSourceProcessingState } from "../../lib/source-processing-state";

type MaterialAnalysisState = Awaited<ReturnType<typeof getMaterialAnalysis>>;
type MaterialDistillationState = Awaited<ReturnType<typeof getMaterialDistillation>>;
export type MaterialKnowledgeState = Awaited<ReturnType<typeof getMaterialKnowledge>>;

export type MaterialDetailActionTarget = "transcript" | "research" | "confirm" | "creation" | "metadata" | "project" | "methods";
export type MaterialDetailAction = { key: string; title: string; description: string; target: MaterialDetailActionTarget };

type CompletenessKey = "author" | "authorAvatar" | "description" | "cover" | "publishedAt" | "duration" | "engagement" | "originalUrl";
type MetadataCompleteness = Record<CompletenessKey, boolean> & { complete: boolean; missing: CompletenessKey[] };

export type MaterialDetailView = {
  source: {
    id: string;
    sourceType: "TEXT" | "URL" | "VIDEO" | "AUDIO" | "IMAGE" | "DOCUMENT";
    platform: string;
    externalId: string | null;
    title: string | null;
    author: string | null;
    authorId: string | null;
    authorAvatar: string | null;
    description: string | null;
    cover: string | null;
    mediaAssets: Array<{ id: string; assetType: string; url: string | null; mimeType: string | null; sizeBytes: string | null; status: string }>;
    publishedAt: string | null;
    durationMs: number | null;
    engagement: SourceExternalMetrics;
    originalUrl: string | null;
    createdAt: string;
    updatedAt: string;
    status: string;
    sourceProvider: string | null;
    metadataCompleteness: MetadataCompleteness;
    refresh: { available: boolean; state: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" };
    tags: Array<{ id: string; name: string }>;
    collections: Array<{ id: string; name: string }>;
  };
  understanding: {
    current: MaterialAnalysisState["current"];
    latestAttempt: MaterialAnalysisState["latestAttempt"];
    job: MaterialAnalysisState["job"];
    history: MaterialAnalysisState["history"];
    summary: string | null;
    keyPoints: string[];
    expression: MaterialAnalysisDTO["understanding"];
    reusable: Array<{ content: string; whyUseful: string }>;
    doNotCopy: Array<{ content: string; reason: string }>;
    uncertain: Array<{ content: string; reason: string }>;
  };
  distillation: {
    current: MaterialDistillationState["current"];
    latestAttempt: MaterialDistillationState["latestAttempt"];
    job: MaterialDistillationState["job"];
    history: MaterialDistillationState["history"];
    highlights: NonNullable<MaterialDistillationDTO["output"]>["highlights"];
    copywriting: NonNullable<MaterialDistillationDTO["output"]>["copywriting"];
  };
  evidence: {
    state: MaterialKnowledgeState;
    externalReferences: MaterialKnowledgeState["candidates"];
    confirmableItems: MaterialKnowledgeState["candidates"];
    canConfirm: boolean;
    canReject: boolean;
  };
  workflow: {
    currentProjects: Array<{ id: string; title: string; status?: string; updatedAt?: string }>;
    availableProjects: Array<{ id: string; title: string }>;
    relatedTopics: Array<{ id: string; title: string; status: string; projectId: string | null; updatedAt: string }>;
    topicState: "AVAILABLE" | "LINKED" | "UNAVAILABLE";
    availableTopicAction: boolean;
    recommendedAction: MaterialDetailAction;
    availableActions: MaterialDetailAction[];
    assistantHandoffAvailable: boolean;
    tagState: { current: Array<{ id: string; name: string }>; availableCount: number };
    collectionState: { current: Array<{ id: string; name: string }>; availableCount: number };
    availableTags: Array<{ id: string; name: string }>;
    availableCollections: Array<{ id: string; name: string }>;
    metadata: { state: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"; missing: string[] };
    pendingEvidenceCount: number;
    sourceBoundary: string;
    methodState: {
      analysisCandidates: Array<{ title: string; source: "analysis"; evidenceCount: number }>;
      distillationCandidates: Array<{ title: string; source: "distillation"; evidenceCount: number }>;
      suggestions: Array<{ id: string; title: string; status: string; sampleCount: number }>;
      saved: Array<{ id: string; title: string; status: string; version: number; source: "analysis" | "distillation" | "source" | "benchmark" }>;
    };
  };
  transcript: {
    text: string | null;
    segments: Array<{ index: number; text: string; startMs: number | null; endMs: number | null }>;
    wordCount: number;
    durationMs: number | null;
    quality: string;
    processingTime: string;
    updatedAt: string | null;
    editable: boolean;
    transcriptionState: "NOT_STARTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "UNAVAILABLE";
    method: string;
    configured: boolean;
    busy: boolean;
    failed: boolean;
    message?: string;
  };
  processing: {
    currentLabel: string;
    sourceStatus: string;
    ingestStatus: string | null;
    transcriptionStatus: string | null;
    ingestJobId: string | null;
    adminDetails: {
      jobs: Array<{ id: string; jobType: string; status: string; provider: string; providerMode: string; startedAt: string | null; finishedAt: string | null; errorCode: string | null; errorMessage: string | null }>;
      assets: Array<{ assetType: string; status: string; sizeBytes: string | null }>;
      transcript: { provider: string; metadata: unknown } | null;
    } | null;
  };
  llmStatus: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function segments(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item, index) => {
    const row = record(item);
    return typeof row.text === "string" && row.text.trim()
      ? [{ index, text: row.text.trim(), startMs: typeof row.startMs === "number" ? row.startMs : null, endMs: typeof row.endMs === "number" ? row.endMs : null }]
      : [];
  }) : [];
}

function outputLists(value: MaterialAnalysisDTO["understanding"]) {
  const parsed = record(value);
  const reusable = Array.isArray(parsed.reusable) ? parsed.reusable.flatMap((item) => {
    const row = record(item);
    return typeof row.content === "string" ? [{ content: row.content, whyUseful: typeof row.whyUseful === "string" ? row.whyUseful : "" }] : [];
  }) : [];
  const doNotCopy = Array.isArray(parsed.doNotCopy) ? parsed.doNotCopy.flatMap((item) => {
    const row = record(item);
    return typeof row.content === "string" ? [{ content: row.content, reason: typeof row.reason === "string" ? row.reason : "" }] : [];
  }) : [];
  const uncertain = Array.isArray(parsed.uncertain) ? parsed.uncertain.flatMap((item) => {
    const row = record(item);
    return typeof row.content === "string" ? [{ content: row.content, reason: typeof row.reason === "string" ? row.reason : "" }] : [];
  }) : [];
  return { reusable, doNotCopy, uncertain };
}

function metricsWithNulls(value: SourceExternalMetrics | undefined | null): SourceExternalMetrics {
  return {
    views: value?.views ?? null,
    likes: value?.likes ?? null,
    favorites: value?.favorites ?? null,
    comments: value?.comments ?? null,
    shares: value?.shares ?? null,
  };
}

const transcriptQualityLabels = { FAST: "速度优先", BALANCED: "均衡", QUALITY: "质量优先" } as const;
const transcriptionUnavailableMessage = "语音转写服务暂时不可用，请联系管理员。";

function processingTime(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "暂未记录";
  const seconds = Math.max(0, Math.round(value / 1_000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

function methodKind(row: { sourceItemId: string | null; sourceMaterialAnalysisId: string | null; sourceMaterialDistillationId: string | null; sourceBenchmarkStudyId: string | null }, analysisId: string | null, distillationId: string | null): "analysis" | "distillation" | "source" | "benchmark" {
  if (analysisId && row.sourceMaterialAnalysisId === analysisId) return "analysis";
  if (distillationId && row.sourceMaterialDistillationId === distillationId) return "distillation";
  if (row.sourceItemId) return "source";
  return "benchmark";
}

function asAction(key: string, title: string, description: string, target: MaterialDetailActionTarget): MaterialDetailAction {
  return { key, title, description, target };
}

// Legacy compatibility reader for research-era material views and their existing consumers.
// The current /library/[id] route uses getSourceWorkspaceModel instead.
export async function getMaterialDetailView(input: { workspaceId: string; userId: string; sourceItemId: string; role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }): Promise<MaterialDetailView | null> {
  try {await ensureFeishuSource(input,input.sourceItemId);} catch(error) {if(error instanceof FeishuError && error.status===403) return null; throw error;}
  const [source, availableTags, availableCollections, availableProjects, currentProjects, relatedTopics] = await Promise.all([
    findSourceForUser(db, { userId: input.userId, workspaceId: input.workspaceId, sourceItemId: input.sourceItemId }),
    db.contentTag.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.contentProject.findMany({ where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" }, sources: { none: { sourceItemId: input.sourceItemId } } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.contentProject.findMany({ where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" }, sources: { some: { sourceItemId: input.sourceItemId } } }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }),
    db.contentIdea.findMany({ where: { workspaceId: input.workspaceId, references: { some: { sourceItemId: input.sourceItemId } } }, select: { id: true, title: true, status: true, projectId: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  if (!source) return null;

  const integrations = new IntegrationService();
  const [analysis, distillation, llm, knowledge, transcriptionPlan] = await Promise.all([
    getMaterialAnalysis({ workspaceId: input.workspaceId, sourceItemId: source.id }),
    getMaterialDistillation({ workspaceId: input.workspaceId, sourceItemId: source.id }),
    integrations.getIntegrationStatus(input.workspaceId, "LLM"),
    getMaterialKnowledge({ workspaceId: input.workspaceId, userId: input.userId, sourceItemId: source.id }),
    source.sourceType === "VIDEO" || source.sourceType === "AUDIO" ? resolveWorkspaceTranscriptionPlan(input.workspaceId).catch(() => null) : Promise.resolve(null),
  ]);

  const envelope = readSourceMetadataEnvelope(source.metadata);
  const external = envelope?.external ?? null;
  const transcriptSegments = segments(source.transcript?.segments);
  const transcriptText = source.transcript?.fullText.trim() || source.rawText?.trim() || null;
  const originalUrl = external?.originalUrl ?? source.sourceUrl ?? source.canonicalUrl;
  const sourceTitle = source.title ?? external?.originalTitle ?? null;
  const sourceAuthor = source.author ?? external?.authorName ?? null;
  const sourceDescription = external?.description ?? source.description ?? null;
  const sourceCover = external?.coverUrl ?? source.thumbnailUrl ?? null;
  const durationMs = external?.durationMs ?? source.transcript?.durationMs ?? null;
  const engagement = metricsWithNulls(external?.metrics);
  const completeness: MetadataCompleteness = {
    author: Boolean(sourceAuthor),
    authorAvatar: Boolean(external?.authorAvatarUrl),
    description: Boolean(sourceDescription),
    cover: Boolean(sourceCover),
    publishedAt: Boolean(external?.publishedAt),
    duration: durationMs !== null,
    engagement: Object.values(engagement).some((value) => value !== null),
    originalUrl: Boolean(originalUrl),
    complete: false,
    missing: [],
  };
  const completenessKeys: CompletenessKey[] = ["author", "authorAvatar", "description", "cover", "publishedAt", "duration", "engagement", "originalUrl"];
  completeness.missing = completenessKeys.filter((key) => !completeness[key]);
  completeness.complete = completeness.missing.length === 0;
  const canRefresh = input.role !== "VIEWER" && source.sourceProvider === "REDFOX" && ["DOUYIN", "XIAOHONGSHU"].includes(source.sourcePlatform) && Boolean(source.externalId || source.sourceUrl || source.canonicalUrl);
  const refreshState = !canRefresh ? "UNAVAILABLE" : completeness.complete ? "COMPLETE" : "PARTIAL";

  const storage = source.assets.some((asset) => asset.status === "STORED" && asset.storageKey) ? getStorageProvider() : null;
  const mediaAssets = await Promise.all(source.assets.map(async (asset) => {
    if (asset.status !== "STORED" || !asset.storageKey) return { id: asset.id, assetType: asset.assetType, url: null, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes?.toString() ?? null, status: asset.status };
    try {
      if (!storage) throw new Error("STORAGE_NOT_CONFIGURED");
      const signed = await storage.getSignedUrl(asset.storageKey, 300, { assetScope: { workspaceId: input.workspaceId, sourceItemId: source.id, assetId: asset.id } });
      return { id: asset.id, assetType: asset.assetType, url: signed.data.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes?.toString() ?? null, status: asset.status };
    } catch {
      return { id: asset.id, assetType: asset.assetType, url: null, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes?.toString() ?? null, status: asset.status };
    }
  }));

  const latestAnalysis = analysis.current;
  const analysisLists = outputLists(latestAnalysis?.understanding ?? null);
  const currentOutput = distillation.current?.output;
  const analysisMethods = latestAnalysis?.understanding && "expression" in latestAnalysis.understanding
    ? latestAnalysis.understanding.methods.items.map((item) => ({ title: item.title, source: "analysis" as const, evidenceCount: item.evidence.length }))
    : [];
  const distillationMethods = currentOutput?.highlights.filter((item) => ["method", "process", "framework", "checklist", "decision_rule", "copy_structure"].includes(item.type)).map((item) => ({ title: item.title, source: "distillation" as const, evidenceCount: item.evidence.length })) ?? [];
  const methodConditions: Prisma.MethodVersionWhereInput[] = [{ sourceItemId: source.id }];
  if (latestAnalysis) methodConditions.push({ sourceMaterialAnalysisId: latestAnalysis.id });
  if (distillation.current) methodConditions.push({ sourceMaterialDistillationId: distillation.current.id });
  const [methodVersions, methodSuggestions] = await Promise.all([
    db.methodVersion.findMany({ where: { asset: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: { not: "DISABLED" } }, OR: methodConditions }, orderBy: { version: "desc" }, select: { id: true, title: true, version: true, sourceItemId: true, sourceMaterialAnalysisId: true, sourceMaterialDistillationId: true, sourceBenchmarkStudyId: true, asset: { select: { id: true, status: true } } } }),
    db.methodSuggestion.findMany({ where: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: "PENDING", sourceBenchmarkStudy: { samples: { some: { sourceItemId: source.id } } } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, status: true, sampleCount: true } }),
  ]);

  const topicReady = Boolean(transcriptText && ((distillation.current?.output && !distillation.current.stale) || (analysis.current && !analysis.current.stale && (analysis.current.understanding || analysis.current.summary))));
  const relatedTopicDTO = relatedTopics.map((topic) => ({ id: topic.id, title: topic.title, status: topic.status, projectId: topic.projectId, updatedAt: topic.updatedAt.toISOString() }));
  const actions: MaterialDetailAction[] = [];
  if (refreshState === "PARTIAL") actions.push(asAction("metadata", "补全资料信息", "从原始来源补充作者、时间和互动数据。", "metadata"));
  if (knowledge.candidates.some((candidate) => candidate.canConfirm)) actions.push(asAction("confirm", "确认可用信息", "有内部资料信息等待人工确认。", "confirm"));
  if (topicReady && !relatedTopics.length) actions.push(asAction("topics", "用这条找选题", "从真实内容出发找到我们的创作角度。", "creation"));
  if (analysisMethods.length || distillationMethods.length) actions.push(asAction("methods", "查看可复用方法", "从真实研究结果中挑选值得试用的写法。", "methods"));
  if (currentProjects.length) actions.push(asAction("project", "继续当前创作", "回到已经关联的创作继续工作。", "project"));
  if (!currentProjects.length) actions.push(asAction("create", "加入当前创作", "把这条资料作为真实创作依据带进工作台。", "creation"));
  if (transcriptText) actions.push(asAction("transcript", "核对文字稿", "回到原文确认表达和来源边界。", "transcript"));
  const contentLabel = source.sourceType === "VIDEO" || source.sourceType === "AUDIO" ? "文字稿" : source.sourceType === "URL" ? "正文" : "原文";
  const recommendedAction = !transcriptText
    ? asAction("transcript", `先读取${contentLabel}`, `有了${contentLabel}后，才能继续看懂、提炼和判断。`, "transcript")
    : knowledge.candidates.some((candidate) => candidate.canConfirm)
      ? asAction("confirm", "确认可用信息", "有内部资料信息等待人工确认。", "confirm")
      : !analysis.current || analysis.current.stale
        ? asAction("research", "先看懂这条资料", "先用真实内容整理出摘要、观点和表达线索。", "research")
        : !currentProjects.length
          ? asAction("create", "加入当前创作", "把这条资料作为真实创作依据带进工作台。", "creation")
          : topicReady && !relatedTopics.length
            ? asAction("topics", "用这条找选题", "从当前资料出发，生成可继续验证的选题方向。", "creation")
            : asAction("research", "继续查看参考信息", "回到已有结果，继续判断哪些内容值得使用。", "research");
  const actionKeys = new Set(actions.map((action) => action.key));
  if (!actionKeys.has(recommendedAction.key)) actions.unshift(recommendedAction);

  const isMediaSource = source.sourceType === "VIDEO" || source.sourceType === "AUDIO";
  const transcriptionConfigured = !isMediaSource || transcriptionPlan !== null;
  const latestTranscription = source.ingestJobs.find((job) => job.jobType === "TRANSCRIBE");
  const readingJob = source.ingestJobs.find((job) => job.jobType !== "TRANSCRIBE");
  const transcriptionBusy = latestTranscription?.status === "QUEUED" || latestTranscription?.status === "RUNNING";
  const contentBusy = readingJob?.status === "QUEUED" || readingJob?.status === "RUNNING";
  const transcriptionState = transcriptText ? "COMPLETED" : contentBusy || transcriptionBusy ? "PROCESSING" : latestTranscription?.status === "FAILED" || readingJob?.status === "FAILED" ? "FAILED" : transcriptionConfigured ? "NOT_STARTED" : "UNAVAILABLE";
  const transcriptMetadata = record(source.transcript?.metadata);
  const transcriptMethod = source.transcript?.provider === "LOCAL_FUNASR" ? "本地转写" : source.transcript?.provider === "MANUAL" || source.transcript?.provider === "MANUAL_TEXT" ? "手动整理" : source.transcript ? "云端转写" : transcriptText ? "正文读取" : "—";
  const transcriptQuality = transcriptQualityLabels[transcriptMetadata.qualityMode as keyof typeof transcriptQualityLabels] ?? "暂未记录";
  const processing = getSourceProcessingState({ sourceStatus: source.status, transcriptionStatus: transcriptionConfigured ? "CONFIGURED" : "UNCONFIGURED", hasTranscript: Boolean(transcriptText), assets: source.assets, jobs: source.ingestJobs });
  const adminDetails = input.role === "OWNER" || input.role === "ADMIN" ? {
    jobs: source.ingestJobs.map((job) => ({ id: job.id, jobType: job.jobType, status: job.status, provider: job.provider, providerMode: job.providerMode, startedAt: job.startedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null, errorCode: job.errorCode, errorMessage: job.errorMessage })),
    assets: source.assets.map((asset) => ({ assetType: asset.assetType, status: asset.status, sizeBytes: asset.sizeBytes?.toString() ?? null })),
    transcript: source.transcript ? { provider: source.transcript.provider, metadata: source.transcript.metadata } : null,
  } : null;

  return {
    source: {
      id: source.id,
      sourceType: source.sourceType,
      platform: source.sourcePlatform,
      externalId: external?.externalId ?? source.externalId ?? null,
      title: sourceTitle,
      author: sourceAuthor,
      authorId: external?.authorId ?? null,
      authorAvatar: external?.authorAvatarUrl ?? null,
      description: sourceDescription,
      cover: sourceCover,
      mediaAssets,
      publishedAt: external?.publishedAt ?? null,
      durationMs,
      engagement,
      originalUrl,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
      status: source.status,
      sourceProvider: source.sourceProvider,
      metadataCompleteness: completeness,
      refresh: { available: refreshState === "PARTIAL", state: refreshState },
      tags: source.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
      collections: source.collections.map(({ collection }) => ({ id: collection.id, name: collection.name })),
    },
    understanding: {
      current: analysis.current,
      latestAttempt: analysis.latestAttempt,
      job: analysis.job,
      history: analysis.history,
      summary: latestAnalysis?.summary ?? null,
      keyPoints: latestAnalysis?.keyPoints ?? [],
      expression: latestAnalysis?.understanding ?? null,
      ...analysisLists,
    },
    distillation: { current: distillation.current, latestAttempt: distillation.latestAttempt, job: distillation.job, history: distillation.history, highlights: currentOutput?.highlights ?? [], copywriting: currentOutput?.copywriting ?? null },
    evidence: { state: knowledge, externalReferences: knowledge.candidates.filter((candidate) => !candidate.canConfirm), confirmableItems: knowledge.candidates.filter((candidate) => candidate.canConfirm), canConfirm: knowledge.candidates.some((candidate) => candidate.canConfirm), canReject: knowledge.candidates.some((candidate) => candidate.canReject) },
    workflow: {
      currentProjects: currentProjects.map((project) => ({ id: project.id, title: project.title, status: project.status, updatedAt: project.updatedAt.toISOString() })),
      availableProjects,
      relatedTopics: relatedTopicDTO,
      topicState: relatedTopics.length ? "LINKED" : topicReady ? "AVAILABLE" : "UNAVAILABLE",
      availableTopicAction: topicReady,
      recommendedAction,
      availableActions: actions,
      assistantHandoffAvailable: currentProjects.length > 0,
      tagState: { current: source.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })), availableCount: availableTags.length },
      collectionState: { current: source.collections.map(({ collection }) => ({ id: collection.id, name: collection.name })), availableCount: availableCollections.length },
      availableTags,
      availableCollections,
      metadata: { state: refreshState, missing: completeness.missing },
      pendingEvidenceCount: knowledge.candidates.filter((candidate) => candidate.status === "PENDING").length,
      sourceBoundary: "外部资料只作为参考，不会自动成为我方事实。",
      methodState: {
        analysisCandidates: analysisMethods,
        distillationCandidates: distillationMethods,
        suggestions: methodSuggestions,
        saved: methodVersions.map((method) => ({ id: method.asset.id, title: method.title, status: method.asset.status, version: method.version, source: methodKind(method, latestAnalysis?.id ?? null, distillation.current?.id ?? null) })),
      },
    },
    transcript: { text: transcriptText, segments: transcriptSegments, wordCount: transcriptText ? transcriptText.replace(/\s/gu, "").length : 0, durationMs, quality: transcriptQuality, processingTime: processingTime(transcriptMetadata.processingMs), updatedAt: source.transcript?.updatedAt.toISOString() ?? (transcriptText ? source.updatedAt.toISOString() : null), editable: input.role !== "VIEWER", transcriptionState, method: transcriptMethod, configured: transcriptionConfigured, busy: contentBusy || transcriptionBusy, failed: latestTranscription?.status === "FAILED" || readingJob?.status === "FAILED", message: transcriptText ? undefined : contentBusy ? "资料正在读取，完成后会自动显示。" : transcriptionBusy ? "正在生成文字稿，完成后会自动显示。" : latestTranscription?.status === "FAILED" || readingJob?.status === "FAILED" ? "这次读取没有完成，可以重试。" : !transcriptionConfigured ? transcriptionUnavailableMessage : `尚未生成${contentLabel}。` },
    processing: { currentLabel: processing.currentLabel, sourceStatus: source.status, ingestStatus: source.ingestJobs.find((job) => job.jobType !== "TRANSCRIBE")?.status ?? null, transcriptionStatus: latestTranscription?.status ?? null, ingestJobId: source.ingestJobs.find((job) => job.jobType !== "TRANSCRIBE")?.id ?? null, adminDetails },
    llmStatus: llm.status,
  };
}
