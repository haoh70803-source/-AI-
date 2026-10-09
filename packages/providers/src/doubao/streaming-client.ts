import { randomUUID } from "node:crypto";
import type { LookupFunction } from "node:net";
import { gzipSync, gunzipSync } from "node:zlib";
import { setTimeout as sleep } from "node:timers/promises";
import { Agent, WebSocket } from "undici";
import { assertReviewExternalAllowed } from "../review-policy";
import { resolvePublicAddress } from "../safe-url";
import type { TranscriptionInput } from "../types";
import { DoubaoError } from "./errors";
import { doubaoFlashResponseSchema, type DoubaoFlashResponse, type DoubaoRuntimeConfig } from "./schemas";

export function encodeDoubaoStreamPacket(kind: "CONFIG" | "AUDIO" | "LAST_AUDIO", data: Uint8Array) {
  const payload = gzipSync(data);
  const header = Buffer.from([0x11, kind === "CONFIG" ? 0x10 : kind === "LAST_AUDIO" ? 0x22 : 0x20, kind === "CONFIG" ? 0x11 : 0x01, 0]);
  const size = Buffer.alloc(4); size.writeUInt32BE(payload.length);
  return Buffer.concat([header, size, payload]);
}

export function decodeDoubaoStreamPacket(data: Uint8Array) {
  const frame = Buffer.from(data);
  if (frame.length < 8 || frame.length > 1024 * 1024 || frame[0]! >> 4 !== 1) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式响应帧无效。", false);
  const kind = frame[1]! >> 4, flags = frame[1]! & 15;
  let offset = (frame[0]! & 15) * 4, code: number | undefined, sequence: number | undefined;
  if (offset < 4 || (kind !== 9 && kind !== 15)) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式响应类型无效。", false);
  if (kind === 15 || (flags & 1)) {
    if (offset + 4 > frame.length) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式响应序号缺失。", false);
    if (kind === 15) code = frame.readUInt32BE(offset); else sequence = frame.readInt32BE(offset);
    offset += 4;
  }
  if (offset + 4 > frame.length) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式响应长度缺失。", false);
  const size = frame.readUInt32BE(offset); offset += 4;
  if (offset + size !== frame.length || ![0, 1].includes(frame[2]! & 15)) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式响应长度或压缩格式无效。", false);
  const bytes = (frame[2]! & 15) === 1 ? gunzipSync(frame.subarray(offset), { maxOutputLength: 8 * 1024 * 1024 }) : frame.subarray(offset);
  return { code, last: Boolean(flags & 2) || (sequence !== undefined && sequence < 0), payload: kind === 15 ? undefined : JSON.parse(bytes.toString("utf8")) as unknown };
}

function streamError(status?: number, code?: string, logId?: string) {
  const details = { httpStatus: status, statusCode: code, logId };
  if (status === 401) return new DoubaoError("DOUBAO_AUTH_FAILED", "豆包语音凭证无效。", false, details);
  if (status === 403 || code === "45000030") return new DoubaoError("DOUBAO_PERMISSION_DENIED", "豆包流式识别资源未授权。", false, details);
  if (status === 429) return new DoubaoError("DOUBAO_RATE_LIMITED", "豆包流式识别并发已达上限。", true, details);
  if (code === "20000003") return new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "音频中没有可转写的人声。", false, details);
  return new DoubaoError("DOUBAO_SERVER_ERROR", "豆包流式识别连接失败。", true, details);
}

export class DoubaoStreamingClient {
  private metadata: { requestId?: string; providerRequestId?: string; statusCode?: string } = {};
  constructor(private readonly config: DoubaoRuntimeConfig, private readonly options: { overallTimeoutMs?: number; packetIntervalMs?: number; signal?: AbortSignal } = {}) {}
  getLastRequestMetadata() { return { ...this.metadata }; }

  async recognize(input: TranscriptionInput): Promise<DoubaoFlashResponse> {
    assertReviewExternalAllowed();
    if (input.audio.mode !== "BINARY_DATA" || !input.audio.data.byteLength) throw new DoubaoError("DOUBAO_INVALID_AUDIO", "流式识别需要本机音频数据。", false);
    const audio = input.audio.data;
    const mediaType = input.contentType?.split(";")[0];
    const format = mediaType === "audio/wav" || mediaType === "audio/x-wav" ? "wav" : "mp3";
    const target = new URL("/api/v3/sauc/bigmodel_async", this.config.baseUrl);
    const testOrigin = process.env.ENVIRONMENT_ID === "LOCAL_TEST" ? process.env.PROVIDER_TEST_ORIGIN : undefined;
    if ((target.protocol !== "https:" && target.origin !== testOrigin) || target.username || target.password) throw new DoubaoError("DOUBAO_NOT_CONFIGURED", "豆包流式服务地址无效。", false);
    const { addresses } = await resolvePublicAddress(target.href, undefined, testOrigin);
    const address = addresses[0]!;
    const lookup: LookupFunction = (_host, options, callback) => callback(null, options.all ? [address] : address.address, options.all ? undefined : address.family);
    const dispatcher = new Agent({ connect: { lookup } });
    const requestId = randomUUID(); this.metadata = { requestId };
    let httpStatus: number | undefined;
    const captureHeaders = (status: number, values: Record<string, string | string[] | undefined>) => {
      httpStatus = status;
      if (values["x-tt-logid"]) this.metadata.providerRequestId = String(values["x-tt-logid"]);
      if (values["x-api-status-code"]) this.metadata.statusCode = String(values["x-api-status-code"]);
    };
    const transport = dispatcher.compose(dispatch => (options, handler) => {
      const wrapped = Object.create(handler) as typeof handler;
      wrapped.onRequestUpgrade = (...args) => { captureHeaders(args[1], args[2]); return handler.onRequestUpgrade?.(...args); };
      wrapped.onResponseStart = (...args) => { captureHeaders(args[1], args[2]); return handler.onResponseStart?.(...args); };
      return dispatch(options, wrapped);
    });
    const headers: Record<string, string> = { "X-Api-Resource-Id": this.config.resourceId, "X-Api-Request-Id": requestId, "X-Api-Connect-Id": requestId, "X-Api-Sequence": "-1" };
    if (this.config.authMode === "API_KEY") headers["X-Api-Key"] = this.config.apiKey;
    else { headers["X-Api-App-Key"] = this.config.appId; headers["X-Api-Access-Key"] = this.config.accessToken; }
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, ...(this.options.signal ? [this.options.signal] : [])]);
    let socket: InstanceType<typeof WebSocket> | undefined;
    try {
      return await new Promise<DoubaoFlashResponse>((resolve, reject) => {
        let settled = false, audioCompleted = false, result: DoubaoFlashResponse | undefined;
        const finish = (error?: Error) => {
          if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", aborted);
          controller.abort(); socket?.close();
          if (error) reject(error);
          else if (!result?.result.text.trim()) reject(new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "音频中没有可转写的人声。", false));
          else { this.metadata.statusCode = "20000000"; resolve(result); }
        };
        const aborted = () => finish(new DoubaoError("DOUBAO_TIMEOUT", "豆包流式识别已取消。", false));
        const timer = setTimeout(() => finish(new DoubaoError("DOUBAO_TIMEOUT", "豆包流式识别超过等待时限。", true)), this.options.overallTimeoutMs ?? 8 * 60_000);
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) { aborted(); return; }
        socket = new WebSocket(target, { headers, dispatcher: transport }); socket.binaryType = "arraybuffer";
        socket.addEventListener("error", () => finish(streamError(httpStatus, this.metadata.statusCode, this.metadata.providerRequestId)));
        socket.addEventListener("close", () => { if (!settled) finish(streamError(httpStatus, this.metadata.statusCode, this.metadata.providerRequestId)); });
        socket.addEventListener("message", event => {
          if (settled) return;
          try {
            const frame = decodeDoubaoStreamPacket(new Uint8Array(event.data as ArrayBuffer));
            if (frame.code) { this.metadata.statusCode = String(frame.code); finish(streamError(httpStatus, String(frame.code), this.metadata.providerRequestId)); return; }
            const parsed = doubaoFlashResponseSchema.safeParse(frame.payload);
            if (parsed.success) result = parsed.data;
            else if (frame.payload && typeof frame.payload === "object" && "result" in frame.payload && frame.payload.result && typeof frame.payload.result === "object" && "text" in frame.payload.result) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式识别结果格式无效。", false);
            if (frame.last) { if (!audioCompleted) throw new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包在音频发送完成前提前结束识别。", false); finish(); }
          } catch (error) { finish(error instanceof DoubaoError ? error : new DoubaoError("DOUBAO_INVALID_RESPONSE", "豆包流式识别响应无效。", false)); }
        });
        socket.addEventListener("open", () => {
          const corpus = this.config.boostingTableId || this.config.boostingTableName ? { boosting_table_id: this.config.boostingTableId, boosting_table_name: this.config.boostingTableName } : undefined;
          socket!.send(encodeDoubaoStreamPacket("CONFIG", Buffer.from(JSON.stringify({ user: { uid: requestId }, audio: { format, codec: "raw", rate: 16000, bits: 16, channel: 1 }, request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, show_utterances: true, result_type: "full", ...(corpus ? { corpus } : {}) } }))));
          void (async () => {
            // Extracted MP3 is mono 16kHz / 64kbit/s; 1600 bytes carries about 200ms.
            const chunkSize = format === "wav" ? 6400 : 1600;
            for (let offset = 0; offset < audio.length && !settled; offset += chunkSize) {
              while (socket!.bufferedAmount > 64 * 1024 && !settled) await sleep(20, undefined, { signal });
              if (settled) return;
              const last = offset + chunkSize >= audio.length;
              if (last) audioCompleted = true;
              socket!.send(encodeDoubaoStreamPacket(last ? "LAST_AUDIO" : "AUDIO", audio.subarray(offset, offset + chunkSize)));
              if (!last) await sleep(this.options.packetIntervalMs ?? 200, undefined, { signal });
            }
          })().catch(() => { if (!settled) finish(streamError()); });
        });
      });
    } finally { controller.abort(); socket?.close(); await dispatcher.destroy(); }
  }
}
