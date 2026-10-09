import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { db } from "@content-center/db";
import { DoubaoError, LocalAsrError, FFmpegMediaProcessor, MediaProcessorError } from "@content-center/providers";
import { prepareVoiceTranscription } from "@content-center/worker/transcription";
import { executionLock } from "@content-center/worker/job-recovery";
import { ExperienceLimitError } from "@content-center/worker/experience-limits";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { readUploadFormData } from "@/server/source-upload";

export const runtime = "nodejs";
export const maxDuration = 240;
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try { await prepareVoiceTranscription(context.workspace.id); return NextResponse.json({ available: true }); }
  catch (error) { return apiError("VOICE_UNAVAILABLE", 409, error instanceof DoubaoError || error instanceof LocalAsrError ? error.message : "语音识别服务暂时不可用，请稍后重试。"); }
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    return await db.$transaction(async tx => {
      if (!await executionLock(tx, context.workspace.id, `voice:${context.session.user.id}`)) return apiError("VOICE_BUSY", 409, "上一段语音仍在识别，请稍后再试。");
      const transcribe = await prepareVoiceTranscription(context.workspace.id, request.signal);
      const form = await readUploadFormData(request, MAX_BYTES + 64 * 1024, 20_000);
      const audio = form.get("audio");
      if (!(audio instanceof File) || !audio.size || audio.size > MAX_BYTES) return apiError("INVALID_AUDIO", 400, "录音为空或超过 5MB，请重新录音。");
      const mime = audio.type.split(";")[0] ?? "";
      if (!["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"].includes(mime)) return apiError("INVALID_AUDIO", 400, "录音格式不支持，请更换浏览器重试。");
      const bytes = new Uint8Array(await audio.arrayBuffer());
      // Never allow a supplied playlist or URL to become FFmpeg network input.
      if (bytes.length < 12) return apiError("INVALID_AUDIO", 400, "录音过短，请重新录音。");
      const head = Buffer.from(bytes.subarray(0, 12));
      const signature = head.readUInt32BE(0);
      const container = signature === 0x1a45dfa3 || head.toString("ascii", 0, 4) === "OggS" || head.toString("ascii", 4, 8) === "ftyp" || head.toString("ascii", 0, 4) === "RIFF" || head.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
      if (!container) return apiError("INVALID_AUDIO", 400, "无法读取录音，请重新录音。");
      const directory = await mkdtemp(join(tmpdir(), "content-center-voice-"));
      try {
        request.signal.throwIfAborted();
        const path = join(directory, "recording");
        await writeFile(path, bytes);
        const processor = new FFmpegMediaProcessor({ timeoutMs: 20_000 });
        // Browser WebM recordings may omit duration; enforce the limit after decoding too.
        const extracted = await processor.extractAudio(path, { limits: "NONE", maxDurationMs: 61_000, localOnly: true });
        try {
          if (extracted.durationMs > 60_500) return apiError("AUDIO_TOO_LONG", 400, "每次最多录音 60 秒，请分段输入。");
          request.signal.throwIfAborted();
          const text = await transcribe({ audio: { mode: "BINARY_DATA", data: await readFile(extracted.path) }, contentType: "audio/mpeg" }, context.session.user.id, extracted.durationMs);
          if (!text) return apiError("EMPTY_TRANSCRIPT", 422, "没有识别到人声，请靠近麦克风重新录音。");
          return NextResponse.json({ text });
        } finally { await extracted.cleanup(); }
      } finally { await rm(directory, { recursive: true, force: true }); }
    }, { timeout: 200_000, maxWait: 5_000 });
  } catch (error) {
    if (error instanceof ExperienceLimitError) return apiError(error.code, 429, error.message);
    if (error instanceof DoubaoError || error instanceof LocalAsrError || error instanceof MediaProcessorError) return apiError(error.code, error.code.endsWith("TIMEOUT") ? 408 : 409, error.code.endsWith("TIMEOUT") ? "语音识别超时，已停止等待，请重新录音或重试。" : error.message);
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return apiError("VOICE_TIMEOUT", 408, "语音识别超时，请重试。");
    return apiError("VOICE_INPUT_FAILED", 400, "语音输入失败，请重新录音或稍后重试。");
  }
}
