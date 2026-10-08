import { describe, expect, it } from "vitest";
import { buildCreativeBasisSummary } from "../server/studio/creative-basis";
import { motherContentPreviewSchema } from "../server/ai/schemas";

describe("CreativeBasisSummary", () => {
  it("maps Evidence and source-reference gaps into product language", () => {
    const summary = buildCreativeBasisSummary({
      evidence: [{ id: "e1", type: "VIEWPOINT", excerpt: null, claim: "先建立信任", note: null, sourceItemId: "s1", sourceItem: { title: "参考素材 A" } }],
      unifiedAnalysisOutput: { groundingGaps: [{ text: "某具体增长数字" }] },
    });
    expect(summary).toMatchObject({ totalCount: 2, usableCount: 1, needsVerificationCount: 1 });
    expect(summary.items[0]).toMatchObject({ displayType: "观点", text: "先建立信任", status: "ADOPTED", provenanceType: "EVIDENCE" });
    expect(summary.items[1]).toMatchObject({ displayType: "待核实建议", verificationRequired: true, provenanceType: "AI_SUGGESTION" });
    expect(JSON.stringify(summary)).not.toContain("SOURCE_REFERENCE_GAP");
  });

  it("does not duplicate a gap that has already been confirmed as Evidence", () => {
    const summary = buildCreativeBasisSummary({
      evidence: [{ id: "e1", type: "DATA", excerpt: null, claim: "增长 20%", note: null, sourceItemId: null, sourceItem: null }],
      unifiedAnalysisOutput: { groundingGaps: ["增长 20%"] },
    });
    expect(summary).toMatchObject({ totalCount: 1, usableCount: 1, needsVerificationCount: 0 });
  });

  it("omits a dismissed AI suggestion without changing Evidence", () => {
    const first = buildCreativeBasisSummary({ evidence: [], unifiedAnalysisOutput: { groundingGaps: ["缺少来源的建议"] } });
    const summary = buildCreativeBasisSummary({ evidence: [], unifiedAnalysisOutput: { groundingGaps: ["缺少来源的建议"] }, dismissedIds: [first.items[0]!.id] });
    expect(summary).toMatchObject({ totalCount: 0, usableCount: 0, needsVerificationCount: 0 });
  });

  it("rejects empty or structurally invalid mother-content output", () => {
    expect(() => motherContentPreviewSchema.parse({ title: "", outline: [], body: "", evidenceIds: [], sourceItemIds: [] })).toThrow();
    expect(() => motherContentPreviewSchema.parse({ title: "Draft", body: "Valid body" })).toThrow();
  });
});
