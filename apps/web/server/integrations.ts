import "server-only";

import {
  configuredLLMChoice, resolveLLMModelId,
  CONFIGURABLE_INTEGRATION_PROVIDERS,
  DOUBAO_DEFAULT_BASE_URL,
  DOUBAO_DEFAULT_RESOURCE_ID,
  IntegrationService,
  getAIModels,
  type AIModelCapabilities,
  type AIProvider,
  type ConfigurableIntegrationProvider,
} from "@content-center/integrations";
import { REDFOX_DEFAULT_BASE_URL, storageHealthFromEnv } from "@content-center/providers";

export type IntegrationDisplayStatus = "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "ERROR" | "DISABLED" | "MOCK";

export type IntegrationDisplay = {
  provider: ConfigurableIntegrationProvider | "STORAGE";
  name: string;
  status: IntegrationDisplayStatus;
  configured: boolean;
  publicConfig: Record<string, unknown>;
  lastFour: string | null;
  updatedAt: string | null;
  description: string;
  usage: readonly string[];
  defaults: Record<string, string>;
  managedBy: "WORKSPACE" | "ENVIRONMENT";
  connectionTest: "LIVE" | "UNSUPPORTED_UNTIL_PROVIDER_STAGE" | "LIVE_API_TEST_NOT_AVAILABLE" | "NOT_APPLICABLE";
  models?: Array<{ provider: AIProvider; modelId: string; label: string; defaultBaseUrl: string; experimental?: boolean; capabilities: AIModelCapabilities }>;
};

const service = new IntegrationService();

const providerDetails: Record<ConfigurableIntegrationProvider, { name: string; description: string; usage: readonly string[]; defaults: Record<string, string> }> = {
  WEB_SEARCH: { name: "联网搜索 · Exa", description: "为 Agent 搜索普通网页、新闻和官网。只发送检索词，不发送项目资料或历史对话。", usage: ["网页搜索", "来源引用"], defaults: {} },
  REDFOX: {
    name: "RedFox",
    description: "为研究与资料收录提供平台数据。",
    usage: ["内容发现", "抖音 / 小红书素材收录"],
    defaults: { baseUrl: REDFOX_DEFAULT_BASE_URL },
  },
  DOUBAO_ASR: {
    name: "豆包语音识别",
    description: "将视频中的语音转写为文字稿。",
    usage: ["视频转文字"],
    defaults: { baseUrl: DOUBAO_DEFAULT_BASE_URL, resourceId: DOUBAO_DEFAULT_RESOURCE_ID },
  },
  TRANSCRIPTION: {
    name: "语音转写策略",
    description: "选择本地免费转写或豆包云端服务，并设置本地质量目标。",
    usage: ["视频转文字"],
    defaults: { source: "LOCAL_FUNASR", qualityMode: "BALANCED" },
  },
  LLM: {
    name: "AI 模型",
    description: "为项目对话、资料理解和研究分析提供模型能力。",
    usage: ["项目对话", "资料理解", "研究分析"],
    defaults: { provider: "KIMI", modelId: "kimi-k2.6", baseUrl: "https://api.moonshot.cn/v1" },
  },
};

export async function getIntegrationStatuses(workspaceId: string): Promise<IntegrationDisplay[]> {
  const workspaceIntegrations = await Promise.all(
    CONFIGURABLE_INTEGRATION_PROVIDERS.map(async (provider) => {
      const current = await service.getIntegrationStatus(workspaceId, provider);
      return {
        ...current,
        ...(provider === "LLM" ? { publicConfig: { ...current.publicConfig, resolvedModelId: configuredLLMChoice(current.publicConfig).apiModelId, resolvedModelLabel: configuredLLMChoice(current.publicConfig).label } } : {}),
        updatedAt: current.updatedAt?.toISOString() ?? null,
        ...providerDetails[provider],
        ...(provider === "LLM" ? { models: getAIModels().filter(model => resolveLLMModelId(model.provider, model.modelId) === model.modelId).map((model) => ({ provider: model.provider, modelId: model.modelId, label: model.label, defaultBaseUrl: model.defaultBaseUrl, ...("experimental" in model && model.experimental ? { experimental: true } : {}), capabilities: model.capabilities })) } : {}),
        managedBy: "WORKSPACE" as const,
        connectionTest: "LIVE" as const,
      };
    }),
  );
  const storageConfigured = storageHealthFromEnv() === "CONFIGURED";
  return [
    ...workspaceIntegrations,
    {
      provider: "STORAGE",
      name: "Storage",
      status: storageConfigured ? "CONFIGURED" : "UNCONFIGURED",
      configured: storageConfigured,
      publicConfig: {},
      lastFour: null,
      updatedAt: null,
      description: "Render Media Relay（生产）或 S3-compatible（开发/可选回退），由服务端环境变量管理。",
      usage: ["素材文件与音视频保存"],
      defaults: {},
      managedBy: "ENVIRONMENT",
      connectionTest: "NOT_APPLICABLE",
    },
  ];
}

export async function getIntegrationDisplay(workspaceId: string, provider: string) {
  return (await getIntegrationStatuses(workspaceId)).find((item) => item.provider === provider) ?? null;
}

export function integrationVisibleToRole(integration: IntegrationDisplay, canManage: boolean): IntegrationDisplay {
  return canManage ? integration : { ...integration, publicConfig: {}, lastFour: null, models: undefined };
}

export { service as integrationService };
