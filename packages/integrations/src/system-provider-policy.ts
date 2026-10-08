import type { ConfigurableIntegrationProvider } from "./schemas";
import { getAIModel, getAIModels, isAIProvider } from "./model-catalog";

const value = (name: string) => process.env[name]?.trim() || undefined;

export function systemManagedProvidersEnabled() {
  if (process.env.ENVIRONMENT_ID === "LOCAL_TEST" && process.env.PLAYWRIGHT_SERVER_MODE === "production") return process.env.SYSTEM_MANAGED_PROVIDERS === "true";
  return process.env.SYSTEM_MANAGED_PROVIDERS === "true";
}

export function getSystemProviderConfig(provider: ConfigurableIntegrationProvider): Record<string, unknown> | null {
  if (!systemManagedProvidersEnabled()) return null;
  if (provider === "LLM") {
    const requestedProvider = value("AI_PROVIDER") ?? "KIMI";
    if (!isAIProvider(requestedProvider)) return null;
    const modelId = value("AI_MODEL_ID") ?? value(requestedProvider === "KIMI" ? "KIMI_MODEL_ID" : "DEEPSEEK_MODEL_ID") ?? getAIModels(requestedProvider)[0]?.modelId;
    const model = modelId ? getAIModel(requestedProvider, modelId) : null;
    if (!model) return null;
    const apiKey = value(requestedProvider === "KIMI" ? "KIMI_API_KEY" : "DEEPSEEK_API_KEY");
    const baseUrl = value("AI_BASE_URL") ?? value(requestedProvider === "KIMI" ? "KIMI_BASE_URL" : "DEEPSEEK_BASE_URL") ?? model.defaultBaseUrl;
    return apiKey ? {
      provider: requestedProvider,
      baseUrl,
      apiKey,
      model: model.modelId,
      modelId: model.modelId,
      requestedModel: model.modelId,
      capabilities: model.capabilities,
      chatStructuredOutput: model.chatStructuredOutput,
      mode: "REAL",
    } : null;
  }
  if (provider === "REDFOX") {
    const apiKey = value("REDFOX_API_KEY");
    return apiKey ? { apiKey, baseUrl: value("REDFOX_BASE_URL") ?? "https://redfox.hk" } : null;
  }
  if (provider === "DOUBAO_ASR") {
    const apiKey = value("DOUBAO_API_KEY");
    const appId = value("DOUBAO_APP_ID");
    const accessToken = value("DOUBAO_ACCESS_TOKEN");
    const resourceId = value("DOUBAO_ASR_RESOURCE_ID");
    if (!resourceId || (!apiKey && !(appId && accessToken))) return null;
    return {
      authMode: apiKey ? "API_KEY" : "LEGACY_APP_TOKEN",
      baseUrl: value("DOUBAO_ASR_BASE_URL") ?? "https://openspeech.bytedance.com",
      resourceId,
      ...(apiKey ? { apiKey } : { appId, accessToken }),
      protocol: "RECORDING_FILE_2_0",
    };
  }
  if (provider === "WEB_SEARCH") { const apiKey = value("EXA_API_KEY"); return apiKey ? { apiKey } : null; }
  const transcriptionPrimary = value("TRANSCRIPTION_PRIMARY")
    ?? (process.env.NODE_ENV === "production" ? "DOUBAO_RECORDING_FILE_2_0" : "LOCAL_FUNASR");
  return {
    source: transcriptionPrimary === "DOUBAO_RECORDING_FILE_2_0" ? "DOUBAO" : "LOCAL_FUNASR",
    qualityMode: "BALANCED",
    selectionMode: "AUTO",
    fallbackToDoubao: false,
    endpoint: value("LOCAL_ASR_ENDPOINT") ?? "http://127.0.0.1:8765",
  };
}

export function getSystemProviderPublicConfig(provider: ConfigurableIntegrationProvider) {
  const config = getSystemProviderConfig(provider);
  if (!config) return null;
  return Object.fromEntries(Object.entries(config).filter(([key]) => key !== "apiKey" && key !== "accessToken"));
}
