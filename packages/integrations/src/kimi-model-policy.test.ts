import { describe, expect, it } from "vitest";
import { classifyLLMConfig, llmRuntimeConfig, normalizeLLMPublicConfig } from "./kimi-model-policy";

describe("LLM model policy", () => {
  it("accepts catalog-backed Kimi and DeepSeek models", () => {
    expect(classifyLLMConfig({ provider: "KIMI", modelId: "kimi-k2.6", baseUrl: "https://api.moonshot.cn/v1" })).toBe("CURRENT");
    expect(classifyLLMConfig({ provider: "DEEPSEEK", modelId: "deepseek-v4-pro", baseUrl: "https://api.deepseek.com" })).toBe("CURRENT");
  });

  it("keeps the old KIMI_2_6 config readable without a data migration", () => {
    const legacy = { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: "https://example.invalid/v1", apiModelId: "workspace-confirmed-model-id" };
    expect(normalizeLLMPublicConfig(legacy)).toMatchObject({ provider: "KIMI", modelId: "workspace-confirmed-model-id", legacyProductModel: "KIMI_2_6" });
    expect(classifyLLMConfig(legacy)).toBe("CURRENT");
    expect(llmRuntimeConfig(legacy, { apiKey: "test-secret" })).toMatchObject({ provider: "KIMI", model: "workspace-confirmed-model-id", requestedModel: "workspace-confirmed-model-id", chatStructuredOutput: "JSON_SCHEMA" });
  });

  it("fails closed for missing and unknown models", () => {
    expect(classifyLLMConfig({ provider: "DEEPSEEK", baseUrl: "https://api.deepseek.com" })).toBe("UNCONFIGURED");
    expect(classifyLLMConfig({ provider: "DEEPSEEK", modelId: "deepseek-v5", baseUrl: "https://api.deepseek.com" })).toBe("NEEDS_RECONFIGURATION");
    expect(llmRuntimeConfig({ provider: "DEEPSEEK", modelId: "deepseek-v5", baseUrl: "https://api.deepseek.com" }, { apiKey: "test-secret" })).toBeNull();
  });
});

describe("provider model ID mapping", () => {
  it("canonicalizes retired Flash aliases while preserving the saved choice", () => { expect(llmRuntimeConfig({ provider: "DEEPSEEK", modelId: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com" }, { apiKey: "secret" })).toMatchObject({ model: "deepseek-flash", requestedModel: "deepseek-v4-flash" }); });
  it("uses an explicit API mapping without migrating credentials", () => { expect(llmRuntimeConfig({ provider: "DEEPSEEK", modelId: "deepseek-v4-flash", apiModelId: "workspace-approved-model", baseUrl: "https://api.deepseek.com" }, { apiKey: "secret" })).toMatchObject({ model: "workspace-approved-model", apiKey: "secret", requestedModel: "deepseek-v4-flash" }); });
});
