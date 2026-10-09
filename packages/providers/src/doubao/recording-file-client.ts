import { providerFetch } from "../provider-fetch";
import { randomUUID } from "node:crypto";
import { DoubaoError } from "./errors";
import { doubaoFlashResponseSchema, type DoubaoFlashResponse, type DoubaoRuntimeConfig } from "./schemas";
import type { TranscriptionInput } from "../types";

const SUCCESS = "20000000";
const PENDING = new Set(["20000001", "20000002"]);

type Options = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  submissionTimeoutMs?: number;
  queryTimeoutMs?: number;
  pollIntervalMs?: number;
  overallTimeoutMs?: number;
  signal?: AbortSignal;
};

function failure(response: Response, statusCode: string | null, logId: string | null) {
  const details = { httpStatus: response.status, statusCode: statusCode ?? undefined, logId: logId ?? undefined };
  if (response.status === 401) return new DoubaoError("DOUBAO_AUTH_FAILED", "豆包凭证无效。", false, details);
  if (response.status === 403) return new DoubaoError("DOUBAO_PERMISSION_DENIED", "豆包录音文件识别资源未授权。", false, details);
  if (response.status === 429) return new DoubaoError("DOUBAO_RATE_LIMITED", "豆包请求频率已达上限。", true, details);
  if (statusCode === "20000003") return new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "音频中没有可转写的人声。", false, details);
  if (statusCode === "45000002" || statusCode === "45000151") return new DoubaoError("DOUBAO_INVALID_AUDIO", "豆包无法识别该音频。", false, details);
  if (response.status >= 500 || statusCode?.startsWith("550")) return new DoubaoError("DOUBAO_SERVER_ERROR", "豆包服务暂时不可用。", true, details);
  return new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包拒绝了录音文件识别请求。", false, details);
}

export class DoubaoRecordingFileClient {
  private readonly fetcher: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private metadata: { requestId?: string; providerRequestId?: string; statusCode?: string; pollCount?: number } = {};

  constructor(private readonly config: DoubaoRuntimeConfig, private readonly options: Options = {}) {
    this.fetcher = options.fetch ?? providerFetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  getLastRequestMetadata() { return { ...this.metadata }; }

  private headers(requestId: string, logId?: string) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "X-Api-Resource-Id": this.config.resourceId,
      "X-Api-Request-Id": requestId,
    };
    if (this.config.authMode === "API_KEY") headers["X-Api-Key"] = this.config.apiKey;
    else {
      headers["X-Api-App-Key"] = this.config.appId;
      headers["X-Api-Access-Key"] = this.config.accessToken;
    }
    if (logId) headers["X-Tt-Logid"] = logId;
    return headers;
  }

  private endpoint(path: "submit" | "query") {
    return new URL(`/api/v3/auc/bigmodel/${path}`, `${this.config.baseUrl.replace(/\/$/, "")}/`);
  }

  async recognize(input: TranscriptionInput): Promise<DoubaoFlashResponse> {
    if (input.audio.mode !== "REMOTE_URL") {
      throw new DoubaoError("ASR_AUDIO_NOT_PUBLICLY_REACHABLE", "录音文件识别 2.0 需要公网可下载的音频地址。请配置公网对象存储或媒体中转服务，或开通极速版后切换接口。", false);
    }
    const requestId = randomUUID();
    const uid = this.config.authMode === "API_KEY" ? requestId : this.config.appId;
    const formats: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/aac": "aac", "audio/mp4": "m4a" };
    const format = input.contentType ? formats[input.contentType.split(";")[0]!.trim().toLowerCase()] : undefined;
    const body = { user: { uid }, audio: { url: input.audio.url, ...(format ? { format } : {}) }, request: { model_name: "bigmodel", show_utterances: true } };
    let submitted: Response;
    try {
      submitted = await this.fetcher(this.endpoint("submit"), { method: "POST", headers: { ...this.headers(requestId), "X-Api-Sequence": "-1" }, body: JSON.stringify(body), signal: AbortSignal.any([AbortSignal.timeout(this.options.submissionTimeoutMs ?? 30_000), ...(this.options.signal ? [this.options.signal] : [])]) });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new DoubaoError("DOUBAO_TIMEOUT", "豆包任务提交超时。", true);
      throw new DoubaoError("DOUBAO_SERVER_ERROR", "豆包任务提交失败。", true);
    }
    const submitCode = submitted.headers.get("X-Api-Status-Code");
    const logId = submitted.headers.get("X-Tt-Logid");
    this.metadata = { requestId, providerRequestId: logId ?? undefined, statusCode: submitCode ?? undefined, pollCount: 0 };
    if (!submitted.ok || submitCode !== SUCCESS) throw failure(submitted, submitCode, logId);

    const started = Date.now();
    let pollCount = 0;
    while (Date.now() - started < (this.options.overallTimeoutMs ?? 15 * 60_000)) {
      if (this.options.signal?.aborted) throw new DoubaoError("DOUBAO_TIMEOUT", "识别已取消，请重试。", false);
      if (pollCount > 0) await this.sleep(Math.min((this.options.pollIntervalMs ?? 1_000) * 2 ** Math.min(pollCount - 1, 3), 8_000));
      pollCount += 1;
      let response: Response;
      try {
        response = await this.fetcher(this.endpoint("query"), { method: "POST", headers: this.headers(requestId, logId ?? undefined), body: "{}", signal: AbortSignal.any([AbortSignal.timeout(this.options.queryTimeoutMs ?? 30_000), ...(this.options.signal ? [this.options.signal] : [])]) });
      } catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new DoubaoError("DOUBAO_TIMEOUT", "豆包任务查询超时。", true);
        throw new DoubaoError("DOUBAO_SERVER_ERROR", "豆包任务查询失败。", true);
      }
      const statusCode = response.headers.get("X-Api-Status-Code");
      this.metadata = { requestId, providerRequestId: response.headers.get("X-Tt-Logid") ?? logId ?? undefined, statusCode: statusCode ?? undefined, pollCount };
      if (PENDING.has(statusCode ?? "")) continue;
      if (!response.ok || statusCode !== SUCCESS) throw failure(response, statusCode, logId);
      const parsed = doubaoFlashResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包返回结构不符合录音文件识别协议。", false);
      return parsed.data;
    }
    throw new DoubaoError("DOUBAO_TIMEOUT", "豆包录音文件识别任务超过最大等待时间。", true);
  }
}
