export const AI_PROVIDERS = ["KIMI", "DEEPSEEK"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export type AIModelCapabilities = {
  text: boolean;
  image: boolean;
  reasoning: boolean;
  structuredOutput: boolean;
  jsonObject: boolean;
  tools: boolean;
  responsesApi: boolean;
};

export type AIModelDefinition = {
  provider: AIProvider;
  modelId: string;
  label: string;
  defaultBaseUrl: string;
  experimental?: boolean;
  capabilities: AIModelCapabilities;
  chatStructuredOutput: "JSON_SCHEMA" | "JSON_OBJECT";
};

const kimiCapabilities: AIModelCapabilities = { text: true, image: false, reasoning: true, structuredOutput: true, jsonObject: true, tools: false, responsesApi: false };
const deepSeekTextCapabilities: AIModelCapabilities = { text: true, image: false, reasoning: true, structuredOutput: true, jsonObject: true, tools: true, responsesApi: true };

export const AI_MODEL_CATALOG = [
  { provider: "KIMI", modelId: "kimi-k2.6", label: "Kimi 2.6", defaultBaseUrl: "https://api.moonshot.cn/v1", capabilities: kimiCapabilities, chatStructuredOutput: "JSON_SCHEMA" },
  { provider: "DEEPSEEK", modelId: "deepseek-flash", label: "DeepSeek Flash", defaultBaseUrl: "https://api.deepseek.com", capabilities: { ...deepSeekTextCapabilities, image: true }, chatStructuredOutput: "JSON_OBJECT" },
  { provider: "DEEPSEEK", modelId: "deepseek-v4-flash", label: "DeepSeek V4 Flash", defaultBaseUrl: "https://api.deepseek.com", capabilities: deepSeekTextCapabilities, chatStructuredOutput: "JSON_OBJECT" },
  { provider: "DEEPSEEK", modelId: "deepseek-v4-pro", label: "DeepSeek V4 Pro", defaultBaseUrl: "https://api.deepseek.com", capabilities: deepSeekTextCapabilities, chatStructuredOutput: "JSON_OBJECT" },
  { provider: "DEEPSEEK", modelId: "deepseek-v4-flash-vision-exp", label: "DeepSeek V4 Flash Vision Exp", defaultBaseUrl: "https://api.deepseek.com", experimental: true, capabilities: { ...deepSeekTextCapabilities, image: true }, chatStructuredOutput: "JSON_OBJECT" },
] as const satisfies readonly AIModelDefinition[];

export type AIModelCapability = keyof AIModelCapabilities;

export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === "string" && AI_PROVIDERS.includes(value as AIProvider);
}

export function getAIModel(provider: AIProvider, modelId: string): AIModelDefinition | null {
  return AI_MODEL_CATALOG.find((model) => model.provider === provider && model.modelId === modelId) ?? null;
}

export function getAIModels(provider?: AIProvider) {
  return provider ? AI_MODEL_CATALOG.filter((model) => model.provider === provider) : [...AI_MODEL_CATALOG];
}

export function selectAIModel(input: { provider: AIProvider; modelId: string; requires?: readonly AIModelCapability[] }) {
  const model = getAIModel(input.provider, input.modelId);
  if (!model || input.requires?.some((capability) => !model.capabilities[capability])) return null;
  return model;
}
