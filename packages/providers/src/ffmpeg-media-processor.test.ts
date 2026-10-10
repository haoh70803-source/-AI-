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
  it("converts HEVC into a verified H.264 preview and rejects an audio-only file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "content-center-preview-test-"));
    cleanupDirectories.push(directory);
    const input = join(directory, "original.mp4");
    await execFileAsync("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-c:v", "libx265", "-c:a", "aac", "-y", input]);
    const processor = new FFmpegMediaProcessor();
    const original = await processor.probeVideo(input);
    expect(original).toMatchObject({ codec: "hevc", width: 320, height: 180, browserCompatible: false });
    const result = await processor.createVideoPreview(input, original.durationMs);
    try {
      expect(result.probe).toMatchObject({ codec: "h264", browserCompatible: true, width: 320, height: 180 });
      expect((await processor.probeVideo(input)).codec).toBe("hevc");
      const audio = await processor.extractAudio(input);
      try { await expect(processor.probeVideo(audio.path)).rejects.toMatchObject({ code: "VIDEO_TRACK_MISSING" }); }
      finally { await audio.cleanup(); }
    } finally { await result.cleanup(); }
  }, 30_000);
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
    const slice = await new FFmpegMediaProcessor().extractAudio(videoPath, { limits: "NONE", startMs: 500, maxDurationMs: 300, localOnly: true });
    expect(slice.durationMs).toBeGreaterThanOrEqual(300);
    expect(slice.durationMs).toBeLessThan(450);
    await slice.cleanup();
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
