import { afterEach, describe, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ dns: vi.fn(), http: vi.fn(), https: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.dns }));
vi.mock("node:http", () => ({ request: network.http }));
vi.mock("node:https", () => ({ request: network.https }));
import { LocalAsrClient } from "./local-asr/client";
import { fetchPublicText, resolvePublicAddress } from "./safe-url";
import { providerFetch } from "./provider-fetch";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe.each(["offline flag", "review profile", "daily cutover"])("%s external boundaries", mode => {
  it("blocks ASR health, initialization and transcription before fetch", async () => {
    vi.stubEnv("EXTERNAL_CALLS_DISABLED", mode === "daily cutover" ? "true" : "false");
    vi.stubEnv("LOCAL_REVIEW_OFFLINE", mode === "offline flag" ? "true" : "false");
    vi.stubEnv("ENVIRONMENT_ID", mode === "review profile" ? "LOCAL_REVIEW" : "LOCAL_TEST");
    const fetcher = vi.fn<typeof fetch>();
    const client = new LocalAsrClient({ endpoint: "https://asr.example.invalid", model: "SENSEVOICE_SMALL", device: "CPU" }, { fetch: fetcher });
    for (const attempt of [() => client.health(), () => client.installModel("SENSEVOICE_SMALL"), () => client.transcribe({ audio: { mode: "BINARY_DATA", data: new Uint8Array([1]) } })]) {
      await expect(attempt()).rejects.toMatchObject({ code: "LOCAL_REVIEW_OFFLINE", retryable: false });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("blocks public scraping and provider calls before DNS or transport", async () => {
    vi.stubEnv("EXTERNAL_CALLS_DISABLED", mode === "daily cutover" ? "true" : "false");
    vi.stubEnv("LOCAL_REVIEW_OFFLINE", mode === "offline flag" ? "true" : "false");
    vi.stubEnv("ENVIRONMENT_ID", mode === "review profile" ? "LOCAL_REVIEW" : "LOCAL_TEST");
    const resolver = vi.fn(), transport = vi.fn();
    await expect(resolvePublicAddress("https://source.example.invalid", resolver)).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
    await expect(fetchPublicText("https://source.example.invalid", { resolver, transport })).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
    await expect(providerFetch("https://provider.example.invalid")).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
    expect(resolver).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
    for (const spy of Object.values(network)) expect(spy).not.toHaveBeenCalled();
  });
});
it("preserves normal ASR transport outside review", async () => {
  vi.stubEnv("LOCAL_REVIEW_OFFLINE", "false"); vi.stubEnv("ENVIRONMENT_ID", "LOCAL_TEST");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
  const client = new LocalAsrClient({ endpoint: "http://127.0.0.1:18765", model: "SENSEVOICE_SMALL", device: "CPU" }, { fetch: fetcher });
  await client.installModel("SENSEVOICE_SMALL"); expect(fetcher).toHaveBeenCalledOnce();
});
