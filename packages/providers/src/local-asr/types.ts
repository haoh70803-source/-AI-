export const TRANSCRIPTION_QUALITY_MODES = ["FAST", "BALANCED", "QUALITY"] as const;
export type TranscriptionQualityMode = (typeof TRANSCRIPTION_QUALITY_MODES)[number];

export const LOCAL_ASR_MODELS = ["SENSEVOICE_SMALL", "PARAFORMER_ZH", "FUN_ASR_NANO"] as const;
export type LocalAsrModel = (typeof LOCAL_ASR_MODELS)[number];
export type LocalAsrDevice = "CPU" | "CUDA";

export type LocalAsrHardwareCapabilities = {
  classification: "CPU_ONLY" | "NVIDIA_CUDA_AVAILABLE" | "UNKNOWN_GPU";
  cudaAvailable: boolean;
  vramTotalMb?: number | null;
  vramFreeMb?: number | null;
};

export type LocalAsrInstalledModel = {
  key: LocalAsrModel;
  label: string;
  modelId: string;
  installed: boolean;
  loaded: boolean;
  loadedDevices: string[];
  supported: boolean;
  unavailableReason?: string | null;
};

export type BenchmarkSelection = {
  model: LocalAsrModel;
  device: LocalAsrDevice;
  reason: string;
};

export type LocalAsrBenchmarkProfile = {
  generatedAt: string;
  machine: Record<string, unknown>;
  benchmark: Record<string, unknown>;
  FAST: BenchmarkSelection;
  BALANCED: BenchmarkSelection;
  QUALITY: BenchmarkSelection;
};

export type ResolvedTranscriptionQuality = {
  resolvedProvider: "LOCAL_FUNASR";
  resolvedModel: LocalAsrModel;
  resolvedDevice: LocalAsrDevice;
};

