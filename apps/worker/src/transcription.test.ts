import { describe, expect, it } from "vitest";
import { transcriptionUsageOperation } from "./transcription";

describe("transcription usage operation", () => {
  it("keeps recording file failures separate from flash", () => {
    expect(transcriptionUsageOperation("DOUBAO_ASR", "RECORDING_FILE_2_0")).toBe("TRANSCRIBE_RECORDING_FILE_2_0");
    expect(transcriptionUsageOperation("DOUBAO_ASR", "FLASH")).toBe("TRANSCRIBE_FLASH");
  });

  it("preserves local operation", () => {
    expect(transcriptionUsageOperation("LOCAL_FUNASR", "RECORDING_FILE_2_0")).toBe("TRANSCRIBE_LOCAL");
  });
});
