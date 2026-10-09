import type { TranscriptionInput } from "../types";
import { isLocalReviewOffline } from "../review-policy";
import { LocalAsrError, type LocalAsrErrorCode } from "./errors";
import { localAsrHealthSchema, localAsrTranscriptSchema } from "./schemas";
import type { LocalAsrDevice, LocalAsrModel } from "./types";

export type LocalAsrRuntimeConfig = {
  endpoint: string;
  model: LocalAsrModel;
  device: LocalAsrDevice;
  language?: string;
  hotwords?: string[];
};

export type LocalAsrClientOptions = { fetch?: typeof fetch; timeoutMs?: number; signal?: AbortSignal };

const KNOWN_CODES = new Set<LocalAsrErrorCode>([
  "LOCAL_ASR_NOT_RUNNING",
  "LOCAL_ASR_MODEL_NOT_INSTALLED",
  "LOCAL_ASR_MODEL_LOAD_FAILED",
  "LOCAL_ASR_TRANSCRIPTION_FAILED",
  "LOCAL_ASR_TIMEOUT",
  "LOCAL_ASR_INVALID_RESPONSE",
  "LOCAL_ASR_UNSUPPORTED_HARDWARE",
]);

function endpoint(base: string, path: string) {
  return new URL(path, `${base.replace(/\/$/, "")}/`);
}

async function responseError(response: Response) {
  const raw = await response.json().catch(() => null) as { detail?: { code?: string; message?: string } } | null;
  const code = raw?.detail?.code;
  const known = typeof code === "string" && KNOWN_CODES.has(code as LocalAsrErrorCode)
    ? code as LocalAsrErrorCode
    : "LOCAL_ASR_TRANSCRIPTION_FAILED";
  return new LocalAsrError(known, raw?.detail?.message || "本地语音识别服务返回错误。", response.status >= 500);
}

export class LocalAsrClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private lastMetadata: Record<string, unknown> = {};
  private readonly signal?: AbortSignal;

  constructor(readonly config: LocalAsrRuntimeConfig, options: LocalAsrClientOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30 * 60 * 1_000;
    this.signal = options.signal;
  }

  getLastRequestMetadata() {
    return { ...this.lastMetadata };
  }

  async health() {
    const response = await this.request(endpoint(this.config.endpoint, "/health"), { method: "GET" }, 10_000);
    if (!response.ok) throw await responseError(response);
    const parsed = localAsrHealthSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new LocalAsrError("LOCAL_ASR_INVALID_RESPONSE", "本地服务健康检查返回无效数据。", false);
    return parsed.data;
  }

  async installModel(model: LocalAsrModel) {
    const response = await this.request(endpoint(this.config.endpoint, `/models/${model}/install`), { method: "POST" }, 60 * 60 * 1_000);
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async transcribe(input: TranscriptionInput) {
    if (input.audio.mode !== "BINARY_DATA") {
      throw new LocalAsrError("LOCAL_ASR_TRANSCRIPTION_FAILED", "本地转写只接受受控音频数据。", false);
    }
    const body = new FormData();
    const bytes = input.audio.data.buffer.slice(
      input.audio.data.byteOffset,
      input.audio.data.byteOffset + input.audio.data.byteLength,
    ) as ArrayBuffer;
    body.append("file", new Blob([bytes], { type: input.contentType ?? "application/octet-stream" }), "audio.mp3");
    body.append("model", this.config.model);
    body.append("device", this.config.device);
    body.append("language", this.config.language ?? "auto");
    body.append("hotwords", JSON.stringify(this.config.hotwords ?? []));
    body.append("speakerDiarization", "false");
    const response = await this.request(endpoint(this.config.endpoint, "/transcribe"), { method: "POST", body }, this.timeoutMs);
    if (!response.ok) throw await responseError(response);
    const parsed = localAsrTranscriptSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new LocalAsrError("LOCAL_ASR_INVALID_RESPONSE", "本地服务返回结构不符合协议。", false);
    this.lastMetadata = {
      model: parsed.data.model,
      modelLabel: parsed.data.modelLabel,
      device: parsed.data.device,
      processingMs: parsed.data.processingMs,
      resources: parsed.data.resources,
    };
    return parsed.data;
  }

  private async request(url: URL, init: RequestInit, timeoutMs: number) {
    if (isLocalReviewOffline()) throw new LocalAsrError("LOCAL_REVIEW_OFFLINE", "验收环境已关闭语音服务调用。", false);
    try {
      return await this.fetcher(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(this.signal ? [this.signal] : [])]) });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new LocalAsrError("LOCAL_ASR_TIMEOUT", "本地语音识别处理超时。", true);
      }
      throw new LocalAsrError("LOCAL_ASR_NOT_RUNNING", "本地语音识别服务未启动。", true);
    }
  }
}
