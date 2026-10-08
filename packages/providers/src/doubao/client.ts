import { providerFetch } from "../provider-fetch";
import { randomUUID } from "node:crypto";
import { DOUBAO_FLASH_TIMEOUT_MS, MAX_ASR_BINARY_DATA_BYTES, MAX_ASR_FLASH_BYTES } from "@content-center/config";
import { DoubaoError } from "./errors";
import { doubaoFlashResponseSchema, type DoubaoFlashResponse, type DoubaoRuntimeConfig } from "./schemas";
import type { TranscriptionInput } from "../types";

export type DoubaoRequestMetadata = {
  requestId?: string;
  providerRequestId?: string;
  statusCode?: string;
};

export type DoubaoClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

function requestError(
  response: Response,
  statusCode: string | null,
  logId: string | null,
) {
  const details = {
    httpStatus: response.status,
    statusCode: statusCode ?? undefined,
    logId: logId ?? undefined,
  };
  if (response.status === 401) return new DoubaoError("DOUBAO_AUTH_FAILED", "豆包 API Key 无效。", false, details);
  if (response.status === 403) return new DoubaoError("DOUBAO_PERMISSION_DENIED", "豆包资源未授权。", false, details);
  if (response.status === 429) return new DoubaoError("DOUBAO_RATE_LIMITED", "豆包请求过于频繁。", true, details);
  if (response.status >= 500) return new DoubaoError("DOUBAO_SERVER_ERROR", "豆包服务暂时不可用。", true, details);
  if (statusCode === "20000003") return new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "音频中没有可转写的人声。", false, details);
  if (statusCode === "45000151" || statusCode === "45000002") {
    return new DoubaoError("DOUBAO_INVALID_AUDIO", "豆包无法识别该音频格式。", false, details);
  }
  if (statusCode?.startsWith("550")) return new DoubaoError("DOUBAO_SERVER_ERROR", "豆包服务暂时不可用。", true, details);
  return new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包拒绝了本次转写请求。", false, details);
}

export class DoubaoClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private lastRequestMetadata: DoubaoRequestMetadata = {};

  constructor(
    private readonly config: DoubaoRuntimeConfig,
    options: DoubaoClientOptions = {},
  ) {
    this.fetcher = options.fetch ?? providerFetch;
    this.timeoutMs = options.timeoutMs ?? DOUBAO_FLASH_TIMEOUT_MS;
  }

  getLastRequestMetadata() {
    return { ...this.lastRequestMetadata };
  }

  async recognizeFlash(input: TranscriptionInput): Promise<DoubaoFlashResponse> {
    if (input.audio.mode === "BINARY_DATA") {
      if (input.audio.data.byteLength > MAX_ASR_FLASH_BYTES) {
        throw new DoubaoError("ASR_AUDIO_TOO_LARGE", "音频超过极速版 100MB 限制。", false);
      }
      if (input.audio.data.byteLength > MAX_ASR_BINARY_DATA_BYTES) {
        throw new DoubaoError("ASR_AUDIO_NOT_PUBLICLY_REACHABLE", "音频地址不可公网访问，且文件不适合二进制上传。", false);
      }
    }

    const requestId = randomUUID();
    const endpoint = new URL("/api/v3/auc/bigmodel/recognize/flash", `${this.config.baseUrl.replace(/\/$/, "")}/`);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "X-Api-Resource-Id": this.config.resourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
    };
    const uid = this.config.authMode === "API_KEY" ? this.config.apiKey : this.config.appId;
    if (this.config.authMode === "API_KEY") {
      headers["X-Api-Key"] = this.config.apiKey;
    } else {
      headers["X-Api-App-Key"] = this.config.appId;
      headers["X-Api-Access-Key"] = this.config.accessToken;
    }
    const corpus = this.config.boostingTableId || this.config.boostingTableName
      ? {
          ...(this.config.boostingTableId ? { boosting_table_id: this.config.boostingTableId } : {}),
          ...(this.config.boostingTableName ? { boosting_table_name: this.config.boostingTableName } : {}),
        }
      : undefined;
    const body = {
      user: { uid },
      audio: input.audio.mode === "REMOTE_URL"
        ? { url: input.audio.url }
        : { data: Buffer.from(input.audio.data).toString("base64") },
      request: {
        model_name: "bigmodel",
        show_utterances: true,
        ...(corpus ? { corpus } : {}),
      },
    };

    this.lastRequestMetadata = { requestId };
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new DoubaoError("DOUBAO_TIMEOUT", "豆包转写请求超时。", true);
      }
      throw new DoubaoError("DOUBAO_SERVER_ERROR", "豆包服务暂时无法连接。", true);
    }

    const statusCode = response.headers.get("X-Api-Status-Code");
    const logId = response.headers.get("X-Tt-Logid");
    this.lastRequestMetadata = {
      requestId,
      providerRequestId: logId ?? undefined,
      statusCode: statusCode ?? undefined,
    };
    if (!response.ok || statusCode !== "20000000") {
      throw requestError(response, statusCode, logId);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await response.text());
    } catch {
      throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包返回了无效 JSON。", false, {
        httpStatus: response.status,
        statusCode,
        logId: logId ?? undefined,
      });
    }
    const parsed = doubaoFlashResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包返回结构不符合协议。", false, {
        httpStatus: response.status,
        statusCode,
        logId: logId ?? undefined,
      });
    }
    return parsed.data;
  }
}
