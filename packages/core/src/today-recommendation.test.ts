import { describe, expect, it } from "vitest";
import { buildRecommendationCandidates, titleSimilarity, validateRecommendationEvidence, type RecommendationCandidate } from "./today-recommendation";

const candidate = (id: string, title: string, source: RecommendationCandidate["source"] = "TREND") => ({ id, title, source, observedAt: "2026-09-02T08:00:00.000Z", evidence: [{ type: source, referenceId: `${id}:e`, title, snapshot: {} }], profileMatch: false, crossPlatform: false, rank: 1 });

describe("today recommendations", () => {
  it("normalizes exact duplicates and excludes READY/IN_PROGRESS titles supplied by caller", () => {
    const items = buildRecommendationCandidates({ candidates: [candidate("a", "AI 创作！"), candidate("b", "ai创作"), candidate("c", "内容策略")], activeIdeaTitles: ["内容 策略"], recentProjectTitles: [] });
    expect(items.map((item) => item.id)).toEqual(["a"]);
  });

  it("marks similar recent work without filtering it", () => {
    const [item] = buildRecommendationCandidates({ candidates: [candidate("a", "普通人如何建立 AI 内容工作流")], activeIdeaTitles: [], recentProjectTitles: ["建立你的 AI 内容工作流"] });
    expect(item?.recentSimilar).toBe(true);
    expect(titleSimilarity("AI 内容工作流", "AI内容工作流")).toBe(1);
  });

  it("ranks stable signals and enforces the context limit", () => {
    const items = buildRecommendationCandidates({ candidates: Array.from({ length: 20 }, (_, index) => ({ ...candidate(String(index), `主题${index}`, index ? "SOURCE_ITEM" : "TREND"), crossPlatform: index === 0 })), activeIdeaTitles: [], recentProjectTitles: [], limit: 15 });
    expect(items).toHaveLength(15);
    expect(items[0]?.id).toBe("0");
  });

  it("drops forged candidates and forged evidence ids", () => {
    const candidates = buildRecommendationCandidates({ candidates: [candidate("a", "真实主题")], activeIdeaTitles: [], recentProjectTitles: [] });
    const valid = validateRecommendationEvidence([{ candidateId: "a", evidenceRefs: ["a:e", "forged"] }, { candidateId: "forged", evidenceRefs: ["a:e"] }], candidates);
    expect(valid).toEqual([{ candidateId: "a", evidenceRefs: ["a:e"] }]);
  });
});
