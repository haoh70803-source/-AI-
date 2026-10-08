import "server-only";
import { configuredLLMChoice, getAIModel, getAIModels, IntegrationService, isAIProvider } from "@content-center/integrations";
import { z } from "zod";

export const creationModelSchema = z.object({ provider: z.enum(["KIMI", "DEEPSEEK", "CUSTOM"]), modelId: z.string().min(1).max(200) }).strict();
export type CreationModel = z.infer<typeof creationModelSchema>;
export class CreationInputError extends Error {}

export async function getCreationModels(workspaceId: string) {
  const status = await new IntegrationService().getIntegrationStatus(workspaceId, "LLM");
  const config = status.publicConfig;
  const provider = typeof config.provider === "string" && (isAIProvider(config.provider) || config.provider === "CUSTOM") ? config.provider : null;
  const configured = status.status === "CONFIGURED" && provider !== null;
  const mock = process.env.MOCK_MODE === "true" && status.status !== "DISABLED" && !configured;
  return {
    configured: configured || mock, provider, defaultModelId: typeof config.modelId === "string" ? config.modelId : null,
    models: configured && provider === "CUSTOM" && typeof config.modelId === "string" ? [{ provider: "CUSTOM" as const, modelId: config.modelId, label: configuredLLMChoice(config).label, image: false, description: "文字创作与资料分析" }] : configured && provider && isAIProvider(provider) ? getAIModels(provider).filter((model) => model.modelId === config.modelId && model.capabilities.text && model.capabilities.structuredOutput).map((model) => ({ provider: model.provider, modelId: model.modelId, label: configuredLLMChoice(config).label, image: model.capabilities.image, description: model.capabilities.image ? "文字与图片理解" : "文字创作与资料分析" })) : [],
    defaultLabel: mock ? "测试模型" : "工作区默认", defaultImage: mock,
  };
}

export async function validateCreationModel(workspaceId: string, selection?: CreationModel | null) {
  const options = await getCreationModels(workspaceId);
  if (!options.configured) throw new CreationInputError("请先在服务设置中配置可用模型。");
  const selected = options.models.find((model) => model.provider === (selection?.provider ?? options.provider) && model.modelId === (selection?.modelId ?? options.defaultModelId));
  const compatible = selection && selection.provider === options.provider && isAIProvider(selection.provider) ? getAIModel(selection.provider, selection.modelId) : null;
  if (selection && !selected && !compatible) throw new CreationInputError("所选模型已不可用，请重新选择当前厂商的模型。");
  return { image: selected?.image ?? compatible?.capabilities.image ?? options.defaultImage };
}
