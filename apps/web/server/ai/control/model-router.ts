import "server-only";

import { getAIModel, type AIModelCapabilities, type AIModelCapability } from "@content-center/integrations";
import { LLMError } from "@content-center/providers";
import { loadLLMRuntime, type LLMModelSelection, type LLMRuntime } from "../llm-runtime";
import { AIControlError, type ModelRouteRequest, type WorkspaceAIEngine } from "./contracts";

export type ModelRouteReceipt = {
  requestedTask: ModelRouteRequest["taskType"];
  routingMode: "SINGLE_ENGINE";
  workspaceEngine: Exclude<WorkspaceAIEngine, "AUTO"> | "CUSTOM" | "TEST";
  selectedProvider: string;
  selectedModel: string;
  capabilityMatch: Record<AIModelCapability, boolean>;
  fallbackReason: string | null;
  crossProviderFallback: false;
};

export type ModelRoute = { runtime: LLMRuntime; receipt: ModelRouteReceipt };

function requirements(input: ModelRouteRequest) {
  return [...new Set<AIModelCapability>([
    "text",
    ...(input.structuredOutput ? ["structuredOutput" as const] : []),
    ...(input.reasoningNeed === "HIGH" ? ["reasoning" as const] : []),
    ...(input.requiredCapabilities ?? []),
  ])];
}

export class ModelRouter {
  constructor(private readonly runtimeLoader: (workspaceId: string, selection?: LLMModelSelection | null) => Promise<LLMRuntime> = (workspaceId, selection) => loadLLMRuntime(workspaceId, undefined, selection)) {}

  async route(workspaceId: string, request: ModelRouteRequest, selection?: LLMModelSelection | null): Promise<ModelRoute> {
    let runtime: LLMRuntime;
    try {
      runtime = await this.runtimeLoader(workspaceId, selection);
    } catch (error) {
      if (error instanceof LLMError && ["KIMI_MODEL_ID_MISSING", "KIMI_MODEL_UNAVAILABLE", "LLM_UNSUPPORTED_INPUT"].includes(error.code)) throw new AIControlError("MODEL_UNAVAILABLE");
      throw new AIControlError("PROVIDER_UNAVAILABLE", undefined, true);
    }
    const required = requirements(request);
    const fixture = runtime.mode === "FIXTURE" || runtime.mode === "MOCK";
    const provider = runtime.providerName.toUpperCase();
    const workspaceEngine = fixture ? "TEST" : provider === "CUSTOM" ? "CUSTOM" : ["KIMI", "DEEPSEEK"].includes(provider) ? provider as Exclude<WorkspaceAIEngine, "AUTO"> : null;
    if (!workspaceEngine) throw new AIControlError("PROVIDER_UNAVAILABLE");
    const model = fixture || workspaceEngine === "CUSTOM" ? null : getAIModel(workspaceEngine as Exclude<WorkspaceAIEngine, "AUTO">, runtime.requestedModel ?? runtime.model);
    const capabilities: AIModelCapabilities | undefined = runtime.capabilities ?? model?.capabilities ?? (fixture ? { text: true, image: true, reasoning: true, structuredOutput: true, jsonObject: true, tools: true, responsesApi: true } : undefined);
    if (!capabilities || required.some((capability) => !capabilities[capability])) throw new AIControlError("MODEL_UNAVAILABLE");
    const capabilityMatch = Object.fromEntries((Object.keys(capabilities) as AIModelCapability[]).map((capability) => [capability, capabilities[capability]])) as Record<AIModelCapability, boolean>;
    return {
      runtime,
      receipt: {
        requestedTask: request.taskType,
        routingMode: "SINGLE_ENGINE",
        workspaceEngine,
        selectedProvider: runtime.providerName,
        selectedModel: runtime.requestedModel ?? runtime.model,
        capabilityMatch,
        fallbackReason: null,
        crossProviderFallback: false,
      },
    };
  }
}
