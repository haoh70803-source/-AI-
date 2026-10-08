import { describe, expect, it, vi } from "vitest";
import { LocalAsrClient } from "./client";
import { LocalFunASRTranscriptionProvider } from "./provider";

const config = { endpoint: "http://127.0.0.1:8765", model: "SENSEVOICE_SMALL" as const, device: "CPU" as const };

describe("LocalAsrClient", () => {
  it("sends private binary audio as multipart and normalizes the provider result", async () => {
    const fetcher = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init!.body as FormData;
      expect(form.get("model")).toBe("SENSEVOICE_SMALL");
      expect(form.get("device")).toBe("CPU");
      expect(form.get("file")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({
        language: "zh",
        durationMs: 1_250,
        fullText: "本地转写完成。",
        segments: [{ startMs: 0, endMs: 1_250, text: "本地转写完成。" }],
        model: "SENSEVOICE_SMALL",
        modelLabel: "SenseVoiceSmall",
        device: "CPU",
        processingMs: 380,
        resources: { ramMb: 900 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const provider = new LocalFunASRTranscriptionProvider(new LocalAsrClient(config, { fetch: fetcher as typeof fetch }));
    await expect(provider.transcribe({ audio: { mode: "BINARY_DATA", data: new Uint8Array([1, 2, 3]) }, contentType: "audio/mpeg" })).resolves.toEqual({
      providerMode: "REAL",
      data: {
        language: "zh",
        durationMs: 1_250,
        fullText: "本地转写完成。",
        segments: [{ startMs: 0, endMs: 1_250, text: "本地转写完成。" }],
      },
    });
    expect(provider.getLastRequestMetadata()).toMatchObject({ model: "SENSEVOICE_SMALL", device: "CPU", processingMs: 380 });
  });

  it("reports an unavailable local service explicitly", async () => {
    const client = new LocalAsrClient(config, { fetch: vi.fn(async () => { throw new TypeError("connect failed"); }) as typeof fetch });
    await expect(client.health()).rejects.toMatchObject({ code: "LOCAL_ASR_NOT_RUNNING", retryable: true });
  });
});

