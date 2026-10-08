import { LocalAsrError } from "./errors";
import type {
  LocalAsrBenchmarkProfile,
  LocalAsrHardwareCapabilities,
  LocalAsrInstalledModel,
  ResolvedTranscriptionQuality,
  TranscriptionQualityMode,
} from "./types";

export type TranscriptionQualityResolverInput = {
  qualityMode: TranscriptionQualityMode;
  hardwareCapabilities: LocalAsrHardwareCapabilities;
  installedModels: LocalAsrInstalledModel[];
  benchmarkProfile: LocalAsrBenchmarkProfile;
};

export class TranscriptionQualityResolver {
  resolve(input: TranscriptionQualityResolverInput): ResolvedTranscriptionQuality {
    const selection = input.benchmarkProfile[input.qualityMode];
    const model = input.installedModels.find((candidate) => candidate.key === selection.model);
    if (!model?.installed) {
      throw new LocalAsrError("LOCAL_ASR_MODEL_NOT_INSTALLED", "当前质量模式需要的本地模型尚未安装。", false, {
        qualityMode: input.qualityMode,
      });
    }
    if (!model.supported || (selection.device === "CUDA" && !input.hardwareCapabilities.cudaAvailable)) {
      throw new LocalAsrError(
        "LOCAL_ASR_UNSUPPORTED_HARDWARE",
        input.qualityMode === "QUALITY"
          ? "当前设备暂不支持质量优先模式，建议使用均衡模式。"
          : "当前设备暂不支持所选转写质量。",
        false,
        { qualityMode: input.qualityMode },
      );
    }
    return {
      resolvedProvider: "LOCAL_FUNASR",
      resolvedModel: selection.model,
      resolvedDevice: selection.device,
    };
  }
}

