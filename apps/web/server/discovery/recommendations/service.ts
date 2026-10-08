import "server-only";

import { validateRecommendationEvidence, type RecommendationCandidate } from "@content-center/core";
import { db, type Prisma, type RecommendationMode } from "@content-center/db";
import { LLMError, type LLMProvider } from "@content-center/providers";
import { executeStructuredAIRun } from "../../ai/ai-run-service";
import { loadLLMRuntime, type LLMRuntime } from "../../ai/llm-runtime";
import { renderPrompt, selectPromptTemplate } from "../../ai/prompt-service";
import { DiscoveryServiceError, startIdeaProject } from "../service";
import { buildRecommendationContext } from "./context-builder";
import { recommendationOutputSchema, type RecommendationOutputItem } from "./schemas";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function endOfLocalDay(now: Date) { const value = new Date(now); value.setHours(24, 0, 0, 0); return value; }

export class RecommendationServiceError extends Error {
  constructor(readonly code: "RECOMMENDATION_NOT_FOUND" | "RECOMMENDATION_NO_DATA" | "RECOMMENDATION_AI_FAILED" | "RECOMMENDATION_FORBIDDEN", message: string) { super(message); this.name = "RecommendationServiceError"; }
}

const ownerBatch = (input: { workspaceId: string; userId: string }) => ({ workspaceId: input.workspaceId, createdById: input.userId, workspace: { members: { some: { userId: input.userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } } } });
const ownerItem = (input: { workspaceId: string; userId: string; itemId: string }) => ({ id: input.itemId, workspaceId: input.workspaceId, batch: ownerBatch(input) });
async function requireWriter(input: { workspaceId: string; userId: string }) {
  const member = await db.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, userId: input.userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } });
  if (!member || member.role === "VIEWER") throw new RecommendationServiceError("RECOMMENDATION_FORBIDDEN", "当前权限不能修改个人推荐。");
}

const includeBatch = { items: { include: { evidence: true }, orderBy: { position: "asc" as const } } };

export function publicRecommendationBatch<T extends { generatedAt: Date; expiresAt: Date; items: Array<{ createdAt: Date; updatedAt: Date; evidence: Array<{ createdAt: Date }> }> }>(batch: T) {
  return { ...batch, generatedAt: batch.generatedAt.toISOString(), expiresAt: batch.expiresAt.toISOString(), items: batch.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), evidence: item.evidence.map((evidence) => ({ ...evidence, createdAt: evidence.createdAt.toISOString() })) })) };
}

async function recommendationMode(workspaceId: string, runtime?: LLMRuntime): Promise<{ mode: RecommendationMode; runtime?: LLMRuntime }> {
  try {
    const resolved = runtime ?? await loadLLMRuntime(workspaceId);
    return resolved.providerName === "MOCK" ? { mode: "DETERMINISTIC" } : { mode: "AI_ASSISTED", runtime: resolved };
  } catch (error) {
    if (error instanceof LLMError && ["LLM_NOT_CONFIGURED", "LLM_DISABLED", "KIMI_NOT_CONFIGURED", "KIMI_MODEL_ID_MISSING"].includes(error.code)) return { mode: "DETERMINISTIC" };
    throw error;
  }
}

export function getCurrentRecommendationBatch(input: { workspaceId: string; userId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.recommendationBatch.findFirst({ where: { ...ownerBatch(input), expiresAt: { gt: now } }, orderBy: { generatedAt: "desc" }, include: includeBatch });
}

function deterministicItems(candidates: RecommendationCandidate[], hasProfile: boolean): RecommendationOutputItem[] {
  return candidates.slice(0, 3).map((candidate) => ({
    candidateId: candidate.id,
    title: candidate.title,
    coreQuestion: `围绕“${candidate.title}”，读者现在最需要解决的具体问题是什么？`,
    angle: candidate.source === "TREND" ? "从正在出现的讨论切入，补充可核验的事实与个人判断。" : candidate.source === "BENCHMARK_CONTENT" ? "参考已有公开内容的议题，不复刻表达，寻找自己的案例与结论。" : "从已收录素材中提炼一个可验证、可展开的核心问题。",
    whyRecommended: candidate.source === "TREND" ? "现有趋势快照中出现了这一主题。" : candidate.source === "BENCHMARK_CONTENT" ? "已显式加载的对标内容中出现了这一议题。" : "个人素材库已有可继续研究的相关内容。",
    whyNow: `依据更新于 ${new Date(candidate.observedAt).toLocaleDateString("zh-CN")}。`,
    creatorFit: hasProfile ? (candidate.profileMatch ? "与创作者档案中的核心主题有直接文字匹配。" : "未发现与核心主题的直接文字匹配，需要人工判断。") : "尚未配置创作者档案，未作个性化匹配。",
    evidenceRefs: candidate.evidence.map((item) => item.referenceId),
    differenceFromRecentContent: candidate.recentSimilar ? "与近期项目存在轻量文字相似，请调整切口。" : "未发现与近期项目标题的明显重复。",
    suggestedNextStep: "先核对依据，再补充一个真实案例或可验证数据。",
    riskNotes: candidate.recentSimilar ? ["与近期内容可能相似"] : [],
    recommendedFormat: null,
  }));
}

export async function generateRecommendationBatch(input: { workspaceId: string; userId: string; force?: boolean; now?: Date }, dependencies: { runtime?: LLMRuntime } = {}) {
  await requireWriter(input);
  const now = input.now ?? new Date();
  const resolved = await recommendationMode(input.workspaceId, dependencies.runtime);
  if (!input.force) {
    const current = await getCurrentRecommendationBatch({ ...input, now });
    if (current && current.mode === resolved.mode) return current;
  }
  const context = await buildRecommendationContext({ ...input, now });
  if (!context.candidates.length) throw new RecommendationServiceError("RECOMMENDATION_NO_DATA", "还没有足够的真实内容线索。请先加载趋势、对标作品或收录素材。");
  let aiRunId: string | undefined;
  let proposed: RecommendationOutputItem[];
  if (resolved.mode === "AI_ASSISTED" && resolved.runtime) {
    const template = await selectPromptTemplate(input.workspaceId, "GENERATE_TODAY_RECOMMENDATIONS");
    const safeContext = { profile: context.profile, candidates: context.candidates.map((candidate) => ({ ...candidate, evidence: candidate.evidence.map((item) => ({ id: item.referenceId, type: item.type, title: item.title, snapshot: item.snapshot })) })), recentIdeas: context.recentIdeas, recentProjects: context.recentProjects };
    const prompt = `${renderPrompt(template.template, safeContext)}\nReturn one JSON object: {"recommendations":[{"candidateId":string,"title":string,"coreQuestion":string,"angle":string,"whyRecommended":string,"whyNow":string,"creatorFit":string,"evidenceRefs":string[],"differenceFromRecentContent":string,"suggestedNextStep":string,"riskNotes":string[],"recommendedFormat":string|null}]}`;
    try {
      const run = await executeStructuredAIRun({
        workspaceId: input.workspaceId, userId: input.userId, action: "GENERATE_TODAY_RECOMMENDATIONS", operation: "GENERATE_TODAY_RECOMMENDATIONS", promptTemplateId: template.id, promptVersion: template.version,
        inputSummary: { candidateCount: context.candidates.length, recentIdeaCount: context.recentIdeas.length, recentProjectCount: context.recentProjects.length, hasCreatorProfile: Boolean(context.profile) },
        metadata: { candidateIds: context.candidates.map((item) => item.id) }, auditMetadata: { candidateCount: context.candidates.length }, contextTruncated: context.contextTruncated,
        generate: (provider: LLMProvider) => provider.generateStructured({ systemPrompt: template.systemPrompt, prompt }, recommendationOutputSchema),
      }, { runtime: resolved.runtime });
      aiRunId = run.id;
      proposed = validateRecommendationEvidence(run.output.recommendations, context.candidates).slice(0, 5);
      if (!proposed.length) throw new RecommendationServiceError("RECOMMENDATION_AI_FAILED", "AI 返回的依据无法验证，请重试。");
    } catch (error) {
      if (error instanceof RecommendationServiceError) throw error;
      throw new RecommendationServiceError("RECOMMENDATION_AI_FAILED", "今日推荐生成失败，请稍后重试。");
    }
  } else proposed = deterministicItems(context.candidates, Boolean(context.profile));

  const candidates = new Map(context.candidates.map((item) => [item.id, item]));
  return db.recommendationBatch.create({
    data: {
      workspaceId: input.workspaceId, creatorProfileId: context.profile?.id, mode: resolved.mode, generatedAt: now, expiresAt: endOfLocalDay(now), aiRunId, createdById: input.userId,
      items: { create: proposed.map((item, position) => {
        const candidate = candidates.get(item.candidateId)!;
        const refs = new Set(item.evidenceRefs);
        return { workspaceId: input.workspaceId, position, title: item.title, coreQuestion: item.coreQuestion, angle: item.angle, whyRecommended: item.whyRecommended, whyNow: item.whyNow, creatorFit: item.creatorFit, differenceFromRecentContent: item.differenceFromRecentContent, suggestedNextStep: item.suggestedNextStep, riskNotes: json(item.riskNotes), recommendedFormat: item.recommendedFormat, evidence: { create: candidate.evidence.filter((evidence) => refs.has(evidence.referenceId)).map((evidence) => ({ workspaceId: input.workspaceId, type: evidence.type, referenceId: evidence.referenceId, snapshot: json(evidence.snapshot) })) } };
      }) },
    },
    include: includeBatch,
  });
}

export function getRecommendationItem(input: { workspaceId: string; userId: string; itemId: string }) {
  return db.recommendationItem.findFirst({ where: ownerItem(input), include: { evidence: true, batch: { select: { mode: true, generatedAt: true, creatorProfileId: true } } } });
}

async function createIdeaFromRecommendation(input: { workspaceId: string; userId: string; itemId: string; status: "INBOX" | "READY" }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT i."id" FROM "RecommendationItem" i JOIN "RecommendationBatch" b ON b."id" = i."batchId" WHERE i."id" = ${input.itemId} AND i."workspaceId" = ${input.workspaceId} AND b."workspaceId" = ${input.workspaceId} AND b."createdById" = ${input.userId} FOR UPDATE OF i`;
    const item = await tx.recommendationItem.findFirst({ where: ownerItem(input), include: { evidence: true, batch: { select: { mode: true } } } });
    if (!item) throw new RecommendationServiceError("RECOMMENDATION_NOT_FOUND", "推荐内容不存在。");
    if (item.contentIdeaId) {
      const existing = await tx.contentIdea.findFirst({ where: { id: item.contentIdeaId, workspaceId: input.workspaceId, createdById: input.userId }, select: { id: true } });
      if (!existing) throw new RecommendationServiceError("RECOMMENDATION_NOT_FOUND", "已保存的选题不可访问。");
      if (input.status === "READY") await tx.contentIdea.updateMany({ where: { id: existing.id, workspaceId: input.workspaceId, createdById: input.userId }, data: { status: "READY" } });
      return existing.id;
    }
    // Saving is an explicit share of the chosen topic, not of the private profile or rationale.
    const created = await tx.contentIdea.create({ data: { workspaceId: input.workspaceId, title: item.title, description: item.angle, status: input.status, createdById: input.userId } });
    for (const evidence of item.evidence) {
      if (evidence.type === "TREND") {
        const trend = await tx.trendSnapshot.findFirst({ where: { id: evidence.referenceId, workspaceId: input.workspaceId } });
        if (trend) await tx.contentIdeaReference.create({ data: { ideaId: created.id, platform: trend.platform === "GLOBAL" ? "OTHER" : trend.platform, externalId: trend.externalKey, title: trend.title, url: `/discovery/trends/${encodeURIComponent(trend.externalKey)}`, metadataSnapshot: json({ referenceType: "TREND", observedAt: trend.observedAt }), trendSnapshotId: trend.id } });
      }
      if (evidence.type === "BENCHMARK_CONTENT") {
        const benchmark = await tx.benchmarkContentSnapshot.findFirst({ where: { id: evidence.referenceId, workspaceId: input.workspaceId } });
        if (benchmark) await tx.contentIdeaReference.create({ data: { ideaId: created.id, platform: benchmark.platform, externalId: benchmark.externalId, title: benchmark.title, url: benchmark.url, authorName: benchmark.authorName, coverUrl: benchmark.coverUrl, metadataSnapshot: json({ referenceType: "BENCHMARK_CONTENT", observedAt: benchmark.observedAt }) } });
      }
      if (evidence.type === "SOURCE_ITEM") {
        const source = await tx.sourceItem.findFirst({ where: { id: evidence.referenceId, workspaceId: input.workspaceId } });
        if (source) await tx.contentIdeaReference.create({ data: { ideaId: created.id, platform: source.sourcePlatform, externalId: source.externalId ?? source.id, title: source.title || item.title, url: source.sourceUrl || `/library/${source.id}`, authorName: source.author, coverUrl: source.thumbnailUrl, metadataSnapshot: json({ referenceType: "SOURCE_ITEM", title: source.title }), sourceItemId: source.id } });
      }
    }
    await tx.recommendationItem.updateMany({ where: ownerItem(input), data: { contentIdeaId: created.id, status: "SAVED" } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.recommendation_saved", resourceType: "recommendation_item", resourceId: item.id, metadata: json({ contentIdeaId: created.id, mode: item.batch.mode }) } });
    return created.id;
  });
}

export async function actOnRecommendation(input: { workspaceId: string; userId: string; itemId: string; action: "DISMISS" | "SAVE_IDEA" | "START_RESEARCH" | "START_CREATION"; collectMissing?: boolean }) {
  await requireWriter(input);
  const item = await getRecommendationItem(input);
  if (!item) throw new RecommendationServiceError("RECOMMENDATION_NOT_FOUND", "推荐内容不存在。");
  if (input.action === "DISMISS") { await db.recommendationItem.updateMany({ where: ownerItem(input), data: { status: "DISMISSED" } }); return { status: "DISMISSED" as const }; }
  const ideaId = await createIdeaFromRecommendation({ ...input, status: input.action === "SAVE_IDEA" ? "INBOX" : "READY" });
  if (input.action !== "START_CREATION") return { status: "SAVED" as const, ideaId };
  try {
    const started = await startIdeaProject({ workspaceId: input.workspaceId, userId: input.userId, ideaId, collectMissing: input.collectMissing ?? false });
    await db.recommendationItem.updateMany({ where: ownerItem(input), data: { status: "STARTED", projectId: started.projectId } });
    return { status: "STARTED" as const, ideaId, projectId: started.projectId };
  } catch (error) {
    if (error instanceof DiscoveryServiceError && error.code === "IDEA_REFERENCES_REQUIRE_COLLECTION") return { status: "CONFIRM_COLLECTION" as const, ideaId };
    throw error;
  }
}
