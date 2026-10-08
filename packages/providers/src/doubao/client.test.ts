import { describe, expect, it, vi } from "vitest";
import { DoubaoClient } from "./client";
import { DoubaoTranscriptionProvider } from "./provider";

const config = {
  authMode: "API_KEY" as const,
  baseUrl: "https://openspeech.bytedance.com",
  resourceId: "volc.bigasr.auc_turbo",
  apiKey: "test-api-key",
  boostingTableId: "hotwords-1",
};

function response(body: unknown, options: { status?: number; providerStatus?: string } = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      "X-Api-Status-Code": options.providerStatus ?? "20000000",
      "X-Api-Message": "fixture",
      "X-Tt-Logid": "doubao-log-id",
    },
  });
}

describe("DoubaoClient / DoubaoTranscriptionProvider", () => {
  it("uses the current API key headers and maps full text plus segments", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Api-Key")).toBe("test-api-key");
      expect(headers.get("X-Api-Resource-Id")).toBe("volc.bigasr.auc_turbo");
      expect(headers.get("X-Api-Sequence")).toBe("-1");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        audio: { url: "https://media.example/audio.mp3" },
        request: { model_name: "bigmodel", show_utterances: true, corpus: { boosting_table_id: "hotwords-1" } },
      });
      return response({
        audio_info: { duration: 9_000 },
        result: {
          text: "第一句。第二句。",
          utterances: [
            { start_time: 0, end_time: 4_000, text: "第一句。" },
            { start_time: 4_000, end_time: 9_000, text: "第二句。" },
          ],
        },
      });
    });
    const provider = new DoubaoTranscriptionProvider(new DoubaoClient(config, { fetch: fetcher as typeof fetch }));
    await expect(provider.transcribe({ audio: { mode: "REMOTE_URL", url: "https://media.example/audio.mp3" } })).resolves.toEqual({
      providerMode: "REAL",
      data: {
        durationMs: 9_000,
        fullText: "第一句。第二句。",
        segments: [
          { startMs: 0, endMs: 4_000, text: "第一句。" },
          { startMs: 4_000, endMs: 9_000, text: "第二句。" },
        ],
      },
    });
    expect(provider.getLastRequestMetadata()).toMatchObject({ providerRequestId: "doubao-log-id", statusCode: "20000000" });
  });

  it("sends small binary audio as base64", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { audio: { data: string } };
      expect(body.audio.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
      return response({ audio_info: { duration: 10 }, result: { text: "好", utterances: [] } });
    });
    await new DoubaoClient(config, { fetch: fetcher as typeof fetch }).recognizeFlash({
      audio: { mode: "BINARY_DATA", data: new Uint8Array([1, 2, 3]) },
    });
  });

  it("rejects an empty successful transcript", async () => {
    const provider = new DoubaoTranscriptionProvider(new DoubaoClient(config, {
      fetch: vi.fn(async () => response({ audio_info: { duration: 1_000 }, result: { text: "  ", utterances: [] } })) as typeof fetch,
    }));
    await expect(provider.transcribe({ audio: { mode: "REMOTE_URL", url: "https://media.example/audio.mp3" } }))
      .rejects.toMatchObject({ code: "DOUBAO_EMPTY_TRANSCRIPT", retryable: false });
  });

  it.each([
    [401, "DOUBAO_AUTH_FAILED", false],
    [403, "DOUBAO_PERMISSION_DENIED", false],
    [429, "DOUBAO_RATE_LIMITED", true],
    [503, "DOUBAO_SERVER_ERROR", true],
  ])("maps HTTP %s to %s", async (status, code, retryable) => {
    const client = new DoubaoClient(config, { fetch: vi.fn(async () => response({}, { status })) as typeof fetch });
    await expect(client.recognizeFlash({ audio: { mode: "REMOTE_URL", url: "https://media.example/audio.mp3" } }))
      .rejects.toMatchObject({ code, retryable, details: { httpStatus: status, logId: "doubao-log-id" } });
  });

  it("treats provider 550 errors as retryable", async () => {
    const client = new DoubaoClient(config, { fetch: vi.fn(async () => response({}, { providerStatus: "55000031" })) as typeof fetch });
    await expect(client.recognizeFlash({ audio: { mode: "REMOTE_URL", url: "https://media.example/audio.mp3" } }))
      .rejects.toMatchObject({ code: "DOUBAO_SERVER_ERROR", retryable: true });
  });

  it("maps timeouts without exposing a stack or request payload", async () => {
    const client = new DoubaoClient(config, {
      fetch: vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }) as typeof fetch,
    });
    await expect(client.recognizeFlash({ audio: { mode: "REMOTE_URL", url: "https://media.example/audio.mp3" } }))
      .rejects.toMatchObject({ code: "DOUBAO_TIMEOUT", retryable: true });
  });

  it("rejects a success response with an invalid schema", async () => {
    const client = new DoubaoClient(config, { fetch: vi.fn(async () => response({ result: {} })) as typeof fetch });
    await expect(client.recognizeFlash({ audio: { mode: "REMOTE_URL", url: "https://media.example/audio.mp3" } }))
      .rejects.toMatchObject({ code: "DOUBAO_INVALID_RESPONSE", retryable: false });
  });
});
