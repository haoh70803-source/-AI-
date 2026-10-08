import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { getAIModel, type AIProvider, type IntegrationService } from "@content-center/integrations";
import { loadLLMRuntime } from "../server/ai/llm-runtime";
import { ModelRouter } from "../server/ai/control/model-router";

function configuredService(provider: AIProvider, modelId: string, includeCapabilities = true): IntegrationService {
  const model = getAIModel(provider, modelId)!;
  return {
    getIntegrationStatus: async () => ({ status: "CONFIGURED", publicConfig: { provider, modelId } }),
    getDecryptedIntegrationConfig: async () => ({ provider, model: modelId, baseUrl: "https://fixture.example/v1", apiKey: "fixture-key", ...(includeCapabilities ? { capabilities: model.capabilities } : {}) }),
  } as unknown as IntegrationService;
}

afterEach(() => vi.unstubAllGlobals());

describe("LLM runtime vision selection", () => {
  it("passes the selected image model capability to both Router and Provider", async () => {
    const service = configuredService("DEEPSEEK", "deepseek-v4-pro");
    let requestBody: { model?: string; messages?: Array<{ role: string; content: unknown }> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      requestBody = JSON.parse(String(options.body));
      return Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    }));

    const runtime = await loadLLMRuntime("workspace", service, { provider: "DEEPSEEK", modelId: "deepseek-flash" });
    expect(runtime.capabilities?.image).toBe(true);
    await expect(new ModelRouter(async () => runtime).route("workspace", { taskType: "SOURCE_UNDERSTANDING", requiredCapabilities: ["image"] })).resolves.toMatchObject({ receipt: { selectedModel: "deepseek-flash", crossProviderFallback: false } });
    await expect(runtime.provider.generateStructured({ prompt: "Describe", content: [{ type: "text", text: "Describe" }, { type: "image", source: { type: "base64", mediaType: "image/png", data: "aW1hZ2U=" } }] }, z.object({ ok: z.boolean() }))).resolves.toMatchObject({ data: { value: { ok: true } } });
    expect(requestBody).toMatchObject({ model: "deepseek-flash", messages: [expect.objectContaining({ role: "user", content: [{ type: "text", text: "Describe" }, { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] })] });
  });

  it("resolves configured Flash capability and rejects a text-only or foreign selection", async () => {
    const service = configuredService("DEEPSEEK", "deepseek-flash", false);
    expect((await loadLLMRuntime("workspace", service)).capabilities?.image).toBe(true);
    const textRuntime = await loadLLMRuntime("workspace", service, { provider: "DEEPSEEK", modelId: "deepseek-v4-pro" });
    expect(textRuntime.capabilities?.image).toBe(false);
    await expect(new ModelRouter(async () => textRuntime).route("workspace", { taskType: "SOURCE_UNDERSTANDING", requiredCapabilities: ["image"] })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    await expect(textRuntime.provider.generateStructured({ prompt: "No vision", content: [{ type: "image", source: { type: "url", url: "https://example.test/image.png" } }] }, z.object({ ok: z.boolean() }))).rejects.toMatchObject({ code: "LLM_UNSUPPORTED_INPUT" });
    await expect(loadLLMRuntime("workspace", service, { provider: "KIMI", modelId: "kimi-k2.6" })).rejects.toMatchObject({ code: "KIMI_MODEL_UNAVAILABLE" });
  });
});
