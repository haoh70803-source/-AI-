import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
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
  }, 20_000);

  it("reports FFmpeg failures explicitly", async () => {
    await expect(new FFmpegMediaProcessor().extractAudio("missing-video-file.mp4"))
      .rejects.toMatchObject({ code: "ASR_AUDIO_EXTRACTION_FAILED" });
  });

  it("probes an existing audio file duration", async () => {
    const durationMs = await new FFmpegMediaProcessor().probeDuration(resolve(process.cwd(), "../../services/local-asr/benchmark/audio/normal_zh.wav"));
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
