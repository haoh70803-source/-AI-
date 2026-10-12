import { IntegrationService } from "@content-center/integrations";
import { LLMError, OpenAICompatibleLLMProvider, openAICompatibleConfigSchema, type LLMProvider } from "@content-center/providers";

export type ConfiguredLLMRuntime = { provider: LLMProvider; providerName: string; model: string; requestedModel?: string; mode?: string };
/** One workspace credential boundary for worker consumers; no module owns model settings. */
export async function loadConfiguredLLMRuntime(workspaceId: string): Promise<ConfiguredLLMRuntime> {
  const integrations = new IntegrationService();
  const status = await integrations.getIntegrationStatus(workspaceId, "LLM");
  if (status.status === "DISABLED") throw new LLMError("LLM_DISABLED", "AI 模型已禁用。", false);
  if (status.status !== "CONFIGURED") throw new LLMError("LLM_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员完成设置。", false);
  const config = await integrations.getDecryptedIntegrationConfig(workspaceId, "LLM");
  const parsed = openAICompatibleConfigSchema.safeParse(config);
  if (!parsed.success) throw new LLMError("LLM_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员完成设置。", false);
  const metadata = config as Record<string, unknown>;
  return { provider: new OpenAICompatibleLLMProvider(parsed.data), providerName: metadata.mode === "FIXTURE" ? parsed.data.provider : parsed.data.provider.toUpperCase(), model: parsed.data.model, requestedModel: typeof metadata.requestedModel === "string" ? metadata.requestedModel : parsed.data.model, mode: typeof metadata.mode === "string" ? metadata.mode : "REAL" };
}
