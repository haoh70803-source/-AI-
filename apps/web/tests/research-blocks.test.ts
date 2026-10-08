import { describe, it, expect } from "vitest";
import type { ResearchSource } from "@content-center/core";
import { validateResearchAnswer, validateResearchBlocks } from "../server/research/contracts";
const sources: ResearchSource[] = [{ ref: "S1", kind: "MATERIAL", objectId: "m1", title: "Record", href: "/library/m1", capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: null, excerpt: "Observed 12 likes", version: null }];
const base = { id: "b1", title: "Result", provenance: "COMPUTED", sourceRefs: ["S1"], limitation: null };
describe("Research blocks evidence contract", () => {
  it("accepts all six block types without replacing missing values by zero", () => {
    const blocks = validateResearchBlocks([
      { ...base, type: "text", text: "A finding", provenance: "AI_INTERPRETATION", limitation: "Selected sample only" },
      { ...base, type: "metrics", items: [{ label: "Likes", value: null, unit: "", validCount: 0, denominator: 1, method: "No observed counter" }] },
      { ...base, type: "table", columns: ["Item", "Likes"], rows: [{ cells: ["A", null], sourceRefs: ["S1"] }] },
      ...["bar_chart", "line_chart"].map(type => ({ ...base, type, unit: "likes", method: "Observed counter", points: [{ label: "A", value: null, sourceRefs: ["S1"] }], lowerIsBetter: false })),
      { ...base, type: "sources", provenance: "REAL_DATA", refs: sources },
    ], sources);
    expect(blocks).toHaveLength(6);
    expect(blocks[2]).toMatchObject({ rows: [{ cells: ["A", null] }] });
  });
  it("rejects foreign citations, malformed rows and AI metric blocks", () => {
    expect(() => validateResearchBlocks([{ ...base, type: "text", text: "A", sourceRefs: ["OTHER"] }], sources)).toThrow("RESEARCH_UNKNOWN_SOURCE");
    expect(() => validateResearchBlocks([{ ...base, type: "table", columns: ["one"], rows: [{ cells: [1, 2], sourceRefs: ["S1"] }] }], sources)).toThrow("RESEARCH_INVALID_TABLE");
    expect(() => validateResearchBlocks([{ ...base, type: "metrics", provenance: "AI_INTERPRETATION", limitation: "Estimate", items: [] }], sources)).toThrow("RESEARCH_AI_NUMERIC_BLOCK");
  });
  it("rejects an invented exact number even when the cited source exists", () => {
    const answer = (text: string) => ({ sections: [{ title: "Observed", text, sourceRefs: ["S1"], limitation: "Sample only" }] });
    expect(() => validateResearchAnswer(answer("Observed 12 likes"), sources, { S1: "Observed 12 likes" })).not.toThrow();
    expect(() => validateResearchAnswer(answer("Observed 92 likes"), sources, { S1: "Observed 12 likes" })).toThrow("RESEARCH_UNSUPPORTED_NUMBER");
    expect(() => validateResearchAnswer(answer("爆款概率 87%"), sources, { S1: "87%" })).toThrow("RESEARCH_UNSUPPORTED_PREDICTION");
    const second = { ...sources[0]!, ref: "S2", excerpt: "Observed 92 likes" };
    expect(() => validateResearchAnswer(answer("Observed 92 likes"), [...sources, second], { S2: "Observed 92 likes" })).toThrow("RESEARCH_UNSUPPORTED_NUMBER");
  });
});
