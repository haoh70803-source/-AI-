import "server-only";

import { buildRecommendationCandidates, normalizeRecommendationTitle, type RecommendationCandidate, type RecommendationEvidenceInput } from "@content-center/core";
import { db } from "@content-center/db";
import { listTrendOpportunities } from "../trends/read-model";

function strings(value: unknown, take = 12) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, take) : [];
}

function profileMatches(title: string, topics: string[]) {
  const normalized = normalizeRecommendationTitle(title);
  return topics.some((topic) => normalized.includes(normalizeRecommendationTitle(topic)));
}

export async function buildRecommendationContext(input: { workspaceId: string; userId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const [profile, benchmarkContents, ideas, projects, sources, hot, surging, darkHorse] = await Promise.all([
    db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } }),
    db.benchmarkContentSnapshot.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { observedAt: "desc" }, take: 20 }),
    db.contentIdea.findMany({ where: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, description: true, status: true, updatedAt: true } }),
    db.contentProject.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, status: true, updatedAt: true } }),
    db.sourceItem.findMany({ where: { workspaceId: input.workspaceId, status: "READY" }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, description: true, sourcePlatform: true, updatedAt: true } }),
    listTrendOpportunities({ workspaceId: input.workspaceId, window: "TODAY", platform: "ALL", type: "HOT", take: 8, now }),
    listTrendOpportunities({ workspaceId: input.workspaceId, window: "TODAY", platform: "ALL", type: "SURGING", take: 8, now }),
    listTrendOpportunities({ workspaceId: input.workspaceId, window: "TODAY", platform: "ALL", type: "DARK_HORSE", take: 8, now }),
  ]);
  const topics = profile ? strings(profile.coreTopics) : [];
  const profileEvidence: RecommendationEvidenceInput[] = profile ? [{ type: "CREATOR_PROFILE", referenceId: profile.id, title: profile.displayName || "创作者档案", snapshot: { positioning: profile.positioning, targetAudience: profile.targetAudience, coreTopics: topics } }] : [];
  const raw: Omit<RecommendationCandidate, "recentSimilar">[] = [];
  for (const trend of [...hot, ...surging, ...darkHorse]) raw.push({
    id: `trend:${trend.deterministicKey}`,
    title: trend.title,
    source: "TREND",
    observedAt: trend.observedAt,
    profileMatch: profileMatches(trend.title, topics),
    crossPlatform: trend.platform === "CROSS_PLATFORM",
    rank: trend.rank,
    evidence: [
      ...trend.supportingSnapshotIds.map((id) => ({ type: "TREND" as const, referenceId: id, title: trend.title, snapshot: { title: trend.title, platform: trend.platform, type: trend.type, rank: trend.rank, state: trend.state, observedAt: trend.observedAt } })),
      ...(profileMatches(trend.title, topics) ? profileEvidence : []),
    ],
  });
  for (const item of benchmarkContents) raw.push({
    id: `benchmark:${item.id}`, title: item.title, source: "BENCHMARK_CONTENT", observedAt: item.observedAt.toISOString(), profileMatch: profileMatches(item.title, topics), crossPlatform: false, rank: null,
    evidence: [{ type: "BENCHMARK_CONTENT", referenceId: item.id, title: item.title, snapshot: { title: item.title, platform: item.platform, authorName: item.authorName, url: item.url, observedAt: item.observedAt.toISOString() } }, ...(profileMatches(item.title, topics) ? profileEvidence : [])],
  });
  for (const source of sources) if (source.title?.trim()) raw.push({
    id: `source:${source.id}`, title: source.title, source: "SOURCE_ITEM", observedAt: source.updatedAt.toISOString(), profileMatch: profileMatches(source.title, topics), crossPlatform: false, rank: null,
    evidence: [{ type: "SOURCE_ITEM", referenceId: source.id, title: source.title, snapshot: { title: source.title, description: source.description?.slice(0, 300) ?? null, platform: source.sourcePlatform, updatedAt: source.updatedAt.toISOString() } }, ...(profileMatches(source.title, topics) ? profileEvidence : [])],
  });
  const candidates = buildRecommendationCandidates({
    candidates: raw,
    activeIdeaTitles: ideas.filter((item) => item.status === "READY" || item.status === "IN_PROGRESS").map((item) => item.title),
    recentProjectTitles: projects.map((item) => item.title),
    limit: 15,
  });
  return {
    profile: profile ? { id: profile.id, positioning: profile.positioning, targetAudience: profile.targetAudience, tone: profile.tone, coreTopics: topics, preferredStyle: profile.preferredStyle } : null,
    candidates,
    recentIdeas: ideas.slice(0, 8).map((item) => ({ id: item.id, title: item.title, status: item.status })),
    recentProjects: projects.slice(0, 8).map((item) => ({ id: item.id, title: item.title, status: item.status })),
    contextTruncated: raw.length > 15 || ideas.length > 8 || projects.length > 8,
  };
}
