import { describe, expect, it } from "vitest";
import { AI_MODEL_CATALOG, getAIModel, getAIModels, selectAIModel } from "./model-catalog";

describe("AI model catalog", () => {
  it("separates provider identity from stable vendor model ids", () => {
    expect(AI_MODEL_CATALOG.map(({ provider, modelId }) => ({ provider, modelId }))).toEqual([
      { provider: "KIMI", modelId: "kimi-k2.6" },
      { provider: "DEEPSEEK", modelId: "deepseek-flash" },
      { provider: "DEEPSEEK", modelId: "deepseek-v4-flash" },
      { provider: "DEEPSEEK", modelId: "deepseek-v4-pro" },
      { provider: "DEEPSEEK", modelId: "deepseek-v4-flash-vision-exp" },
    ]);
  });

  it("selects only models with confirmed task capabilities", () => {
    expect(selectAIModel({ provider: "DEEPSEEK", modelId: "deepseek-flash", requires: ["text", "image"] })?.modelId).toBe("deepseek-flash");
    expect(selectAIModel({ provider: "DEEPSEEK", modelId: "deepseek-v4-flash-vision-exp", requires: ["text", "image"] })?.modelId).toBe("deepseek-v4-flash-vision-exp");
    expect(selectAIModel({ provider: "DEEPSEEK", modelId: "deepseek-v4-flash", requires: ["image"] })).toBeNull();
    expect(selectAIModel({ provider: "DEEPSEEK", modelId: "deepseek-v4-pro", requires: ["image"] })).toBeNull();
    expect(selectAIModel({ provider: "KIMI", modelId: "kimi-k2.6", requires: ["text", "structuredOutput", "reasoning"] })?.provider).toBe("KIMI");
  });

  it("does not admit an unknown future model into production", () => {
    expect(getAIModel("DEEPSEEK", "deepseek-v5")).toBeNull();
    expect(selectAIModel({ provider: "DEEPSEEK", modelId: "deepseek-v5", requires: ["text"] })).toBeNull();
    expect(getAIModels("DEEPSEEK")).toHaveLength(4);
  });
});
