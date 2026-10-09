import { describe, expect, it, vi } from "vitest";
import { DoubaoError } from "./errors";
import { DoubaoRecordingFileClient } from "./recording-file-client";

const config = { authMode: "LEGACY_APP_TOKEN" as const, baseUrl: "https://openspeech.bytedance.com", appId: "app", accessToken: "token", resourceId: "volc.seedasr.auc" };
const response = (code: string, body: unknown = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "X-Api-Status-Code": code, "X-Tt-Logid": "safe-log-id" } });
const input = { audio: { mode: "REMOTE_URL" as const, url: "https://storage.example.test/audio.mp3" }, contentType: "audio/mpeg" };

describe("Doubao Recording File Recognition 2.0", () => {
  it("submits and polls a recording-file task until success", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response("20000000"))
      .mockResolvedValueOnce(response("20000001"))
      .mockResolvedValueOnce(response("20000000", { audio_info: { duration: 1200 }, result: { text: "真实结果", utterances: [{ start_time: 0, end_time: 1200, text: "真实结果" }] } }));
    const client = new DoubaoRecordingFileClient(config, { fetch: fetcher, sleep: async () => undefined });
    await expect(client.recognize(input)).resolves.toMatchObject({ result: { text: "真实结果" } });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
    ]);
    expect(client.getLastRequestMetadata()).toMatchObject({ providerRequestId: "safe-log-id", pollCount: 2 });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ audio: { url: input.audio.url, format: "mp3" }, request: { model_name: "bigmodel" } });
  });

  it("classifies provider failure without exposing credentials", async () => {
    const client = new DoubaoRecordingFileClient(config, { fetch: vi.fn().mockResolvedValue(response("55000031", {}, 503)) });
    await expect(client.recognize(input)).rejects.toMatchObject({ code: "DOUBAO_SERVER_ERROR", retryable: true });
  });

  it("classifies submission timeout", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const client = new DoubaoRecordingFileClient(config, { fetch: vi.fn().mockRejectedValue(timeout) });
    await expect(client.recognize(input)).rejects.toMatchObject({ code: "DOUBAO_TIMEOUT", retryable: true });
  });

  it("stops bounded polling", async () => {
    const client = new DoubaoRecordingFileClient(config, {
      fetch: vi.fn().mockResolvedValueOnce(response("20000000")).mockResolvedValue(response("20000001")),
      sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
      overallTimeoutMs: 1,
      pollIntervalMs: 1,
    });
    await expect(client.recognize(input)).rejects.toMatchObject({ code: "DOUBAO_TIMEOUT" });
  });

  it("rejects binary audio because the async provider requires a downloadable URL", async () => {
    const client = new DoubaoRecordingFileClient(config, { fetch: vi.fn() });
    await expect(client.recognize({ audio: { mode: "BINARY_DATA", data: new Uint8Array([1]) } })).rejects.toBeInstanceOf(DoubaoError);
    await expect(client.recognize({ audio: { mode: "BINARY_DATA", data: new Uint8Array([1]) } })).rejects.toMatchObject({ code: "ASR_AUDIO_NOT_PUBLICLY_REACHABLE" });
  });
});
