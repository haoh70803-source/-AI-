import { describe, expect, it } from "vitest";
import { successfulTranscriptionDurationMs } from "../lib/transcription-usage";

describe("transcription usage totals", () => {
  it("counts only successful ASR durations while retaining failed rows for callers", () => {
    expect(successfulTranscriptionDurationMs([
      { success: true, metadata: { durationMs: 60_000 } },
      { success: false, metadata: { durationMs: 180_000 } },
    ])).toBe(60_000);
  });
});
