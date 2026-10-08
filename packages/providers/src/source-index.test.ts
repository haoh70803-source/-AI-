import { describe, expect, it } from "vitest";
import { buildTranscriptSourceIndex } from "./source-index";

describe("transcript source index", () => {
  it("indexes real segments as S refs and preserves provenance", () => {
    const index = buildTranscriptSourceIndex({
      id: "transcript-1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      fullText: "第一段。第二段。",
      segments: [
        { startMs: 1_000, endMs: 2_000, text: "第一段。" },
        { startMs: 2_000, endMs: 3_000, text: "第二段。" },
      ],
    });

    expect(index.refs).toEqual([
      expect.objectContaining({ ref: "S001", transcriptId: "transcript-1", transcriptVersion: "2026-09-08T00:00:00.000Z", sourceIndexVersion: "source-index-v1", kind: "REAL_SEGMENT", index: 0, text: "第一段。", startMs: 1_000, endMs: 2_000 }),
      expect.objectContaining({ ref: "S002", kind: "REAL_SEGMENT", index: 1, text: "第二段。", startMs: 2_000, endMs: 3_000 }),
    ]);
  });

  it("creates deterministic text blocks for fullText-only transcripts", () => {
    const input = { id: "transcript-2", version: 3, fullText: "第一段。\n\n第二段？第三段！", segments: [] };
    const first = buildTranscriptSourceIndex(input);
    const second = buildTranscriptSourceIndex(input);

    expect(first).toEqual(second);
    expect(first.refs.every((ref) => ref.kind === "TEXT_BLOCK" && ref.ref.startsWith("T"))).toBe(true);
    expect(first.refs.every((ref) => first.refs[0] && input.fullText.slice(ref.startOffset!, ref.endOffset!) === ref.text)).toBe(true);
    expect(first.refs.every((ref) => ref.startMs === undefined && ref.endMs === undefined)).toBe(true);
  });

  it("uses a bounded deterministic fallback for an extremely long sentence", () => {
    const fullText = "长".repeat(1_000);
    const index = buildTranscriptSourceIndex({ id: "transcript-3", version: 1, fullText, segments: [] });

    expect(index.refs.length).toBeGreaterThan(1);
    expect(index.refs.map((ref) => ref.text).join("")).toBe(fullText);
    expect(index.refs.every((ref) => ref.text.length <= 480)).toBe(true);
  });

  it("never exceeds the block limit when a short sentence precedes a long one", () => {
    const fullText = `短句。${"长".repeat(480)}`;
    const index = buildTranscriptSourceIndex({ id: "transcript-limit", version: 1, fullText, segments: [] });
    expect(index.refs.every((ref) => ref.text.length <= 480)).toBe(true);
    expect(index.refs.map((ref) => ref.text).join("")).toBe(fullText);
  });

  it("creates a new deterministic index for a new transcript version without changing the old index", () => {
    const oldIndex = buildTranscriptSourceIndex({ id: "transcript-versioned", version: "v1", fullText: "旧版本原文。", segments: [] });
    const newIndex = buildTranscriptSourceIndex({ id: "transcript-versioned", version: "v2", fullText: "新版本原文。增加内容。", segments: [] });
    expect(oldIndex.refs[0]).toMatchObject({ ref: "T001", transcriptVersion: "v1", text: "旧版本原文。" });
    expect(newIndex.refs[0]).toMatchObject({ ref: "T001", transcriptVersion: "v2", text: "新版本原文。增加内容。" });
    expect(oldIndex.refs[0]?.text).toBe("旧版本原文。");
  });

  it("prefers real segments over the text-block fallback", () => {
    const index = buildTranscriptSourceIndex({ id: "transcript-4", version: 1, fullText: "真实段。其他全文。", segments: [{ text: "真实段。" }] });
    expect(index.refs.map((ref) => ref.ref)).toEqual(["S001"]);
    expect(index.refs[0]?.kind).toBe("REAL_SEGMENT");
  });
});
