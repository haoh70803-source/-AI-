import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), prepare: vi.fn(), transcribe: vi.fn(), lock: vi.fn(), extract: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: mocks.context, apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
vi.mock("@content-center/worker/transcription", () => ({ prepareVoiceTranscription: mocks.prepare }));
vi.mock("@content-center/worker/job-recovery", () => ({ executionLock: mocks.lock }));
vi.mock("@content-center/db", () => ({ db: { $transaction: async (fn: (tx: unknown) => unknown) => fn({}) } }));
vi.mock("@content-center/providers", async original => ({ ...await original<typeof import("@content-center/providers")>(), FFmpegMediaProcessor: class { extractAudio = mocks.extract; } }));
import { DoubaoError } from "@content-center/providers";
import { GET, POST } from "../app/api/voice-input/route";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directories: string[] = [];
function request(bytes = "RIFF0000WAVEvoice", type = "audio/wav") { const form = new FormData(); form.append("audio", new File([bytes], "voice", { type })); return new Request("http://localhost/api/voice-input", { method: "POST", body: form }); }
afterEach(async () => { vi.resetAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function configured() {
  mocks.context.mockResolvedValue({ workspace: { id: "workspace-voice" }, session: { user: { id: "user-voice" } }, role: "OWNER" });
  mocks.lock.mockResolvedValue(true); mocks.prepare.mockResolvedValue(mocks.transcribe); mocks.transcribe.mockResolvedValue("识别文字");
  const directory = await mkdtemp(join(tmpdir(), "voice-api-test-")); directories.push(directory);
  const path = join(directory, "audio.mp3"); await writeFile(path, "fixture");
  mocks.extract.mockResolvedValue({ path, durationMs: 3000, cleanup: mocks.cleanup });
}
it("requires authentication and write membership before credentials or audio processing", async () => {
  mocks.context.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
  mocks.context.mockResolvedValue({ role: "VIEWER" }); expect((await POST(request())).status).toBe(403);
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
});
it("returns a missing-key message before decoding or paid requests", async () => {
  await configured(); mocks.prepare.mockRejectedValue(new DoubaoError("DOUBAO_NOT_CONFIGURED", "请先配置 API Key", false));
  const response = await POST(request()); expect(response.status).toBe(409); expect((await response.json()).message).toContain("API Key"); expect(mocks.extract).not.toHaveBeenCalled();
});
it("bounds input and blocks arbitrary text masquerading as recorded audio", async () => {
  await configured(); expect((await POST(request("https://internal.example/audio", "audio/webm"))).status).toBe(400);
  expect((await POST(request("", "audio/wav"))).status).toBe(400);
  expect((await POST(request("a".repeat(5 * 1024 * 1024 + 1)))).status).toBe(400);
  expect(mocks.transcribe).not.toHaveBeenCalled();
});
it("passes only current workspace/user audio and cleans extracted files after success", async () => {
  await configured(); const response = await POST(request()); expect(await response.json()).toEqual({ text: "识别文字" });
  expect(mocks.prepare).toHaveBeenCalledWith("workspace-voice", expect.any(AbortSignal)); expect(mocks.transcribe).toHaveBeenCalledWith({ audio: { mode: "BINARY_DATA", data: expect.any(Uint8Array) }, contentType: "audio/mpeg" }, "user-voice", 3000);
  expect(mocks.extract).toHaveBeenCalledWith(expect.any(String), { limits: "NONE", maxDurationMs: 61000, localOnly: true }); expect(mocks.cleanup).toHaveBeenCalledOnce();
});
it("rejects long and silent recordings and cleans audio after provider failure", async () => {
  await configured(); const extracted = await mocks.extract(); mocks.extract.mockResolvedValue({ ...extracted, durationMs: 61000 });
  expect((await POST(request())).status).toBe(400); expect(mocks.transcribe).not.toHaveBeenCalled();
  mocks.extract.mockResolvedValue(extracted); mocks.transcribe.mockResolvedValue(""); expect((await POST(request())).status).toBe(422);
  mocks.transcribe.mockRejectedValue(new DoubaoError("DOUBAO_TIMEOUT", "超时请重试", false)); expect((await POST(request())).status).toBe(408); expect(mocks.cleanup).toHaveBeenCalledTimes(3);
});
it("does not start a duplicate concurrent recognition", async () => {
  await configured(); mocks.lock.mockResolvedValue(false); expect((await POST(request())).status).toBe(409); expect(mocks.prepare).not.toHaveBeenCalled();
});
it("checks voice availability without recognizing or exposing credentials", async () => {
  mocks.context.mockResolvedValue(null); expect((await GET()).status).toBe(401);
  mocks.context.mockResolvedValue({ role: "VIEWER" }); expect((await GET()).status).toBe(403);
  await configured(); expect(await (await GET()).json()).toEqual({ available: true });
  mocks.prepare.mockRejectedValue(new DoubaoError("DOUBAO_NOT_CONFIGURED", "请配置转录服务", false));
  const response = await GET(); expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: "VOICE_UNAVAILABLE", message: "请配置转录服务" }); expect(mocks.transcribe).not.toHaveBeenCalled();
});
it("ends an aborted upload before decoding or recognition", async () => {
  await configured(); const controller = new AbortController(); controller.abort();
  const original = request(); const response = await POST(new Request(original, { signal: controller.signal }));
  expect(response.status).toBe(408); expect(mocks.extract).not.toHaveBeenCalled(); expect(mocks.transcribe).not.toHaveBeenCalled();
});
