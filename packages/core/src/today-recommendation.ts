import { normalizeTrendKeyword } from "./trend";

export type RecommendationEvidenceInput = {
  type: "TREND" | "BENCHMARK_CONTENT" | "CONTENT_IDEA" | "SOURCE_ITEM" | "PROJECT" | "CREATOR_PROFILE";
  referenceId: string;
  title: string;
  snapshot: Record<string, unknown>;
};

export type RecommendationCandidate = {
  id: string;
  title: string;
  source: "TREND" | "BENCHMARK_CONTENT" | "SOURCE_ITEM" | "CONTENT_IDEA";
  observedAt: string;
  evidence: RecommendationEvidenceInput[];
  profileMatch: boolean;
  recentSimilar: boolean;
  crossPlatform: boolean;
  rank: number | null;
};

export function normalizeRecommendationTitle(value: string) {
  return normalizeTrendKeyword(value);
}

export function titleSimilarity(left: string, right: string) {
  const chars = (value: string) => new Set([...normalizeRecommendationTitle(value)].filter((char) => /[\p{L}\p{N}]/u.test(char)));
  const a = chars(left); const b = chars(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((char) => b.has(char)).length;
  return intersection / Math.max(a.size, b.size);
}

export function buildRecommendationCandidates(input: {
  candidates: Omit<RecommendationCandidate, "recentSimilar">[];
  activeIdeaTitles: string[];
  recentProjectTitles: string[];
  limit?: number;
}) {
  const excluded = new Set(input.activeIdeaTitles.map(normalizeRecommendationTitle));
  const seen = new Set<string>();
  return input.candidates.flatMap((candidate) => {
    const normalized = normalizeRecommendationTitle(candidate.title);
    if (!normalized || excluded.has(normalized) || seen.has(normalized)) return [];
    seen.add(normalized);
    const recentSimilar = input.recentProjectTitles.some((title) => titleSimilarity(candidate.title, title) >= 0.6);
    return [{ ...candidate, recentSimilar }];
  }).sort((left, right) => {
    const score = (item: RecommendationCandidate) =>
      (item.source === "TREND" ? 30 : item.source === "BENCHMARK_CONTENT" ? 20 : item.source === "CONTENT_IDEA" ? 15 : 10)
      + (item.crossPlatform ? 12 : 0)
      + (item.profileMatch ? 8 : 0)
      - (item.recentSimilar ? 8 : 0)
      - Math.min(item.rank ?? 100, 100) / 100;
    return score(right) - score(left) || right.observedAt.localeCompare(left.observedAt) || left.id.localeCompare(right.id);
  }).slice(0, input.limit ?? 15);
}

export function validateRecommendationEvidence<T extends { candidateId: string; evidenceRefs: string[] }>(
  items: T[],
  candidates: RecommendationCandidate[],
) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return items.flatMap((item) => {
    const candidate = byId.get(item.candidateId);
    if (!candidate) return [];
    const allowed = new Set(candidate.evidence.map((evidence) => evidence.referenceId));
    const evidenceRefs = [...new Set(item.evidenceRefs.filter((id) => allowed.has(id)))];
    return evidenceRefs.length ? [{ ...item, evidenceRefs }] : [];
  });
}
