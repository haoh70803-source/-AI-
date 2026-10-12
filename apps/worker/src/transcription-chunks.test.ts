import { describe, expect, it, vi } from "vitest";
import { DoubaoError, type TranscriptResult } from "@content-center/providers";
import { audioChunks, checkpointKey, readChunkCheckpoint, transcribeChunks, type AudioChunk, type ChunkCheckpoint } from "./transcription-chunks";

const durationMs = 400_000;
const key = "fixture-checkpoint";
const fresh = (): ChunkCheckpoint => ({ version: 1, key, chunks: {} });
const text = (chunk: AudioChunk): TranscriptResult => ({ fullText: `片段${chunk.index}`, segments: [{ startMs: 100, endMs: 1000, text: `片段${chunk.index}` }] });
const wait = async () => {};

describe("long material transcription", () => {
  it("bounds chunks, retains original offsets and covers the tail without truncation", async () => {
    const chunks = audioChunks(673_961);
    expect(chunks).toEqual([{ index: 0, startMs: 0, endMs: 180_000 }, { index: 1, startMs: 179_000, endMs: 360_000 }, { index: 2, startMs: 359_000, endMs: 540_000 }, { index: 3, startMs: 539_000, endMs: 673_961 }]);
    const result = await transcribeChunks({ durationMs: 673_961, checkpoint: fresh(), concurrency: 2, recognize: async chunk => text(chunk), persist: async () => {}, wait });
    expect(result.durationMs).toBe(673_961);
    expect(result.segments.map(segment => segment.startMs)).toEqual([100, 179_100, 359_100, 539_100]);
  });

  it("saves successful chunks immediately, fails without publishing partial text, and resumes only missing chunks", async () => {
    const saved = fresh();
    const calls: number[] = [];
    const recognize = async (chunk: AudioChunk) => { calls.push(chunk.index); if (chunk.index === 1) throw new DoubaoError("DOUBAO_TIMEOUT", "timeout", true); return text(chunk); };
    await expect(transcribeChunks({ durationMs, checkpoint: saved, concurrency: 2, recognize, persist: async () => {}, wait })).rejects.toMatchObject({ code: "DOUBAO_TIMEOUT", completed: 2, total: 3 });
    expect(saved.chunks["0"]).toBeDefined();
    expect(calls.filter(index => index === 0)).toHaveLength(1);
    expect(calls.filter(index => index === 1)).toHaveLength(3);
    const resumed = readChunkCheckpoint(JSON.parse(JSON.stringify(saved)), key, audioChunks(durationMs));
    const missing: number[] = [];
    const result = await transcribeChunks({ durationMs, checkpoint: resumed, concurrency: 2, recognize: async chunk => { missing.push(chunk.index); return text(chunk); }, persist: async () => {}, wait });
    expect(missing).not.toContain(0);
    expect(result.fullText).toBe("片段0片段1片段2");
  });

  it("downgrades to one request after a rate limit and never retries authorization failures", async () => {
    let rateLimited = false;
    const batches: number[][] = [];
    await transcribeChunks({ durationMs, checkpoint: fresh(), concurrency: 2, wait,
      recognize: async chunk => { if (chunk.index === 1 && !rateLimited) { rateLimited = true; throw new DoubaoError("DOUBAO_RATE_LIMITED", "limit", true); } return text(chunk); },
      persist: async (_saved, progress) => { if (progress.active.length) batches.push([...progress.active]); },
    });
    expect(batches[0]).toEqual([0, 1]);
    expect(batches.slice(2).every(batch => batch.length <= 1)).toBe(true);
    const denied = vi.fn(async () => { throw new DoubaoError("DOUBAO_PERMISSION_DENIED", "denied", false); });
    await expect(transcribeChunks({ durationMs, checkpoint: fresh(), concurrency: 1, recognize: denied, persist: async () => {}, wait })).rejects.toMatchObject({ code: "DOUBAO_PERMISSION_DENIED" });
    expect(denied).toHaveBeenCalledOnce();
  });

  it("deduplicates overlapping evidence while retaining repeated sentences elsewhere", async () => {
    const saved = fresh();
    saved.chunks["0"] = { fullText: "边界原文", segments: [{ startMs: 179_000, endMs: 180_000, text: "边界原文" }] };
    saved.chunks["1"] = { fullText: "边界原文边界原文", segments: [{ startMs: 0, endMs: 2000, text: "边界原文" }, { startMs: 5000, endMs: 6000, text: "边界原文" }] };
    const result = await transcribeChunks({ durationMs: 200_000, checkpoint: saved, concurrency: 2, recognize: async chunk => text(chunk), persist: async () => {}, wait });
    expect(result.segments).toEqual([{ startMs: 179_000, endMs: 181_000, text: "边界原文" }, { startMs: 184_000, endMs: 185_000, text: "边界原文" }]);
  });

  it("rejects foreign, changed or malformed checkpoints", () => {
    const input = { workspaceId: "a", sourceItemId: "source", audioAssetId: "audio", durationMs, sizeBytes: 1000, route: ["FLASH"] };
    const first = checkpointKey(input);
    expect(checkpointKey({ ...input, workspaceId: "b" })).not.toBe(first);
    expect(checkpointKey({ ...input, audioAssetId: "different" })).not.toBe(first);
    expect(checkpointKey({ ...input, route: ["STREAMING_2_0"] })).not.toBe(first);
    expect(readChunkCheckpoint({ ...fresh(), key: "other", chunks: { 0: text(audioChunks(durationMs)[0]!) } }, key, audioChunks(durationMs)).chunks).toEqual({});
    expect(readChunkCheckpoint({ ...fresh(), chunks: { 0: { fullText: "文字", segments: [{ startMs: 0, endMs: 900_000, text: "文字" }] } } }, key, audioChunks(durationMs)).chunks).toEqual({});
  });

  it("does not invent timestamps for untimed models or accept incomplete timed text", async () => {
    const result = await transcribeChunks({ durationMs: 1000, checkpoint: fresh(), concurrency: 1, recognize: async () => ({ fullText: "本地文字", segments: [] }), persist: async () => {}, wait });
    expect(result.segments).toEqual([]);
    expect(result.fullText).toBe("本地文字");
    await expect(transcribeChunks({ durationMs: 1000, checkpoint: fresh(), concurrency: 1, recognize: async () => ({ fullText: "完整文字", segments: [{ startMs: 0, endMs: 900, text: "文字" }] }), persist: async () => {}, wait })).rejects.toMatchObject({ code: "ASR_INCOMPLETE_TRANSCRIPT" });
  });

  it("accepts identified silent ranges but rejects an entirely silent recording", async () => {
    const result = await transcribeChunks({ durationMs: 200_000, checkpoint: fresh(), concurrency: 2, recognize: async chunk => { if (chunk.index) throw new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "silent", false); return text(chunk); }, persist: async () => {}, wait });
    expect(result.fullText).toBe("片段0");
    await expect(transcribeChunks({ durationMs: 1000, checkpoint: fresh(), concurrency: 1, recognize: async () => { throw new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "silent", false); }, persist: async () => {}, wait })).rejects.toMatchObject({ code: "DOUBAO_EMPTY_TRANSCRIPT" });
  });
});
