import { describe, expect, it } from "vitest";
import { generationQualityContract } from "./generation-quality";

describe("model-independent generation quality contract", () => {
  it("keeps fact, originality, user constraint, and natural-language boundaries together", () => {
    expect(generationQualityContract).toContain("Follow explicit user constraints before every other writing preference");
    expect(generationQualityContract).toContain("Never invent or transfer customers, revenue, results, projects, experience, numbers, product capabilities, or completed work");
    expect(generationQualityContract).toContain("Do not copy, splice, or produce a synonym-substituted version");
    expect(generationQualityContract).toContain("Avoid generic filler");
    expect(generationQualityContract).toContain("one clear main idea");
    expect(generationQualityContract).toContain("one fixed viral template");
    expect(generationQualityContract).toContain("Only explicitly confirmed preferences");
    expect(generationQualityContract).toContain("cannot create a source, decide fact ownership");
  });
});
