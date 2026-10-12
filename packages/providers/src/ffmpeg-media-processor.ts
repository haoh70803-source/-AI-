import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ASR_FLASH_BYTES, MAX_ASR_FLASH_DURATION_MS } from "@content-center/config";

export type MediaProcessorErrorCode =
  | "ASR_PROCESS_TIMEOUT"
  | "FFMPEG_NOT_AVAILABLE"
  | "VIDEO_TRACK_MISSING"
  | "VIDEO_PREVIEW_FAILED"
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

type ProcessorOptions = { ffmpegPath?: string; ffprobePath?: string; timeoutMs?: number };
type ExtractAudioOptions = { limits?: "DOUBAO_FLASH" | "NONE"; startMs?: number; maxDurationMs?: number; localOnly?: boolean };

async function runProcess(command: string, args: string[], failureCode: MediaProcessorErrorCode, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    timer.unref();
    const stdout: Buffer[] = [];
    let stderrBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new MediaProcessorError(
        error.code === "ENOENT" ? "FFMPEG_NOT_AVAILABLE" : failureCode,
        error.code === "ENOENT" ? "ffmpeg/ffprobe 未安装或不在 PATH。" : "音频处理进程无法启动。",
      ));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) { reject(new MediaProcessorError("ASR_PROCESS_TIMEOUT", "音频处理超时，进程已停止，请重试或重新上传。")); return; }
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new MediaProcessorError(failureCode, `音频处理失败（exit ${code ?? "unknown"}，stderr ${stderrBytes} bytes）。`));
    });
  });
}

export class FFmpegMediaProcessor {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly timeoutMs: number;

  constructor(options: ProcessorOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? process.env.FFPROBE_PATH ?? "ffprobe";
  }

  async checkAvailability() {
    await runProcess(this.ffmpegPath, ["-version"], "FFMPEG_NOT_AVAILABLE", Math.min(this.timeoutMs, 10_000));
    await runProcess(this.ffprobePath, ["-version"], "FFMPEG_NOT_AVAILABLE", Math.min(this.timeoutMs, 10_000));
  }

  async probeDuration(input: string) {
    const probe = await runProcess(this.ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "json", input], "ASR_AUDIO_EXTRACTION_FAILED", Math.min(this.timeoutMs, 30_000));
    const durationSeconds = Number((JSON.parse(probe) as { format?: { duration?: string } }).format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "无法读取音频时长。");
    return Math.round(durationSeconds * 1_000);
  }

  async probeVideo(input: string) {
    const raw = await runProcess(this.ffprobePath, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height:format=format_name,duration", "-of", "json", input], "VIDEO_PREVIEW_FAILED", Math.min(this.timeoutMs, 30_000));
    const result = JSON.parse(raw) as { streams?: Array<{ codec_type?: string; codec_name?: string; pix_fmt?: string; width?: number; height?: number }>; format?: { format_name?: string; duration?: string } };
    const video = result.streams?.find(stream => stream.codec_type === "video" && (stream.width ?? 0) > 0 && (stream.height ?? 0) > 0);
    if (!video) throw new MediaProcessorError("VIDEO_TRACK_MISSING", "下载的文件没有有效画面轨道，请重新获取原视频；不能用转写音频替代视频。");
    const durationMs = Math.round(Number(result.format?.duration) * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new MediaProcessorError("VIDEO_PREVIEW_FAILED", "无法读取原视频时长。");
    const audio = result.streams?.find(stream => stream.codec_type === "audio");
    return { codec: video.codec_name ?? "unknown", width: video.width!, height: video.height!, durationMs, browserCompatible: video.codec_name === "h264" && video.pix_fmt === "yuv420p" && Boolean(result.format?.format_name?.includes("mp4")) && (!audio || audio.codec_name === "aac") };
  }

  /** Produce a separate derivative. Never overwrite the original or the ASR audio. */
  async createVideoPreview(input: string, durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 6 * 60 * 60_000) throw new MediaProcessorError("VIDEO_PREVIEW_FAILED", "视频时长无效或超过当前六小时预览范围，请裁剪后重试。");
    const directory = await mkdtemp(join(tmpdir(), "content-center-video-preview-"));
    const outputPath = join(directory, "preview.mp4");
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try {
      await runProcess(this.ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "2", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-r", "30", "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", outputPath], "VIDEO_PREVIEW_FAILED", Math.min(60 * 60_000, Math.max(120_000, durationMs + 60_000)));
      const probe = await this.probeVideo(outputPath);
      if (!probe.browserCompatible || Math.abs(probe.durationMs - durationMs) > 1000) throw new MediaProcessorError("VIDEO_PREVIEW_FAILED", "视频预览画面或时长校验失败，请重试。");
      return { path: outputPath, sizeBytes: (await stat(outputPath)).size, probe, cleanup };
    } catch (error) { await cleanup(); throw error; }
  }

  async extractAudio(input: string, options: ExtractAudioOptions = {}) {
    if ((options.startMs !== undefined && (!Number.isFinite(options.startMs) || options.startMs < 0)) ||
      (options.maxDurationMs !== undefined && (!Number.isFinite(options.maxDurationMs) || options.maxDurationMs <= 0))) {
      throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "音频切片范围无效。");
    }
    const directory = await mkdtemp(join(tmpdir(), "content-center-asr-"));
    const outputPath = join(directory, "audio.mp3");
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try {
      await runProcess(this.ffmpegPath, [
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        ...(options.localOnly ? ["-protocol_whitelist", "file,pipe"] : []),
        ...(options.startMs ? ["-ss", String(options.startMs / 1000)] : []),
        "-i", input,
        ...(options.maxDurationMs ? ["-t", String(options.maxDurationMs / 1000)] : []),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "libmp3lame",
        "-b:a", "64k",
        "-y",
        outputPath,
      ], "ASR_AUDIO_EXTRACTION_FAILED", this.timeoutMs);
      const probe = await runProcess(this.ffprobePath, [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        outputPath,
      ], "ASR_AUDIO_EXTRACTION_FAILED", this.timeoutMs);
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
