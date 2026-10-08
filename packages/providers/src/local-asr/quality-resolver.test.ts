import { describe, expect, it } from "vitest";
import { LocalAsrError } from "./errors";
import { TranscriptionQualityResolver } from "./quality-resolver";
import type { LocalAsrBenchmarkProfile, LocalAsrInstalledModel } from "./types";

const profile: LocalAsrBenchmarkProfile = {
  generatedAt: "2026-09-02T00:00:00.000Z",
  machine: {},
  benchmark: {},
  FAST: { model: "SENSEVOICE_SMALL", device: "CPU", reason: "measured" },
  BALANCED: { model: "PARAFORMER_ZH", device: "CPU", reason: "measured" },
  QUALITY: { model: "FUN_ASR_NANO", device: "CUDA", reason: "measured" },
};

const models: LocalAsrInstalledModel[] = [
  { key: "SENSEVOICE_SMALL", label: "SenseVoiceSmall", modelId: "sense", installed: true, loaded: false, loadedDevices: [], supported: true },
  { key: "PARAFORMER_ZH", label: "Paraformer", modelId: "para", installed: true, loaded: false, loadedDevices: [], supported: true },
  { key: "FUN_ASR_NANO", label: "Fun-ASR-Nano", modelId: "nano", installed: true, loaded: false, loadedDevices: [], supported: true },
];

describe("TranscriptionQualityResolver", () => {
  it("resolves from the measured profile instead of hard-coded UI mapping", () => {
    expect(new TranscriptionQualityResolver().resolve({
      qualityMode: "BALANCED",
      hardwareCapabilities: { classification: "CPU_ONLY", cudaAvailable: false },
      installedModels: models,
      benchmarkProfile: profile,
    })).toEqual({ resolvedProvider: "LOCAL_FUNASR", resolvedModel: "PARAFORMER_ZH", resolvedDevice: "CPU" });
  });

  it("returns a product-level unsupported-hardware error for quality mode", () => {
    expect(() => new TranscriptionQualityResolver().resolve({
      qualityMode: "QUALITY",
      hardwareCapabilities: { classification: "CPU_ONLY", cudaAvailable: false },
      installedModels: models,
      benchmarkProfile: profile,
    })).toThrow(expect.objectContaining<Partial<LocalAsrError>>({
      code: "LOCAL_ASR_UNSUPPORTED_HARDWARE",
      message: "当前设备暂不支持质量优先模式，建议使用均衡模式。",
    }));
  });
});

