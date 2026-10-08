import { z } from "zod";
import { AI_PROVIDERS, getAIModel } from "./model-catalog";
import { CURRENT_KIMI_PRODUCT_MODEL, KIMI_INTEGRATION_TYPE } from "./kimi-model-policy";
import { normalizeLLMPublicConfig } from "./kimi-model-policy";

export const CONFIGURABLE_INTEGRATION_PROVIDERS = ["REDFOX", "DOUBAO_ASR", "TRANSCRIPTION", "LLM", "WEB_SEARCH"] as const;
export type ConfigurableIntegrationProvider = (typeof CONFIGURABLE_INTEGRATION_PROVIDERS)[number];

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().max(2_000).optional(),
);

export const DOUBAO_DEFAULT_BASE_URL = "https://openspeech.bytedance.com";
export const DOUBAO_DEFAULT_RESOURCE_ID = "volc.bigasr.auc_turbo";
export const DOUBAO_AUTH_MODES = ["API_KEY", "LEGACY_APP_TOKEN"] as const;
export const DOUBAO_PROTOCOLS = ["FLASH", "RECORDING_FILE_2_0"] as const;
export const TRANSCRIPTION_SOURCES = ["LOCAL_FUNASR", "DOUBAO"] as const;
export const TRANSCRIPTION_QUALITY_MODES = ["FAST", "BALANCED", "QUALITY"] as const;
export const TRANSCRIPTION_MODEL_SELECTION_MODES = ["AUTO", "MANUAL"] as const;
export const LOCAL_TRANSCRIPTION_MODELS = ["SENSEVOICE_SMALL", "PARAFORMER_ZH", "FUN_ASR_NANO"] as const;
export const LOCAL_ASR_DEFAULT_ENDPOINT = "http://127.0.0.1:8765";

const optionalAuthMode = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.enum(DOUBAO_AUTH_MODES).optional(),
);

export const redfoxConfigSchema = z
  .object({
    baseUrl: z.string().trim().url().max(2_000),
    apiKey: optionalText(10_000),
  })
  .strict();

export const doubaoAsrConfigSchema = z
  .object({
    authMode: optionalAuthMode,
    baseUrl: optionalUrl,
    apiKey: optionalText(10_000),
    appId: optionalText(500),
    accessToken: optionalText(10_000),
    resourceId: optionalText(500),
    protocol: z.enum(DOUBAO_PROTOCOLS).optional(),
    boostingTableId: optionalText(500),
    boostingTableName: optionalText(500),
  })
  .strict()
  .transform((config) => ({
    ...config,
    authMode: config.authMode ?? (config.appId || config.accessToken ? "LEGACY_APP_TOKEN" as const : "API_KEY" as const),
    baseUrl: config.baseUrl ?? DOUBAO_DEFAULT_BASE_URL,
    resourceId: config.resourceId ?? DOUBAO_DEFAULT_RESOURCE_ID,
  }));

export const transcriptionConfigSchema = z
  .object({
    source: z.enum(TRANSCRIPTION_SOURCES).default("LOCAL_FUNASR"),
    qualityMode: z.enum(TRANSCRIPTION_QUALITY_MODES).default("BALANCED"),
    selectionMode: z.enum(TRANSCRIPTION_MODEL_SELECTION_MODES).default("AUTO"),
    manualModel: z.enum(LOCAL_TRANSCRIPTION_MODELS).optional(),
    fallbackToDoubao: z.boolean().default(false),
    endpoint: z.string().trim().url().max(2_000).default(LOCAL_ASR_DEFAULT_ENDPOINT),
  })
  .strict()
  .superRefine((config, context) => {
    const endpoint = new URL(config.endpoint);
    if (!(["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname)) || endpoint.protocol !== "http:") {
      context.addIssue({ code: "custom", path: ["endpoint"], message: "Local ASR endpoint must use loopback HTTP." });
    }
    if (config.selectionMode === "MANUAL" && !config.manualModel) {
      context.addIssue({ code: "custom", path: ["manualModel"], message: "Manual model is required." });
    }
  });

const legacyKimiConfigSchema = z
  .object({
    integrationType: z.literal(KIMI_INTEGRATION_TYPE),
    productModel: z.literal(CURRENT_KIMI_PRODUCT_MODEL),
    baseUrl: z.string().trim().url().max(2_000),
    apiKey: optionalText(10_000),
    apiModelId: optionalText(200),
  })
  .strict()
  .transform((config) => ({
    provider: "KIMI" as const,
    modelId: config.apiModelId,
    baseUrl: config.baseUrl,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    legacyProductModel: CURRENT_KIMI_PRODUCT_MODEL,
  }));

const catalogLLMConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  modelId: z.string().trim().min(1).max(200),
  apiModelId: optionalText(200),
  modelDisplayName: optionalText(80),
  baseUrl: optionalUrl,
  apiKey: optionalText(10_000),
}).strict().superRefine((config, context) => {
  if (!getAIModel(config.provider, config.modelId)) context.addIssue({ code: "custom", path: ["modelId"], message: "Model is not in the approved catalog." });
}).transform((config) => ({ ...config, baseUrl: config.baseUrl ?? getAIModel(config.provider, config.modelId)!.defaultBaseUrl }));

const customLLMConfigSchema = z.object({
  provider: z.literal("CUSTOM"),
  serviceName: z.string().trim().min(1).max(80),
  modelId: z.string().trim().min(1).max(200),
  apiModelId: optionalText(200),
  modelDisplayName: optionalText(80),
  baseUrl: z.string().trim().url().max(2000),
  apiKey: optionalText(10000),
}).strict();
export const llmConfigSchema = z.union([catalogLLMConfigSchema, legacyKimiConfigSchema, customLLMConfigSchema]);

const fixtureLLMConfigSchema = z
  .object({
    provider: z.literal("fixture-openai-compatible"),
    baseUrl: z.string().trim().url().max(2_000),
    apiKey: optionalText(10_000),
    model: z.string().trim().min(1).max(200),
  })
  .strict()
  .transform((config) => ({
    integrationType: "FIXTURE" as const,
    productModel: "FIXTURE" as const,
    provider: config.provider,
    baseUrl: config.baseUrl,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    apiModelId: config.model,
  }));

export const providerConfigSchemas = {
  WEB_SEARCH: z.object({ apiKey: optionalText(10_000) }).strict(),
  REDFOX: redfoxConfigSchema,
  DOUBAO_ASR: doubaoAsrConfigSchema,
  TRANSCRIPTION: transcriptionConfigSchema,
  LLM: llmConfigSchema,
} as const;

export const providerConfigFields: Record<
  ConfigurableIntegrationProvider,
  { publicFields: readonly string[]; secretFields: readonly string[]; primarySecret?: string }
> = {
  WEB_SEARCH: { publicFields: [], secretFields: ["apiKey"], primarySecret: "apiKey" },
  REDFOX: { publicFields: ["baseUrl"], secretFields: ["apiKey"], primarySecret: "apiKey" },
  DOUBAO_ASR: {
    publicFields: ["authMode", "baseUrl", "appId", "resourceId", "protocol", "boostingTableId", "boostingTableName"],
    secretFields: ["apiKey", "accessToken"],
    primarySecret: "apiKey",
  },
  TRANSCRIPTION: {
    publicFields: ["source", "qualityMode", "selectionMode", "manualModel", "fallbackToDoubao", "endpoint"],
    secretFields: [],
  },
  LLM: { publicFields: ["modelDisplayName", "serviceName", "provider", "modelId", "baseUrl", "legacyProductModel", "integrationType", "productModel", "apiModelId"], secretFields: ["apiKey"], primarySecret: "apiKey" },
};

export function normalizePublicProviderConfig(
  provider: ConfigurableIntegrationProvider,
  config: Record<string, unknown>,
) {
  if (provider === "LLM") {
    return normalizeLLMPublicConfig(config);
  }
  if (provider !== "DOUBAO_ASR") return config;
  const authMode = config.authMode === "LEGACY_APP_TOKEN" || (!config.authMode && config.appId)
    ? "LEGACY_APP_TOKEN"
    : "API_KEY";
  return {
    ...config,
    authMode,
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : DOUBAO_DEFAULT_BASE_URL,
    resourceId: typeof config.resourceId === "string" ? config.resourceId : DOUBAO_DEFAULT_RESOURCE_ID,
  };
}

export function primarySecretField(
  provider: ConfigurableIntegrationProvider,
  config: Record<string, unknown>,
) {
  if (provider === "DOUBAO_ASR") {
    return config.authMode === "LEGACY_APP_TOKEN" ? "accessToken" : "apiKey";
  }
  return providerConfigFields[provider].primarySecret;
}

export function providerRequiresSecret(provider: ConfigurableIntegrationProvider) {
  return providerConfigFields[provider].secretFields.length > 0;
}

export function isConfigurableIntegrationProvider(value: string): value is ConfigurableIntegrationProvider {
  return CONFIGURABLE_INTEGRATION_PROVIDERS.includes(value as ConfigurableIntegrationProvider);
}

export function parseProviderConfig(
  provider: ConfigurableIntegrationProvider,
  input: unknown,
  options: { allowFixture?: boolean } = {},
) {
  if (provider === "LLM" && options.allowFixture) {
    return fixtureLLMConfigSchema.parse(input) as Record<string, unknown>;
  }
  const parsed = providerConfigSchemas[provider].parse(input) as Record<string, unknown>;
  if (typeof parsed.baseUrl === "string") {
    const url = new URL(parsed.baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("INVALID_PROVIDER_URL");
  }
  return parsed;
}

export function splitProviderConfig(provider: ConfigurableIntegrationProvider, config: Record<string, unknown>) {
  const fields = providerConfigFields[provider];
  const publicConfig = Object.fromEntries(fields.publicFields.filter((field) => config[field] !== undefined).map((field) => [field, config[field]]));
  const secretConfig = Object.fromEntries(fields.secretFields.filter((field) => config[field] !== undefined).map((field) => [field, config[field]]));
  return { publicConfig, secretConfig };
}
