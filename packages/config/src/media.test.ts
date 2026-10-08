import { describe, expect, it } from "vitest";
import { DEFAULT_ASR_AUDIO_RETENTION_HOURS, readAsrAudioRetentionHours } from "./media";

describe("ASR audio retention", () => {
  it("defaults to a short 24-hour retention window", () => {
    expect(readAsrAudioRetentionHours({})).toBe(DEFAULT_ASR_AUDIO_RETENTION_HOURS);
  });

  it("accepts an explicit non-negative hour value and rejects invalid values", () => {
    expect(readAsrAudioRetentionHours({ ASR_AUDIO_RETENTION_HOURS: "0" })).toBe(0);
    expect(readAsrAudioRetentionHours({ ASR_AUDIO_RETENTION_HOURS: "48" })).toBe(48);
    expect(() => readAsrAudioRetentionHours({ ASR_AUDIO_RETENTION_HOURS: "-1" })).toThrow("INVALID_ASR_AUDIO_RETENTION_HOURS");
    expect(() => readAsrAudioRetentionHours({ ASR_AUDIO_RETENTION_HOURS: "not-a-number" })).toThrow("INVALID_ASR_AUDIO_RETENTION_HOURS");
  });
});
