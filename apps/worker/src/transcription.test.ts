import { describe, expect, it } from "vitest";
import { offlineTranscriptionTimeout, transcriptionUsageOperation } from "./transcription";

describe("transcription usage operation", () => {
  it("keeps recording file failures separate from flash", () => {
    expect(transcriptionUsageOperation("DOUBAO_ASR", "RECORDING_FILE_2_0")).toBe("TRANSCRIBE_RECORDING_FILE_2_0");
    expect(transcriptionUsageOperation("DOUBAO_ASR", "FLASH")).toBe("TRANSCRIBE_FLASH");
  });

  it("preserves local operation", () => {
    expect(transcriptionUsageOperation("LOCAL_FUNASR", "RECORDING_FILE_2_0")).toBe("TRANSCRIBE_LOCAL");
  });
});

it("uses bounded duration-aware deadlines instead of timing out an 11-minute stream at 8 minutes", () => {
  expect(offlineTranscriptionTimeout("STREAMING_2_0", 673_961)).toBeGreaterThan(673_961);
  expect(offlineTranscriptionTimeout("FLASH", 1000)).toBe(120_000);
  expect(offlineTranscriptionTimeout("FLASH", 7_200_000)).toBe(20 * 60_000);
});
