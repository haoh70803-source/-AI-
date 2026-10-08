import { describe, expect, it } from "vitest";
import { referenceScopeFromContext, sanitizeReferenceIds } from "../server/ai/reference-safety";

describe("structured output reference safety", () => {
  it("keeps only source and evidence ids present in the scoped context", () => {
    const scope = referenceScopeFromContext({
      externalReferences: {
        materials: [{ id: "source-1" }],
        evidence: [{ id: "evidence-1" }],
      },
    });
    const result = sanitizeReferenceIds({ evidenceIds: ["evidence-1", "evidence-forged"], sourceItemIds: ["source-1", "source-forged"] }, scope);
    expect(result.value).toEqual({ evidenceIds: ["evidence-1"], sourceItemIds: ["source-1"] });
    expect(result.droppedEvidenceIds).toEqual(["evidence-forged"]);
    expect(result.droppedSourceItemIds).toEqual(["source-forged"]);
  });

  it("does not infer ids from arbitrary context fields", () => {
    const scope = referenceScopeFromContext({ project: { id: "project-1" }, creatorProfile: { id: "evidence-forged" }, externalReferences: { materials: [], evidence: [] } });
    const result = sanitizeReferenceIds({ evidenceIds: ["evidence-forged"], sourceItemIds: ["source-forged"] }, scope);
    expect(result.value).toEqual({ evidenceIds: [], sourceItemIds: [] });
  });
});
