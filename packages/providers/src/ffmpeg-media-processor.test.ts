import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { assertFlashAudioLimits, FFmpegMediaProcessor } from "./ffmpeg-media-processor";

const execFileAsync = promisify(execFile);
const cleanupDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FFmpegMediaProcessor", () => {
  it("extracts mono 16kHz MP3 audio from a small real video", async () => {
    const directory = await mkdtemp(join(tmpdir(), "content-center-ffmpeg-test-"));
    cleanupDirectories.push(directory);
    const videoPath = join(directory, "fixture.mp4");
    await execFileAsync("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-shortest", "-c:v", "libx264", "-c:a", "aac", "-y", videoPath,
    ]);
    const extracted = await new FFmpegMediaProcessor().extractAudio(videoPath);
    expect(extracted.path).toMatch(/audio\.mp3$/);
    expect(extracted.sizeBytes).toBeGreaterThan(0);
    expect(extracted.durationMs).toBeGreaterThanOrEqual(900);
    expect(extracted.durationMs).toBeLessThanOrEqual(1_100);
    await extracted.cleanup();
    const bounded = await new FFmpegMediaProcessor().extractAudio(videoPath, { limits: "NONE", maxDurationMs: 500, localOnly: true });
    expect(bounded.durationMs).toBeLessThanOrEqual(600);
    await bounded.cleanup();
  }, 20_000);

  it("reports FFmpeg failures explicitly", async () => {
    await expect(new FFmpegMediaProcessor().extractAudio("missing-video-file.mp4"))
      .rejects.toMatchObject({ code: "ASR_AUDIO_EXTRACTION_FAILED" });
  });

  it("probes an existing audio file duration", async () => {
    const durationMs = await new FFmpegMediaProcessor().probeDuration(fileURLToPath(new URL("../../../services/local-asr/benchmark/audio/normal_zh.wav", import.meta.url)));
    expect(durationMs).toBeGreaterThan(6_000);
  });

  it("reports missing binaries explicitly", async () => {
    await expect(new FFmpegMediaProcessor({ ffmpegPath: "definitely-missing-ffmpeg" }).checkAvailability())
      .rejects.toMatchObject({ code: "FFMPEG_NOT_AVAILABLE" });
  });

  it("enforces flash size and duration limits without allocating huge fixtures", () => {
    expect(() => assertFlashAudioLimits({ sizeBytes: 100 * 1024 * 1024 + 1, durationMs: 1_000 }))
      .toThrow(expect.objectContaining({ code: "ASR_AUDIO_TOO_LARGE" }));
    expect(() => assertFlashAudioLimits({ sizeBytes: 1_000, durationMs: 2 * 60 * 60 * 1_000 + 1 }))
      .toThrow(expect.objectContaining({ code: "ASR_AUDIO_TOO_LONG" }));
  });
});

it('terminates a stuck media subprocess and reports a retryable user action', async () => {
  const server = createServer(() => {});
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture missing");
  try { await expect(new FFmpegMediaProcessor({ timeoutMs: 200 }).probeDuration(`http://127.0.0.1:${address.port}/hang`)).rejects.toMatchObject({ code: 'ASR_PROCESS_TIMEOUT' }); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 5000);
