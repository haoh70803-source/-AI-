import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { DoubaoError, LocalAsrError, MediaProcessorError, type TranscriptResult } from "@content-center/providers";

export const TRANSCRIPTION_CHUNK_MS = 3 * 60_000;
const OVERLAP_MS = 1000;
export type AudioChunk = { index: number; startMs: number; endMs: number };
export type ChunkCheckpoint = { version: 1; key: string; chunks: Record<string, TranscriptResult> };
export type ChunkProgress = { total: number; completed: number; active: number[]; retrying: number[] };

export class TranscriptionChunkError extends Error {
  readonly retryable = false;
  constructor(readonly code: string, readonly completed: number, readonly total: number) {
    super(`转写未完成（已保存 ${completed}/${total} 段）。重试会继续未完成的片段。`);
  }
}

export function audioChunks(durationMs: number): AudioChunk[] {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new MediaProcessorError("ASR_AUDIO_EXTRACTION_FAILED", "音频时长无效。");
  // A finite job budget; no silent truncation or unbounded checkpoint allocation.
  if (durationMs > 6 * 60 * 60_000) throw new MediaProcessorError("ASR_AUDIO_TOO_LONG", "当前分片转写最多支持 6 小时音频，请按章节上传。");
  return Array.from({ length: Math.ceil(durationMs / TRANSCRIPTION_CHUNK_MS) }, (_, index) => ({
    index, startMs: Math.max(0, index * TRANSCRIPTION_CHUNK_MS - (index ? OVERLAP_MS : 0)),
    endMs: Math.min(durationMs, (index + 1) * TRANSCRIPTION_CHUNK_MS),
  }));
}

export function checkpointKey(input: { workspaceId: string; sourceItemId: string; audioAssetId: string; durationMs: number; sizeBytes: number; route: unknown }) {
  return createHash("sha256").update(JSON.stringify({ ...input, chunkMs: TRANSCRIPTION_CHUNK_MS, overlapMs: OVERLAP_MS, version: 1 })).digest("hex");
}

function validTranscript(value: unknown, durationMs: number): value is TranscriptResult {
  if (!value || typeof value !== "object") return false;
  const row = value as TranscriptResult;
  return typeof row.fullText === "string" && row.fullText.length <= 100_000 && Array.isArray(row.segments) && row.segments.length <= 10_000 && row.segments.every(segment =>
    typeof segment.text === "string" && Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) &&
    segment.startMs >= 0 && segment.endMs > segment.startMs && segment.endMs <= durationMs + 1500);
}

function canonicalText(text: string) { return text.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase(); }

export function readChunkCheckpoint(value: unknown, key: string, chunks: AudioChunk[]): ChunkCheckpoint {
  const empty: ChunkCheckpoint = { version: 1, key, chunks: {} };
  if (!value || typeof value !== "object") return empty;
  const row = value as ChunkCheckpoint;
  if (row.version !== 1 || row.key !== key || !row.chunks || typeof row.chunks !== "object" || Array.isArray(row.chunks)) return empty;
  for (const chunk of chunks) {
    const result = row.chunks[String(chunk.index)];
    if (validTranscript(result, chunk.endMs - chunk.startMs) && (!result.segments.length || canonicalText(result.fullText) === canonicalText(result.segments.map(segment => segment.text).join("")))) empty.chunks[String(chunk.index)] = result;
  }
  return empty;
}

function joinOverlappingText(left: string, right: string) {
  if (left === right) return left;
  for (let size = Math.min(left.length, right.length); size >= 2; size--) {
    if (left.slice(-size) === right.slice(0, size)) return left + right.slice(size);
  }
  return null;
}

export function mergeChunkTranscripts(chunks: AudioChunk[], checkpoint: ChunkCheckpoint, durationMs: number): TranscriptResult {
  if (chunks.some(chunk => !checkpoint.chunks[String(chunk.index)])) throw new TranscriptionChunkError("ASR_INCOMPLETE_TRANSCRIPT", Object.keys(checkpoint.chunks).length, chunks.length);
  const segments: TranscriptResult["segments"] = [];
  const texts: string[] = [];
  let language: string | undefined;
  for (const chunk of chunks) {
    const result = checkpoint.chunks[String(chunk.index)]!;
    language ??= result.language;
    if (result.fullText.trim() && !result.segments.length) {
      // Preserve the text, but never fabricate timestamps for an untimed local model.
      texts.push(result.fullText.trim());
    } else {
      for (const segment of result.segments) {
        if (!segment.text.trim()) continue;
        const next = { startMs: chunk.startMs + segment.startMs, endMs: Math.min(chunk.endMs, chunk.startMs + segment.endMs), text: segment.text.trim() };
        if (next.startMs >= next.endMs) throw new TranscriptionChunkError("ASR_INVALID_TIMESTAMPS", Object.keys(checkpoint.chunks).length, chunks.length);
        const previous = segments.at(-1);
        // Deduplicate only where the original time ranges actually overlap.
        const joined = previous && next.startMs < previous.endMs ? joinOverlappingText(previous.text, next.text) : null;
        if (previous && joined !== null) { previous.text = joined; previous.endMs = Math.max(previous.endMs, next.endMs); }
        else segments.push(next);
      }
      texts.push(result.segments.map(segment => segment.text.trim()).filter(Boolean).join(""));
    }
  }
  segments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const allTimed = chunks.every(chunk => !checkpoint.chunks[String(chunk.index)]!.fullText.trim() || checkpoint.chunks[String(chunk.index)]!.segments.length > 0);
  const fullText = (allTimed ? segments.map(segment => segment.text).join("") : texts.join("\n")).trim();
  if (!fullText) throw new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "音频中没有可转写的人声。", false);
  return { fullText, segments, durationMs, language };
}

// Shared within this worker process: multiple material jobs cannot each open two cloud connections.
let activeCalls = 0;
const waiting: Array<() => void> = [];
async function limited<T>(operation: () => Promise<T>) {
  if (activeCalls >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else activeCalls++;
  try { return await operation(); }
  finally { const next = waiting.shift(); if (next) next(); else activeCalls--; }
}

export async function transcribeChunks(input: {
  durationMs: number; checkpoint: ChunkCheckpoint; concurrency: 1 | 2;
  recognize: (chunk: AudioChunk) => Promise<TranscriptResult>;
  persist: (checkpoint: ChunkCheckpoint, progress: ChunkProgress) => Promise<void>;
  wait?: (ms: number) => Promise<unknown>;
}) {
  const chunks = audioChunks(input.durationMs);
  const pending = chunks.filter(chunk => !input.checkpoint.chunks[String(chunk.index)]);
  const attempts = new Map<number, number>();
  let concurrency = input.concurrency;
  const progress = (active: number[] = [], retrying: number[] = []): ChunkProgress => ({ total: chunks.length, completed: Object.keys(input.checkpoint.chunks).length, active, retrying });
  await input.persist(input.checkpoint, progress());
  while (pending.length) {
    const batch = pending.splice(0, concurrency);
    await input.persist(input.checkpoint, progress(batch.map(chunk => chunk.index), batch.filter(chunk => attempts.has(chunk.index)).map(chunk => chunk.index)));
    // Each completed result is persisted immediately, even if its peer is slow or fails.
    let writes = Promise.resolve();
    const outcomes = await Promise.allSettled(batch.map(chunk => limited(async () => {
      attempts.set(chunk.index, (attempts.get(chunk.index) ?? 0) + 1);
      let result: TranscriptResult;
      try { result = await input.recognize(chunk); }
      catch (error) {
        if (!(error instanceof DoubaoError && error.code === "DOUBAO_EMPTY_TRANSCRIPT")) throw error;
        result = { fullText: "", segments: [] }; // A successful silent range, not a missing range.
      }
      if (!validTranscript(result, chunk.endMs - chunk.startMs)) throw new TranscriptionChunkError("ASR_INVALID_TIMESTAMPS", progress().completed, chunks.length);
      if (result.segments.length && canonicalText(result.fullText) !== canonicalText(result.segments.map(segment => segment.text).join(""))) {
        throw new TranscriptionChunkError("ASR_INCOMPLETE_TRANSCRIPT", progress().completed, chunks.length);
      }
      writes = writes.then(async () => {
        input.checkpoint.chunks[String(chunk.index)] = result;
        await input.persist(input.checkpoint, progress(batch.filter(row => !input.checkpoint.chunks[String(row.index)]).map(row => row.index)));
      });
      await writes;
    })));
    let fatal: unknown;
    outcomes.forEach((outcome, index) => {
      if (outcome.status !== "rejected") return;
      const error: unknown = outcome.reason;
      if ((error instanceof DoubaoError || error instanceof LocalAsrError) && error.retryable && attempts.get(batch[index]!.index)! < 3) {
        if (error.code === "DOUBAO_RATE_LIMITED") concurrency = 1;
        pending.unshift(batch[index]!);
      } else fatal ??= error;
    });
    await input.persist(input.checkpoint, progress());
    if (fatal) {
      if (fatal instanceof MediaProcessorError) throw fatal;
      if (!(fatal instanceof DoubaoError || fatal instanceof LocalAsrError || fatal instanceof TranscriptionChunkError)) throw fatal;
      throw new TranscriptionChunkError(fatal.code, progress().completed, chunks.length);
    }
    if (pending.some(chunk => attempts.has(chunk.index))) await (input.wait ?? sleep)(2000);
  }
  return mergeChunkTranscripts(chunks, input.checkpoint, input.durationMs);
}
