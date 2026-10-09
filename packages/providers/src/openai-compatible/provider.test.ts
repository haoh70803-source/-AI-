import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { benchmarkCreatorProfileGenerationV4Schema } from "../benchmark-creator-profile";
import { materialDistillationCopywritingGenerationSchema, materialDistillationDiscoveryGenerationSchema } from "../material-distillation";
import { OpenAICompatibleLLMProvider } from "./provider";

let fixture: Server;
let origin = "";
let retryRequests = 0;
let lastRequestBody: Record<string, unknown> = {};

function completion(content: string) {
  return JSON.stringify({ id: "fixture-request", model: "fixture-model", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 7 } });
}

const priorProviderOrigin = process.env.PROVIDER_TEST_ORIGIN;
const priorEnvironmentId = process.env.ENVIRONMENT_ID;
afterAll(() => { if (priorProviderOrigin) process.env.PROVIDER_TEST_ORIGIN = priorProviderOrigin; else delete process.env.PROVIDER_TEST_ORIGIN; if (priorEnvironmentId) process.env.ENVIRONMENT_ID = priorEnvironmentId; else delete process.env.ENVIRONMENT_ID; });
beforeAll(async () => {
  fixture = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string | unknown[] }>; stream?: boolean };
      lastRequestBody = parsed;
      const content = parsed.messages.at(-1)?.content ?? "";
      const prompt = typeof content === "string" ? content : JSON.stringify(content);
      const send = (status: number, value: string) => { response.writeHead(status, { "content-type": "application/json", "x-request-id": "fixture-header-id" }); response.end(value); };
      if (request.headers.authorization !== "Bearer fixture-secret") return send(401, "{}");
      if (prompt.includes("STATUS_401")) return send(401, "{}");
      if (prompt.includes("STATUS_429")) return send(429, "{}");
      if (prompt.includes("STATUS_500")) return send(500, "{}");
      if (prompt.includes("RETRY_ONCE") && ++retryRequests === 1) return send(500, "{}");
      if (prompt.includes("INVALID_ENVELOPE_JSON")) return send(200, "not-json");
      if (prompt.includes("INVALID_ENVELOPE_SCHEMA")) return send(200, JSON.stringify({ choices: [] }));
      if (prompt.includes("INVALID_STRUCTURED")) return send(200, completion(JSON.stringify({ wrong: true })));
      if (prompt.includes("INVALID_PLAYBOOK_STRUCTURED")) return send(200, completion(JSON.stringify({ playbooks: [{ name: "hidden value", wrong: true }] })));
      if (prompt.includes("OLD_M7_ROOT")) return send(200, completion(JSON.stringify({ summary: { text: "old" }, insights: [] })));
      if (prompt.includes("M7_DISCOVERY_REQUEST")) return send(200, completion(JSON.stringify({ highlights: [] })));
      if (prompt.includes("M7_COPYWRITING_REQUEST")) return send(200, completion(JSON.stringify({ sections: [] })));
      if (prompt.includes("M9_PROFILE_REQUEST")) return send(200, completion(JSON.stringify({ videos: [] })));
      if (prompt.includes("FENCED_STRUCTURED")) return send(200, completion("```json\n{\"ok\":true,\"title\":\"Fenced result\"}\n```"));
      if (prompt.includes("EXPLAINED_STRUCTURED")) return send(200, completion("这是整理结果：\n{\"ok\":true,\"title\":\"Explained result\"}\n请查收。"));
      if (prompt.includes("MULTIPLE_STRUCTURED")) return send(200, completion("候选一：{\"ok\":true,\"title\":\"One\"}\n候选二：{\"ok\":true,\"title\":\"Two\"}"));
      if (prompt.includes("TIMEOUT")) return setTimeout(() => send(200, completion(JSON.stringify({ ok: true }))), 100);
      if (parsed.stream) {
        response.writeHead(200, { "content-type": "text/event-stream", "x-request-id": "fixture-stream-id" });
        response.write(`data: ${JSON.stringify({ id: "fixture-stream-id", model: "fixture-model", choices: [{ delta: { content: "流式" }, finish_reason: null }] })}\n\n`);
        response.write(`data: ${JSON.stringify({ id: "fixture-stream-id", model: "fixture-model", choices: [{ delta: { content: "回复" }, finish_reason: "stop" }], usage: { prompt_tokens: 9, completion_tokens: 2 } })}\n\n`);
        response.end("data: [DONE]\n\n");
        return;
      }
      return send(200, completion(JSON.stringify({ ok: true, title: "Fixture result" })));
    });
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not bind");
  origin = `http://127.0.0.1:${address.port}/v1`;
  process.env.ENVIRONMENT_ID = "LOCAL_TEST";
  process.env.PROVIDER_TEST_ORIGIN = new URL(origin).origin;
});

afterAll(async () => new Promise<void>((resolve) => fixture.close(() => resolve())));

function provider(options: { timeoutMs?: number; maxRetries?: 0 | 1 } = {}) {
  return new OpenAICompatibleLLMProvider({ provider: "fixture", baseUrl: origin, apiKey: "fixture-secret", model: "fixture-model" }, options);
}

function kimiProvider(options: { timeoutMs?: number; maxRetries?: 0 | 1 } = {}) {
  return new OpenAICompatibleLLMProvider({ provider: "KIMI", baseUrl: origin, apiKey: "fixture-secret", model: "kimi-k2.6" }, options);
}

function deepSeekProvider(model: "deepseek-flash" | "deepseek-v4-flash" | "deepseek-v4-pro" | "deepseek-v4-flash-vision-exp") {
  return new OpenAICompatibleLLMProvider({
    provider: "DEEPSEEK",
    baseUrl: origin,
    apiKey: "fixture-secret",
    model,
    capabilities: { text: true, image: model === "deepseek-flash" || model.endsWith("vision-exp"), reasoning: true, structuredOutput: true, jsonObject: true, tools: true, responsesApi: true },
    chatStructuredOutput: "JSON_OBJECT",
  });
}

describe("OpenAICompatibleLLMProvider HTTP fixture", () => {
  it("sends OpenAI-compatible chat requests and returns real usage", async () => {
    await expect(provider().generateText({ systemPrompt: "Fixture system", prompt: "SUCCESS" })).resolves.toMatchObject({ providerMode: "REAL", data: { model: "fixture-model", providerRequestId: "fixture-header-id", finishReason: "stop", usage: { inputTokens: 12, outputTokens: 7 } } });
  });

  it("streams OpenAI-compatible text deltas and returns the final usage", async () => {
    const chunks: string[] = [];
    const result = await provider().streamText({ systemPrompt: "policy", messages: [{ role: "user", content: "写朋友圈" }, { role: "assistant", content: "发生了什么？" }], prompt: "STREAM_SUCCESS" }, { onDelta: (delta) => { chunks.push(delta); } });
    expect(lastRequestBody.messages).toEqual([{ role: "system", content: "policy" }, { role: "user", content: "写朋友圈" }, { role: "assistant", content: "发生了什么？" }, { role: "user", content: "STREAM_SUCCESS" }]);
    expect(chunks).toEqual(["流式", "回复"]);
    expect(result).toMatchObject({ providerMode: "REAL", data: { text: "流式回复", model: "fixture-model", providerRequestId: "fixture-stream-id", finishReason: "stop", usage: { inputTokens: 9, outputTokens: 2 } } });
    expect(lastRequestBody).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(lastRequestBody).not.toHaveProperty("response_format");
  });

  it("uses Kimi 2.6 compatible request parameters", async () => {
    await kimiProvider().generateText({ prompt: "KIMI_SUCCESS" });
    expect(lastRequestBody).toMatchObject({ model: "kimi-k2.6", thinking: { type: "disabled" }, response_format: { type: "json_object" } });
    expect(lastRequestBody).not.toHaveProperty("temperature");
  });

  it("uses native JSON Schema only when a supported Kimi call requests it", async () => {
    const schema = z.object({ ok: z.boolean(), title: z.string() }).strict();
    await kimiProvider().generateStructured({ prompt: "KIMI_STRUCTURED", maxCompletionTokens: 2_000, structuredOutput: { preferJsonSchema: true, schemaName: "material_discovery_v2" } }, schema);
    expect(lastRequestBody).toMatchObject({
      max_completion_tokens: 2_000,
      response_format: {
        type: "json_schema",
        json_schema: { name: "material_discovery_v2", strict: true, schema: { type: "object", additionalProperties: false } },
      },
    });

    await provider().generateStructured({ prompt: "GENERIC_STRUCTURED", structuredOutput: { preferJsonSchema: true } }, schema);
    expect(lastRequestBody).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("derives the exact M7 Discovery request schema from the validation schema", async () => {
    await kimiProvider().generateStructured({ prompt: "M7_DISCOVERY_REQUEST", structuredOutput: { preferJsonSchema: true, schemaName: "material_discovery_v2" } }, materialDistillationDiscoveryGenerationSchema);
    const responseFormat = lastRequestBody.response_format as { type: string; json_schema: { name: string; strict: boolean; schema: { type: string; required: string[]; properties: Record<string, unknown> } } };
    expect(responseFormat.type).toBe("json_schema");
    expect(responseFormat.json_schema).toMatchObject({ name: "material_discovery_v2", strict: true, schema: { type: "object" } });
    expect(responseFormat.json_schema.schema.required).toEqual(["highlights"]);
    expect(Object.keys(responseFormat.json_schema.schema.properties)).toEqual(["highlights"]);
  });

  it("honors the M7 task strategy and uses JSON Object even when Kimi supports JSON Schema", async () => {
    await kimiProvider().generateStructured({ prompt: "M7_DISCOVERY_REQUEST", structuredOutput: { strategy: "JSON_OBJECT", preferJsonSchema: true, schemaName: "ignored_for_this_task" } }, materialDistillationDiscoveryGenerationSchema);
    expect(lastRequestBody).toMatchObject({ response_format: { type: "json_object" } });
    await kimiProvider().generateStructured({ prompt: "M7_COPYWRITING_REQUEST", structuredOutput: { strategy: "JSON_OBJECT", preferJsonSchema: true, schemaName: "ignored_for_this_task" } }, materialDistillationCopywritingGenerationSchema);
    expect(lastRequestBody).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("uses the M9 task JSON Object contract without changing the Kimi adapter", async () => {
    await kimiProvider().generateStructured({ prompt: "M9_PROFILE_REQUEST", structuredOutput: { strategy: "JSON_OBJECT" } }, benchmarkCreatorProfileGenerationV4Schema);
    expect(lastRequestBody).toMatchObject({ model: "kimi-k2.6", response_format: { type: "json_object" } });
  });

  it("keeps the independent copywriting contract separate", () => {
    expect(materialDistillationCopywritingGenerationSchema.safeParse({ sections: [] }).success).toBe(true);
    expect(materialDistillationDiscoveryGenerationSchema.safeParse({ sections: [] }).success).toBe(false);
  });

  it("keeps existing Kimi structured calls on JSON mode unless they opt in", async () => {
    await kimiProvider().generateStructured({ prompt: "KIMI_EXISTING_STRUCTURED" }, z.object({ ok: z.boolean(), title: z.string() }));
    expect(lastRequestBody).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("keeps the existing temperature behavior for other compatible providers", async () => {
    await provider().generateText({ prompt: "GENERIC_SUCCESS" });
    expect(lastRequestBody).toMatchObject({ model: "fixture-model", temperature: 0.4, response_format: { type: "json_object" } });
    expect(lastRequestBody).not.toHaveProperty("thinking");
  });

  it.each(["deepseek-v4-flash", "deepseek-v4-pro"] as const)("uses the DeepSeek Chat adapter for %s", async (model) => {
    await deepSeekProvider(model).generateStructured({ prompt: `DEEPSEEK_${model}`, structuredOutput: { preferJsonSchema: true } }, z.object({ ok: z.boolean(), title: z.string() }));
    expect(lastRequestBody).toMatchObject({ model, thinking: { type: "enabled" }, reasoning_effort: "high", response_format: { type: "json_object" } });
    expect(lastRequestBody).not.toHaveProperty("temperature");
  });

  it("sends normalized base64 image content only to an image-capable model", async () => {
    const schema = z.object({ ok: z.boolean(), title: z.string() });
    await deepSeekProvider("deepseek-flash").generateStructured({
      prompt: "VISION",
      content: [{ type: "text", text: "VISION" }, { type: "image", source: { type: "base64", mediaType: "image/png", data: "aW1hZ2U=" } }],
    }, schema);
    expect(lastRequestBody).toMatchObject({ messages: [expect.objectContaining({ role: "user", content: [{ type: "text", text: "VISION" }, { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] })] });
    await deepSeekProvider("deepseek-flash").generateStructured({
      prompt: "VISION_URL_AND_FILE",
      content: [{ type: "text", text: "VISION_URL_AND_FILE" }, { type: "image", source: { type: "url", url: "https://example.test/image.png" } }, { type: "image", source: { type: "file", fileId: "file-api-fixture" } }],
    }, schema);
    expect(lastRequestBody).toMatchObject({ messages: [expect.objectContaining({ role: "user", content: [{ type: "text", text: "VISION_URL_AND_FILE" }, { type: "image_url", image_url: { url: "https://example.test/image.png" } }, { type: "file", file_id: "file-api-fixture" }] })] });
    await expect(deepSeekProvider("deepseek-v4-flash").generateStructured({ prompt: "NO_VISION", content: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "aW1hZ2U=" } }] }, schema)).rejects.toMatchObject({ code: "LLM_UNSUPPORTED_INPUT", message: "当前模型不支持图片输入。" });
  });

  it("applies the same image capability gate to streaming requests", async () => {
    const image = { type: "image" as const, source: { type: "url" as const, url: "https://example.test/image.png" } };
    await expect(deepSeekProvider("deepseek-v4-pro").streamText({ prompt: "NO_VISION", content: [image] }, { onDelta: () => undefined })).rejects.toMatchObject({ code: "LLM_UNSUPPORTED_INPUT" });
    await deepSeekProvider("deepseek-flash").streamText({ prompt: "STREAM_VISION", content: [{ type: "text", text: "STREAM_VISION" }, image] }, { onDelta: () => undefined });
    expect(lastRequestBody).toMatchObject({ messages: [expect.objectContaining({ role: "user", content: [{ type: "text", text: "STREAM_VISION" }, { type: "image_url", image_url: { url: "https://example.test/image.png" } }] })] });
  });

  it("validates structured JSON with Zod", async () => {
    const result = await provider().generateStructured({ prompt: "STRUCTURED" }, z.object({ ok: z.boolean(), title: z.string() }));
    expect(result.data.value).toEqual({ ok: true, title: "Fixture result" });
  });

  it("accepts one JSON code fence before schema validation", async () => {
    const result = await provider().generateStructured({ prompt: "FENCED_STRUCTURED" }, z.object({ ok: z.boolean(), title: z.string() }));
    expect(result.data.value).toEqual({ ok: true, title: "Fenced result" });
  });

  it("accepts one unambiguous embedded JSON value and rejects multiple candidates", async () => {
    const schema = z.object({ ok: z.boolean(), title: z.string() });
    await expect(provider().generateStructured({ prompt: "EXPLAINED_STRUCTURED" }, schema)).resolves.toMatchObject({ data: { value: { ok: true, title: "Explained result" } } });
    await expect(provider().generateStructured({ prompt: "MULTIPLE_STRUCTURED" }, schema)).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
  });

  it.each([["STATUS_401", "LLM_AUTH_FAILED"], ["STATUS_429", "LLM_RATE_LIMITED"], ["STATUS_500", "LLM_SERVER_ERROR"]])("maps %s to %s", async (prompt, code) => {
    await expect(provider({ maxRetries: 0 }).generateText({ prompt })).rejects.toMatchObject({ code });
  });

  it("maps timeout", async () => {
    await expect(provider({ timeoutMs: 20, maxRetries: 0 }).generateText({ prompt: "TIMEOUT" })).rejects.toMatchObject({ code: "LLM_TIMEOUT" });
  });

  it("retries a retryable failure at most once", async () => {
    retryRequests = 0;
    await expect(provider().generateText({ prompt: "RETRY_ONCE" })).resolves.toMatchObject({ providerMode: "REAL" });
    expect(retryRequests).toBe(2);
  });

  it.each(["INVALID_ENVELOPE_JSON", "INVALID_ENVELOPE_SCHEMA"])("rejects invalid response %s", async (prompt) => {
    await expect(provider({ maxRetries: 0 }).generateText({ prompt })).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
  });

  it("rejects invalid structured output", async () => {
    await expect(provider().generateStructured({ prompt: "INVALID_STRUCTURED" }, z.object({ ok: z.boolean(), title: z.string() }))).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
      details: { providerRequestId: "fixture-header-id", actualModel: "fixture-model", finishReason: "stop", returnedRootKeys: ["wrong"], validationIssues: expect.arrayContaining([expect.objectContaining({ path: "ok", code: "invalid_type", expected: "boolean", receivedType: "undefined" })]) },
    });
  });

  it("records names from the first object in a returned array without recording values", async () => {
    await expect(provider().generateStructured({ prompt: "INVALID_PLAYBOOK_STRUCTURED" }, z.object({ playbooks: z.array(z.object({ expected: z.string() })) }))).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
      details: { returnedRootKeys: ["playbooks"], returnedFirstLevelObjectKeys: { playbooks: ["name", "wrong"] } },
    });
  });

  it("rejects an old root shape and records names only", async () => {
    await expect(kimiProvider().generateStructured({ prompt: "OLD_M7_ROOT", structuredOutput: { preferJsonSchema: true, schemaName: "material_discovery_v2" } }, materialDistillationDiscoveryGenerationSchema)).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
      details: { returnedRootKeys: ["insights", "summary"], returnedFirstLevelObjectKeys: { summary: ["text"] } },
    });
  });
});
