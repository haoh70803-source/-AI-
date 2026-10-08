import { getAIModel, isAIProvider, type AIProvider } from "./model-catalog";

export const CURRENT_KIMI_PRODUCT_MODEL = "KIMI_2_6" as const;
export const KIMI_PRODUCT_MODEL_ALLOWLIST = [CURRENT_KIMI_PRODUCT_MODEL] as const;
export const KIMI_INTEGRATION_TYPE = "KIMI" as const;

export type LLMPolicyState = "CURRENT" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "FIXTURE";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeLLMPublicConfig(config: Record<string, unknown>) {
  if (config.integrationType === "FIXTURE" && config.productModel === "FIXTURE") return config;
  if (config.integrationType === KIMI_INTEGRATION_TYPE && config.productModel === CURRENT_KIMI_PRODUCT_MODEL) {
    return {
      provider: KIMI_INTEGRATION_TYPE,
      modelId: text(config.apiModelId),
      baseUrl: config.baseUrl,
      legacyProductModel: CURRENT_KIMI_PRODUCT_MODEL,
    };
  }
  return config;
}

function configuredModel(config: Record<string, unknown>) {
  const normalized = normalizeLLMPublicConfig(config);
  const provider = normalized.provider;
  const modelId = text(normalized.modelId);
  if (!isAIProvider(provider) || !modelId) return null;
  const model = getAIModel(provider, modelId);
  if (model) return { normalized, model };
  if (provider === "KIMI" && normalized.legacyProductModel === CURRENT_KIMI_PRODUCT_MODEL) {
    return { normalized, model: getAIModel("KIMI", "kimi-k2.6")! };
  }
  return null;
}

export function classifyLLMConfig(config: Record<string, unknown>): LLMPolicyState {
  if (config.integrationType === "FIXTURE" && config.productModel === "FIXTURE") return "FIXTURE";
  if (Object.keys(config).length === 0) return "UNCONFIGURED";
  const normalized = normalizeLLMPublicConfig(config);
  if (normalized.provider === "CUSTOM" && text(normalized.modelId) && text(normalized.baseUrl)) return "CURRENT";
  if (!isAIProvider(normalized.provider)) return "NEEDS_RECONFIGURATION";
  if (!text(normalized.modelId)) return "UNCONFIGURED";
  return configuredModel(normalized) ? "CURRENT" : "NEEDS_RECONFIGURATION";
}

export function isKimi26Config(config: Record<string, unknown>) {
  const normalized = normalizeLLMPublicConfig(config);
  return classifyLLMConfig(config) === "CURRENT" && normalized.provider === "KIMI";
}

export function isFixtureLLMConfig(config: Record<string, unknown>) {
  return classifyLLMConfig(config) === "FIXTURE";
}

export function resolveLLMModelId(provider: string, modelId: string, override?: unknown) {
  const explicit = text(override);
  if (explicit) return explicit;
  if (provider === "DEEPSEEK" && ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp"].includes(modelId)) return "deepseek-flash";
  return modelId;
}
export function configuredLLMChoice(config: Record<string, unknown>) {
  const provider = String(config.provider || "");
  const modelId = text(config.modelId);
  const apiModelId = resolveLLMModelId(provider, modelId, config.apiModelId);
  const definition = isAIProvider(provider) ? getAIModel(provider, apiModelId) : null;
  return { provider, modelId, apiModelId, label: text(config.modelDisplayName) || definition?.label || text(config.serviceName) || apiModelId };
}

export function llmRuntimeConfig(publicConfig: Record<string, unknown>, secretConfig: Record<string, unknown>) {
  const state = classifyLLMConfig(publicConfig);
  if (state === "CURRENT" && publicConfig.provider === "CUSTOM") {
    return { provider: "CUSTOM", baseUrl: publicConfig.baseUrl, apiKey: secretConfig.apiKey,
      model: resolveLLMModelId("CUSTOM", text(publicConfig.modelId), publicConfig.apiModelId), modelId: publicConfig.modelId, requestedModel: publicConfig.modelId,
      capabilities: { text: true, image: false, reasoning: false, structuredOutput: true, jsonObject: true, tools: false, responsesApi: false },
      chatStructuredOutput: "JSON_OBJECT", mode: "REAL" };
  }
  if (state === "CURRENT") {
    const resolved = configuredModel(publicConfig)!;
    const provider = resolved.normalized.provider as AIProvider;
    const modelId = text(resolved.normalized.modelId);
    return {
      provider,
      baseUrl: resolved.normalized.baseUrl,
      apiKey: secretConfig.apiKey,
      model: resolveLLMModelId(provider, modelId, resolved.normalized.apiModelId),
      modelId,
      requestedModel: modelId,
      capabilities: (getAIModel(provider, resolveLLMModelId(provider, modelId, resolved.normalized.apiModelId)) ?? resolved.model).capabilities,
      chatStructuredOutput: resolved.model.chatStructuredOutput,
      mode: "REAL",
    };
  }
  if (state === "FIXTURE") {
    return {
      provider: publicConfig.provider,
      baseUrl: publicConfig.baseUrl,
      apiKey: secretConfig.apiKey,
      model: publicConfig.apiModelId,
      modelId: publicConfig.apiModelId,
      requestedModel: publicConfig.apiModelId,
      capabilities: { text: true, image: false, reasoning: false, structuredOutput: false, jsonObject: true, tools: false, responsesApi: false },
      chatStructuredOutput: "JSON_OBJECT",
      mode: "FIXTURE",
    };
  }
  return null;
}

export const kimiRuntimeConfig = llmRuntimeConfig;
