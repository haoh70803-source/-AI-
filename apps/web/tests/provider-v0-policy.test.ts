import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LLMError } from "@content-center/providers";
import { loadLLMRuntime } from "../server/ai/llm-runtime";
import { llmApiStatus } from "../server/ai/llm-api-status";
import { CreativeBriefPrefillService } from "../server/studio/creative-brief-prefill";

const originalMockMode = process.env.MOCK_MODE;

afterEach(() => {
  if (originalMockMode === undefined) delete process.env.MOCK_MODE;
  else process.env.MOCK_MODE = originalMockMode;
});

describe("V0 provider policy", () => {
  it("makes only the requested AI action unavailable when Kimi 2.6 is absent", async () => {
    process.env.MOCK_MODE = "false";
    const integrationService = {
      getIntegrationStatus: vi.fn().mockResolvedValue({
        provider: "LLM",
        status: "UNCONFIGURED",
        configured: false,
        publicConfig: {},
        lastFour: null,
        updatedAt: null,
      }),
    };

    await expect(loadLLMRuntime("workspace-without-kimi", integrationService as never)).rejects.toMatchObject({
      code: "KIMI_NOT_CONFIGURED",
      retryable: false,
    });
    expect(llmApiStatus(new LLMError("KIMI_NOT_CONFIGURED", "Kimi 2.6 尚未配置。", false))).toBe(409);
    expect(llmApiStatus(new LLMError("LLM_UNSUPPORTED_INPUT", "当前模型不支持图片输入。", false))).toBe(400);
  });

  it("keeps the Studio brief plan available without any Provider configuration", () => {
    const result = CreativeBriefPrefillService.build({
      project: { title: "没有外部 Provider 的文本项目", audience: null, status: "DRAFT" },
      sources: [],
      existingBrief: null,
      hasMotherContent: false,
    });

    expect(result).toMatchObject({ stage: "PREPARING", origins: [], autoPrefilled: false });
    expect(result.plan).toMatchObject({ topic: "", keyPoints: [] });
  });
});
