import { providerFetch } from "../provider-fetch";
import { z, type ZodIssue, type ZodType } from "zod";
import type { LLMProvider } from "../contracts";
import type { LLMContentBlock, LLMGenerateInput, LLMStreamOptions, LLMTextResult, ProviderResult } from "../types";
import { LLMError } from "./errors";
import { chatCompletionResponseSchema, openAICompatibleConfigSchema, type OpenAICompatibleConfig } from "./schemas";

export type OpenAICompatibleOptions = { fetch?: typeof fetch; timeoutMs?: number; maxRetries?: 0 | 1 };

type RequestCapabilities = {
  supportsTemperature: boolean;
  supportsJsonSchema: boolean;
  supportsImage: boolean;
  thinking?: { type: "enabled" | "disabled" };
  reasoningEffort?: "low" | "high" | "max";
  timeoutMs: number;
};

function resolveRequestCapabilities(config: OpenAICompatibleConfig): RequestCapabilities {
  const provider = config.provider.toUpperCase();
  const supportsJsonSchema = config.chatStructuredOutput === "JSON_SCHEMA" || (!config.chatStructuredOutput && provider === "KIMI" && config.model === "kimi-k2.6");
  const supportsImage = config.capabilities?.image ?? false;
  if (provider === "KIMI") {
    return { supportsTemperature: false, supportsJsonSchema, supportsImage, thinking: { type: "disabled" }, timeoutMs: 120_000 };
  }
  if (provider === "DEEPSEEK") {
    return { supportsTemperature: false, supportsJsonSchema, supportsImage, thinking: { type: "enabled" }, reasoningEffort: "high", timeoutMs: 120_000 };
  }
  return { supportsTemperature: true, supportsJsonSchema, supportsImage, timeoutMs: 30_000 };
}

type ResponseFormat = { type: "json_object" } | { type: "json_schema"; json_schema: { name: string; strict: true; schema: Record<string, unknown> } };

function receivedType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function valueAtPath(value: unknown, path: PropertyKey[]) {
  return path.reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<PropertyKey, unknown>)[key] : undefined, value);
}

function validationIssue(issue: ZodIssue, raw: unknown) {
  const expected = "expected" in issue && typeof issue.expected === "string" ? issue.expected : undefined;
  return {
    path: issue.path.length ? issue.path.map(String).join(".") : "root",
    code: issue.code,
    ...(expected ? { expected } : {}),
    receivedType: receivedType(valueAtPath(raw, issue.path)),
  };
}

function returnedStructure(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const returnedRootKeys = Object.keys(record).sort().slice(0, 50);
  const returnedFirstLevelObjectKeys = Object.fromEntries(returnedRootKeys.flatMap((key) => {
    const value = record[key];
    const firstLevel = Array.isArray(value) ? value[0] : value;
    return firstLevel && typeof firstLevel === "object" && !Array.isArray(firstLevel) ? [[key, Object.keys(firstLevel as Record<string, unknown>).sort().slice(0, 50)]] : [];
  }));
  return { returnedRootKeys, ...(Object.keys(returnedFirstLevelObjectKeys).length ? { returnedFirstLevelObjectKeys } : {}) };
}

function jsonSchemaResponseFormat(schema: ZodType, name: string): ResponseFormat {
  const generated = z.toJSONSchema(schema) as Record<string, unknown>;
  const portableSchema = { ...generated };
  delete portableSchema.$schema;
  return { type: "json_schema", json_schema: { name: name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "structured_response", strict: true, schema: portableSchema } };
}

function embeddedJsonValues(text: string) {
  const values: unknown[] = [];
  let start = -1; let inString = false; let escaped = false; const stack: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (start < 0) {
      if (character === "{" || character === "[") { start = index; stack.push(character); }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.pop() !== expected) { start = -1; stack.length = 0; continue; }
      if (!stack.length) {
        try { values.push(JSON.parse(text.slice(start, index + 1)) as unknown); } catch { /* malformed candidates stay invalid */ }
        start = -1;
      }
    }
  }
  return values;
}

function parseStructuredJson(text: string) {
  try { return JSON.parse(text) as unknown; }
  catch {
    const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1]) return JSON.parse(fenced[1]) as unknown;
    const candidates = embeddedJsonValues(text);
    if (candidates.length !== 1) throw new Error("INVALID_JSON");
    return candidates[0];
  }
}

function contentBlock(block: LLMContentBlock) {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.source.type === "url") return { type: "image_url", image_url: { url: block.source.url } };
  if (block.source.type === "file") return { type: "file", file_id: block.source.fileId };
  return { type: "image_url", image_url: { url: `data:${block.source.mediaType};base64,${block.source.data}` } };
}

function endpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function responseError(response: Response) {
  const details = { httpStatus: response.status, providerRequestId: response.headers.get("x-request-id") ?? undefined };
  if (response.status === 401 || response.status === 403) return new LLMError("LLM_AUTH_FAILED", "AI 模型凭证无效或无权限。", false, details);
  if (response.status === 413) return new LLMError("LLM_CONTEXT_TOO_LARGE", "AI 上下文超过模型限制。", false, details);
  if (response.status === 429) return new LLMError("LLM_RATE_LIMITED", "AI 模型请求过于频繁。", false, details);
  if (response.status >= 500) return new LLMError("LLM_SERVER_ERROR", "AI 模型服务暂时不可用。", true, details);
  return new LLMError("LLM_GENERATION_FAILED", "AI 模型拒绝了本次生成请求。", false, details);
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  private readonly config: OpenAICompatibleConfig;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: 0 | 1;

  constructor(config: OpenAICompatibleConfig, options: OpenAICompatibleOptions = {}) {
    this.config = openAICompatibleConfigSchema.parse(config);
    this.fetcher = options.fetch ?? providerFetch;
    this.timeoutMs = options.timeoutMs ?? resolveRequestCapabilities(this.config).timeoutMs;
    this.maxRetries = options.maxRetries ?? 1;
  }

  async generateText(input: LLMGenerateInput): Promise<ProviderResult<LLMTextResult>> {
    return this.requestWithRetries(input, { type: "json_object" });
  }

  async streamText(input: LLMGenerateInput, options: LLMStreamOptions): Promise<ProviderResult<LLMTextResult>> {
    const capabilities = resolveRequestCapabilities(this.config);
    if (input.content?.some((block) => block.type === "image") && !capabilities.supportsImage) {
      throw new LLMError("LLM_UNSUPPORTED_INPUT", "当前模型不支持图片输入。", false);
    }
    const userContent = input.content?.length ? input.content.map(contentBlock) : input.prompt;
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(endpoint(this.config.baseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          model: this.config.model,
          messages: [...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []), ...(input.messages ?? []), { role: "user", content: userContent }],
          ...(capabilities.supportsTemperature ? { temperature: input.temperature ?? 0.4 } : {}),
          ...(capabilities.thinking ? { thinking: capabilities.thinking } : {}),
          ...(capabilities.reasoningEffort ? { reasoning_effort: capabilities.reasoningEffort } : {}),
          ...(input.maxCompletionTokens ? { max_completion_tokens: input.maxCompletionTokens } : {}),
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException("Stopped", "AbortError");
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new LLMError("LLM_TIMEOUT", "AI 模型请求超时。", true);
      throw new LLMError("LLM_SERVER_ERROR", "无法连接 AI 模型服务。", true);
    }
    if (!response.ok) throw responseError(response);
    if (!response.body) throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型没有返回流式内容。", false, { httpStatus: response.status });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let model = this.config.model;
    let providerRequestId = response.headers.get("x-request-id") ?? undefined;
    let finishReason: string | undefined;
    let usage: LLMTextResult["usage"];
    const consume = async (event: string) => {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") return;
      let value: unknown;
      try { value = JSON.parse(data); } catch { throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型返回了无效流式内容。", false, { providerRequestId }); }
      const payload = value as { id?: string; model?: string; choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      providerRequestId ??= payload.id;
      model = payload.model ?? model;
      const delta = payload.choices?.[0]?.delta?.content ?? "";
      if (delta) { text += delta; await options.onDelta(delta); }
      finishReason = payload.choices?.[0]?.finish_reason ?? finishReason;
      if (payload.usage) usage = { inputTokens: payload.usage.prompt_tokens, outputTokens: payload.usage.completion_tokens };
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) await consume(event);
      if (done) break;
    }
    if (buffer.trim()) await consume(buffer);
    if (!text.trim()) throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型没有返回有效内容。", false, { providerRequestId, actualModel: model, finishReason });
    return { providerMode: "REAL", data: { text, model, providerRequestId, finishReason, usage } };
  }

  private async requestWithRetries(input: LLMGenerateInput, responseFormat: ResponseFormat): Promise<ProviderResult<LLMTextResult>> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.request(input, responseFormat);
      } catch (error) {
        lastError = error;
        if (!(error instanceof LLMError) || !error.retryable || attempt >= this.maxRetries) throw error;
      }
    }
    throw lastError;
  }

  async generateStructured<T>(input: LLMGenerateInput, schema: ZodType<T>) {
    const capabilities = resolveRequestCapabilities(this.config);
    const responseFormat = input.structuredOutput?.strategy !== "JSON_OBJECT" && input.structuredOutput?.preferJsonSchema && capabilities.supportsJsonSchema
      ? jsonSchemaResponseFormat(schema, input.structuredOutput.schemaName ?? "structured_response")
      : { type: "json_object" } as const;
    const result = await this.requestWithRetries(input, responseFormat);
    let raw: unknown;
    try {
      raw = parseStructuredJson(result.data.text);
    } catch {
      throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型没有返回有效 JSON。", false, { providerRequestId: result.data.providerRequestId, actualModel: result.data.model, finishReason: result.data.finishReason });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型返回的数据结构不符合要求。", false, {
        providerRequestId: result.data.providerRequestId,
        actualModel: result.data.model,
        finishReason: result.data.finishReason,
        validationIssues: parsed.error.issues.slice(0, 20).map((issue) => validationIssue(issue, raw)),
        ...returnedStructure(raw),
      });
    }
    return { ...result, data: { ...result.data, value: parsed.data } };
  }

  async generate(input: { prompt: string }) { const result = await this.generateText(input); return { providerMode: result.providerMode, data: { text: result.data.text } } as const; }
  async rewrite(input: { prompt: string }) { return this.generate(input); }
  async summarize(input: { prompt: string }) { return this.generate(input); }
  async classify(input: { prompt: string }) { const result = await this.generateText(input); return { providerMode: result.providerMode, data: { labels: [result.data.text] } }; }
  async adapt(input: { prompt: string; platform: string }) { return this.generate({ prompt: input.prompt }); }

  private async request(input: LLMGenerateInput, responseFormat: ResponseFormat): Promise<ProviderResult<LLMTextResult>> {
    let response: Response;
    const capabilities = resolveRequestCapabilities(this.config);
    if (input.content?.some((block) => block.type === "image") && !capabilities.supportsImage) {
      throw new LLMError("LLM_UNSUPPORTED_INPUT", "当前模型不支持图片输入。", false);
    }
    const userContent = input.content?.length ? input.content.map(contentBlock) : input.prompt;
    try {
      response = await this.fetcher(endpoint(this.config.baseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
            ...(input.messages ?? []),
            { role: "user", content: userContent },
          ],
          ...(capabilities.supportsTemperature ? { temperature: input.temperature ?? 0.4 } : {}),
          ...(capabilities.thinking ? { thinking: capabilities.thinking } : {}),
          ...(capabilities.reasoningEffort ? { reasoning_effort: capabilities.reasoningEffort } : {}),
          ...(input.maxCompletionTokens ? { max_completion_tokens: input.maxCompletionTokens } : {}),
          response_format: responseFormat,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new LLMError("LLM_TIMEOUT", "AI 模型请求超时。", true);
      }
      throw new LLMError("LLM_SERVER_ERROR", "无法连接 AI 模型服务。", true);
    }
    if (!response.ok) throw responseError(response);
    let raw: unknown;
    try { raw = JSON.parse(await response.text()); }
    catch { throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型返回了无效响应。", false, { httpStatus: response.status }); }
    const parsed = chatCompletionResponseSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.choices[0]?.message.content.trim()) {
      throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型返回结构不符合协议。", false, { httpStatus: response.status });
    }
    const providerRequestId = response.headers.get("x-request-id") ?? parsed.data.id;
    return {
      providerMode: "REAL",
      data: {
        text: parsed.data.choices[0].message.content,
        model: parsed.data.model ?? this.config.model,
        providerRequestId,
        finishReason: parsed.data.choices[0]?.finish_reason ?? undefined,
        usage: parsed.data.usage ? { inputTokens: parsed.data.usage.prompt_tokens, outputTokens: parsed.data.usage.completion_tokens } : undefined,
      },
    };
  }
}
