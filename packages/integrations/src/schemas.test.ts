import { describe, expect, it } from "vitest";
import { parseProviderConfig, splitProviderConfig } from "./schemas";

describe("provider config schemas", () => {
  it("validates RedFox public and secret fields without guessing an endpoint", () => {
    expect(parseProviderConfig("REDFOX", { baseUrl: "https://example.invalid", apiKey: "fake-key" })).toEqual({
      baseUrl: "https://example.invalid",
      apiKey: "fake-key",
    });
    expect(() => parseProviderConfig("REDFOX", { baseUrl: "not-a-url", apiKey: "fake-key" })).toThrow();
    expect(() => parseProviderConfig("REDFOX", { baseUrl: "https://example.invalid", unknown: true })).toThrow();
  });

  it("defaults Doubao to the current API key protocol", () => {
    expect(parseProviderConfig("DOUBAO_ASR", {})).toEqual({
      authMode: "API_KEY",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "volc.bigasr.auc_turbo",
    });
    const parsed = parseProviderConfig("DOUBAO_ASR", {
      authMode: "API_KEY",
      apiKey: "fake-api-key",
      protocol: "RECORDING_FILE_2_0",
      boostingTableId: "table-id",
    });
    const split = splitProviderConfig("DOUBAO_ASR", parsed);
    expect(split.publicConfig).toMatchObject({ authMode: "API_KEY", resourceId: "volc.bigasr.auc_turbo", protocol: "RECORDING_FILE_2_0", boostingTableId: "table-id" });
    expect(split.secretConfig).toEqual({ apiKey: "fake-api-key" });
  });

  it("keeps the documented legacy Doubao authentication mode", () => {
    const parsed = parseProviderConfig("DOUBAO_ASR", { appId: "legacy-app", accessToken: "legacy-token" });
    expect(parsed).toMatchObject({ authMode: "LEGACY_APP_TOKEN", appId: "legacy-app" });
    expect(splitProviderConfig("DOUBAO_ASR", parsed).secretConfig).toEqual({ accessToken: "legacy-token" });
  });

  it("accepts catalog models and normalizes the legacy Kimi 2.6 shape", () => {
    expect(parseProviderConfig("LLM", {
      provider: "KIMI",
      apiKey: "fake-key",
      modelId: "kimi-k2.6",
    })).toMatchObject({ provider: "KIMI", modelId: "kimi-k2.6", baseUrl: "https://api.moonshot.cn/v1" });
    expect(parseProviderConfig("LLM", {
      provider: "DEEPSEEK",
      apiKey: "fake-key",
      modelId: "deepseek-v4-pro",
    })).toMatchObject({ provider: "DEEPSEEK", modelId: "deepseek-v4-pro", baseUrl: "https://api.deepseek.com" });
    expect(parseProviderConfig("LLM", { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: "https://example.invalid/v1", apiModelId: "legacy-model-id" })).toMatchObject({ provider: "KIMI", modelId: "legacy-model-id", legacyProductModel: "KIMI_2_6" });
    expect(() => parseProviderConfig("LLM", {
      provider: "KIMI",
      modelId: "kimi-k2.6",
      model: "browser-override",
    })).toThrow();
    expect(() => parseProviderConfig("LLM", {
      provider: "DEEPSEEK",
      modelId: "deepseek-v5",
    })).toThrow();
  });

  it("allows the OpenAI-compatible fixture only through the explicit internal fixture mode", () => {
    const fixture = { provider: "fixture-openai-compatible", baseUrl: "http://127.0.0.1:4311/v1", apiKey: "fixture-key", model: "fixture-model" };
    expect(() => parseProviderConfig("LLM", fixture)).toThrow();
    expect(parseProviderConfig("LLM", fixture, { allowFixture: true })).toMatchObject({
      integrationType: "FIXTURE",
      productModel: "FIXTURE",
      apiModelId: "fixture-model",
    });
  });

  it("stores product-level transcription choices without exposing model routing", () => {
    expect(parseProviderConfig("TRANSCRIPTION", {})).toEqual({
      source: "LOCAL_FUNASR",
      qualityMode: "BALANCED",
      selectionMode: "AUTO",
      fallbackToDoubao: false,
      endpoint: "http://127.0.0.1:8765",
    });
    const parsed = parseProviderConfig("TRANSCRIPTION", {
      source: "LOCAL_FUNASR",
      qualityMode: "QUALITY",
      selectionMode: "MANUAL",
      manualModel: "FUN_ASR_NANO",
      fallbackToDoubao: true,
      endpoint: "http://localhost:8765",
    });
    expect(splitProviderConfig("TRANSCRIPTION", parsed)).toEqual({ publicConfig: parsed, secretConfig: {} });
    expect(() => parseProviderConfig("TRANSCRIPTION", { endpoint: "http://192.168.1.10:8765" })).toThrow();
  });
});
