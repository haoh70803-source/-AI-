import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ASR_FLASH_BYTES, MAX_ASR_FLASH_DURATION_MS } from "@content-center/config";

export type MediaProcessorErrorCode =
  | "FFMPEG_NOT_AVAILABLE"
  | "ASR_AUDIO_EXTRACTION_FAILED"
  | "ASR_AUDIO_TOO_LARGE"
  | "ASR_AUDIO_TOO_LONG";

export class MediaProcessorError extends Error {
  constructor(readonly code: MediaProcessorErrorCode, message: string) {
    super(message);
    this.name = "MediaProcessorError";
  }
}

export function assertFlashAudioLimits(input: { sizeBytes: number; durationMs: number }) {
  if (input.sizeBytes > MAX_ASR_FLASH_BYTES) {
    throw new MediaProcessorError("ASR_AUDIO_TOO_LARGE", "音频超过极速版 100MB 限制。");
  }
  if (input.durationMs > MAX_ASR_FLASH_DURATION_MS) {
    throw new MediaProcessorError("ASR_AUDIO_TOO_LONG", "音频超过极速版 2 小时时长限制。");
  }
}

type ProcessorOptions = { ffmpegPath?: string; ffprobePath?: string };
type ExtractAudioOptions = { limits?: "DOUBAO_FLASH" | "NONE" };

async function runProcess(command: string, args: string[], failureCode: MediaProcessorErrorCode) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    let stderrBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(new MediaProcessorError(
        error.code === "ENOENT" ? "FFMPEG_NOT_AVAILABLE" : failureCode,
        error.code === "ENOENT" ? "ffmpeg/ffprobe 未安装或不在 PATH。" : "音频处理进程无法启动。",
      ));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new MediaProcessorError(failureCode, `音频处理失败（exit ${code ?? "unknown"}，stderr ${stderrBytes} bytes）。`));
    });
  });
}

export class FFmpegMediaProcessor {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(options: ProcessorOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? "ffprobe";
  }

  async checkAvailability() {
    await runProcess(this.ffmpegPath, ["-version"], "FFMPEG_NOT_AVAILABLE");
    await runProcess(this.ffprobePath, ["-version"], "FFMPEG_NOT_AVAILABLE");
  }

  async probeDuration(input: string) {
    const probe = await runProcess(this.ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "json", input], "ASR_AUDIO_EXTRACTION_FAILED");
    const durationSeconds = Number((JSON.parse(probe) as { format?: { duration?: string } }).format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "无法读取音频时长。");
    return Math.round(durationSeconds * 1_000);
  }

  async extractAudio(input: string, options: ExtractAudioOptions = {}) {
    const directory = await mkdtemp(join(tmpdir(), "content-center-asr-"));
    const outputPath = join(directory, "audio.mp3");
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try {
      await runProcess(this.ffmpegPath, [
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-i", input,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "libmp3lame",
        "-b:a", "64k",
        "-y",
        outputPath,
      ], "ASR_AUDIO_EXTRACTION_FAILED");
      const probe = await runProcess(this.ffprobePath, [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        outputPath,
      ], "ASR_AUDIO_EXTRACTION_FAILED");
      const durationSeconds = Number((JSON.parse(probe) as { format?: { duration?: string } }).format?.duration);
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
        throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "无法读取提取音频的时长。");
      }
      const file = await stat(outputPath);
      const result = { path: outputPath, sizeBytes: file.size, durationMs: Math.round(durationSeconds * 1_000), cleanup };
      if ((options.limits ?? "DOUBAO_FLASH") === "DOUBAO_FLASH") assertFlashAudioLimits(result);
      return result;
    } catch (error) {
      await cleanup();
      if (error instanceof MediaProcessorError) throw error;
      throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "音频提取失败。");
    }
  }
}
