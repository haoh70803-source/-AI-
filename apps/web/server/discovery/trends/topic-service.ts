import "server-only";

import { normalizeTrendKeyword } from "@content-center/core";
import { db, type Prisma } from "@content-center/db";
import { LLMError, type LLMProvider } from "@content-center/providers";
import { executeStructuredAIRun } from "../../ai/ai-run-service";
import { loadLLMRuntime, type LLMRuntime } from "../../ai/llm-runtime";
import { isLlmConfigurationError } from "../../ai/llm-api-status";
import { renderPrompt, selectPromptTemplate } from "../../ai/prompt-service";
import { externalContentSchema, type ExternalContentInput } from "../schemas";
import { getTrendOpportunity } from "./read-model";
import { candidateTopicsOutputSchema, type CandidateTopic } from "./schemas";
import { TrendServiceError } from "./service";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function jsonRecord(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown, take = 20) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, take) : []; }

function compactContent(item: ExternalContentInput) {
  return {
    externalId: item.externalId,
    platform: item.platform,
    title: item.title,
    description: item.description?.slice(0, 1_500) ?? null,
    authorName: item.authorName,
    publishedAt: item.publishedAt,
    metrics: item.metrics,
  };
}

export async function generateTopicCandidates(input: {
  workspaceId: string;
  userId: string;
  opportunityKey: string;
  supportingContents: ExternalContentInput[];
}, dependencies: { runtime?: LLMRuntime } = {}) {
  const opportunity = await getTrendOpportunity(input.workspaceId, input.opportunityKey);
  if (!opportunity) throw new TrendServiceError("TREND_NOT_FOUND", "该趋势已过期或不存在。");
  const [profile, existingIdeas, recentProjects, template] = await Promise.all([
    db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } }),
    db.contentIdea.findMany({ where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, take: 20, select: { title: true } }),
    db.contentProject.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { updatedAt: "desc" }, take: 20, select: { title: true } }),
    selectPromptTemplate(input.workspaceId, "GENERATE_TOPIC_CANDIDATES"),
  ]);
  const context = {
    trend: opportunity,
    supportingContents: input.supportingContents.slice(0, 5).map(compactContent),
    creatorProfile: profile ? {
      positioning: profile.positioning,
      audience: profile.targetAudience,
      tone: profile.tone,
      coreTopics: strings(profile.coreTopics),
      personalViews: strings(profile.personalViews),
    } : null,
    existingIdeas: existingIdeas.map((item) => item.title),
    recentProjectTopics: recentProjects.map((item) => item.title),
  };
  const prompt = `${renderPrompt(template.template, context)}\nReturn exactly one JSON object matching this shape. Do not use markdown fences:\n{"candidates":[{"title":string,"angle":string,"targetAudience":string,"coreConflict":string,"whyNow":string,"differenceFromSources":string,"supportingReferences":string[],"riskNotes":string[],"recommendedFormat":string|null}]}`;
  let runtime: LLMRuntime;
  try {
    runtime = dependencies.runtime ?? await loadLLMRuntime(input.workspaceId);
  } catch (error) {
    if (error instanceof LLMError && isLlmConfigurationError(error)) throw new TrendServiceError("TREND_AI_NOT_CONFIGURED", "AI 创作服务尚未配置。");
    throw error;
  }
  try {
    const run = await executeStructuredAIRun({
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "GENERATE_TOPIC_CANDIDATES",
      operation: "GENERATE_TOPIC_CANDIDATES",
      promptTemplateId: template.id,
      promptVersion: template.version,
      inputSummary: { trendKey: opportunity.deterministicKey, supportingContentCount: input.supportingContents.length, existingIdeaCount: existingIdeas.length, recentProjectCount: recentProjects.length },
      metadata: { opportunityKey: opportunity.deterministicKey, trendSnapshotIds: opportunity.supportingSnapshotIds, supportingContents: input.supportingContents.slice(0, 5) },
      auditMetadata: { trendKey: opportunity.deterministicKey, supportingContentCount: input.supportingContents.length },
      contextTruncated: false,
      generate: (provider: LLMProvider) => provider.generateStructured({ systemPrompt: template.systemPrompt, prompt }, candidateTopicsOutputSchema),
    }, { runtime });
    const existingTitles = new Set([...existingIdeas, ...recentProjects].map((item) => normalizeTrendKeyword(item.title)));
    const seen = new Set<string>();
    const candidates = run.output.candidates.flatMap((candidate, index) => {
      const normalized = normalizeTrendKeyword(candidate.title);
      if (!normalized || seen.has(normalized) || existingTitles.has(normalized)) return [];
      seen.add(normalized);
      return [{ ...candidate, selectedIndex: index }];
    });
    if (!candidates.length) throw new TrendServiceError("TREND_AI_GENERATION_FAILED", "生成结果与现有选题重复，请换一批再试。");
    return { ...run, output: { candidates } };
  } catch (error) {
    if (error instanceof TrendServiceError) throw error;
    throw new TrendServiceError("TREND_AI_GENERATION_FAILED", "选题建议生成失败，请稍后重试。");
  }
}

async function ensureUniqueTitle(workspaceId: string, title: string) {
  const normalized = normalizeTrendKeyword(title);
  const [ideas, projects] = await Promise.all([
    db.contentIdea.findMany({ where: { workspaceId, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, take: 50, select: { title: true } }),
    db.contentProject.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 50, select: { title: true } }),
  ]);
  if ([...ideas, ...projects].some((item) => normalizeTrendKeyword(item.title) === normalized)) throw new TrendServiceError("TREND_DUPLICATE_IDEA", "已有相同标题的选题或项目。");
}

function trendPlatform(platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL") {
  return platform === "GLOBAL" ? "OTHER" as const : platform;
}

async function createIdeaWithTrend(input: {
  workspaceId: string;
  userId: string;
  opportunityKey: string;
  title: string;
  description?: string;
  candidate?: CandidateTopic;
  aiRunId?: string;
  supportingContents?: ExternalContentInput[];
}) {
  await ensureUniqueTitle(input.workspaceId, input.title);
  const opportunity = await getTrendOpportunity(input.workspaceId, input.opportunityKey);
  if (!opportunity) throw new TrendServiceError("TREND_NOT_FOUND", "该趋势已过期或不存在。");
  const [profile, snapshots] = await Promise.all([
    db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { id: true } }),
    db.trendSnapshot.findMany({ where: { workspaceId: input.workspaceId, id: { in: opportunity.supportingSnapshotIds } } }),
  ]);
  if (!snapshots.length) throw new TrendServiceError("TREND_NOT_FOUND", "趋势依据不存在。");
  const allowedReferences = new Set(input.candidate?.supportingReferences ?? []);
  const selectedContents = (input.supportingContents ?? []).filter((item) => allowedReferences.has(item.externalId));
  const sourceItems = selectedContents.length ? await db.sourceItem.findMany({
    where: { workspaceId: input.workspaceId, OR: selectedContents.map((item) => ({ sourcePlatform: item.platform, externalId: item.externalId })) },
    select: { id: true, sourcePlatform: true, externalId: true },
  }) : [];
  const sourceIds = new Map(sourceItems.map((item) => [`${item.sourcePlatform}:${item.externalId}`, item.id]));
  return db.$transaction(async (tx) => {
    const idea = await tx.contentIdea.create({ data: {
      workspaceId: input.workspaceId,
      creatorProfileId: profile?.id,
      title: input.title,
      description: input.description || null,
      aiRationale: input.candidate ? json({ ...input.candidate, aiRunId: input.aiRunId, source: "AI_SUGGESTION" }) : undefined,
      createdById: input.userId,
    } });
    for (const snapshot of snapshots) await tx.contentIdeaReference.create({ data: {
      ideaId: idea.id,
      platform: trendPlatform(snapshot.platform),
      externalId: snapshot.externalKey,
      title: snapshot.title,
      url: `/discovery/trends/${encodeURIComponent(input.opportunityKey)}`,
      metadataSnapshot: json({ referenceType: "TREND", platform: snapshot.platform, trendType: snapshot.trendType, rank: snapshot.rank, metrics: snapshot.metrics, observedAt: snapshot.observedAt, aiRunId: input.aiRunId }),
      trendSnapshotId: snapshot.id,
    } });
    for (const content of selectedContents) await tx.contentIdeaReference.create({ data: {
      ideaId: idea.id,
      platform: content.platform,
      externalId: content.externalId,
      title: content.title || content.description || "未命名参考内容",
      url: content.originalUrl,
      authorName: content.authorName,
      coverUrl: content.coverUrl,
      metadataSnapshot: json({ referenceType: "EXTERNAL_CONTENT", contentType: content.contentType, metrics: content.metrics, publishedAt: content.publishedAt }),
      sourceItemId: sourceIds.get(`${content.platform}:${content.externalId}`),
    } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: input.candidate ? "discovery.candidate_saved" : "discovery.trend_idea_created", resourceType: "content_idea", resourceId: idea.id, metadata: json({ trendKey: input.opportunityKey, aiRunId: input.aiRunId, trendReferenceCount: snapshots.length, supportingContentCount: selectedContents.length }) } });
    if (input.aiRunId) await tx.aIRun.update({ where: { id: input.aiRunId }, data: { appliedAt: new Date() } });
    return idea;
  });
}

export function saveManualTrendIdea(input: { workspaceId: string; userId: string; opportunityKey: string; title: string }) {
  return createIdeaWithTrend({ ...input, description: "来自趋势机会的人工选题。" });
}

export async function saveCandidateTrendIdea(input: { workspaceId: string; userId: string; opportunityKey: string; runId: string; selectedIndex: number }) {
  const run = await db.aIRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId, userId: input.userId, action: "GENERATE_TOPIC_CANDIDATES", status: "SUCCEEDED" } });
  if (!run?.outputJson) throw new TrendServiceError("TREND_AI_GENERATION_FAILED", "候选选题结果不存在或已失效。");
  const output = candidateTopicsOutputSchema.parse(run.outputJson);
  const candidate = output.candidates[input.selectedIndex];
  if (!candidate) throw new TrendServiceError("TREND_AI_GENERATION_FAILED", "候选选题不存在。");
  const metadata = jsonRecord(run.metadata);
  if (metadata.opportunityKey !== input.opportunityKey) throw new TrendServiceError("TREND_AI_GENERATION_FAILED", "候选选题与当前趋势不匹配。");
  const contentsResult = externalContentSchema.array().max(5).safeParse(metadata.supportingContents ?? []);
  return createIdeaWithTrend({
    ...input,
    title: candidate.title,
    description: candidate.angle,
    candidate,
    aiRunId: run.id,
    supportingContents: contentsResult.success ? contentsResult.data : [],
  });
}
