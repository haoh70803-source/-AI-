import "server-only";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProviderConfig, IntegrationService } from "@content-center/integrations";
import {
  isLocalReviewOffline,
  LocalAsrClient,
  LocalAsrError,
  type LocalAsrBenchmarkProfile,
  type LocalAsrModel,
  type TranscriptionQualityMode,
} from "@content-center/providers";

const integrationService = new IntegrationService();

export type LocalAsrDisplay = {
  status: "NORMAL" | "NOT_RUNNING" | "ERROR";
  errorCode?: string;
  hardware: Record<string, unknown> | null;
  models: Array<{
    key: LocalAsrModel;
    label: string;
    modelId: string;
    installed: boolean;
    loaded: boolean;
    loadedDevices: string[];
    supported: boolean;
    unavailableReason?: string | null;
  }>;
  qualityModes: Partial<Record<TranscriptionQualityMode, {
    available: boolean;
    installed: boolean;
    model: LocalAsrModel;
    device: "CPU" | "CUDA";
  }>>;
};

async function configuration(workspaceId: string) {
  const status = await integrationService.getIntegrationStatus(workspaceId, "TRANSCRIPTION");
  return parseProviderConfig("TRANSCRIPTION", status.publicConfig) as {
    endpoint: string;
    qualityMode: TranscriptionQualityMode;
  };
}

async function benchmarkProfile() {
  let content: string;
  try {
    content = await readFile(resolve(process.cwd(), "services/local-asr/model-profile.json"), "utf8");
  } catch {
    content = await readFile(resolve(process.cwd(), "../../services/local-asr/model-profile.json"), "utf8");
  }
  return JSON.parse(content) as LocalAsrBenchmarkProfile;
}

export async function getLocalAsrDisplay(workspaceId: string): Promise<LocalAsrDisplay> {
  if (isLocalReviewOffline()) return { status: "NOT_RUNNING", errorCode: "LOCAL_REVIEW_OFFLINE", hardware: null, models: [], qualityModes: {} };
  const config = await configuration(workspaceId);
  const client = new LocalAsrClient({ endpoint: config.endpoint, model: "SENSEVOICE_SMALL", device: "CPU" });
  try {
    const health = await client.health();
    const profile = await benchmarkProfile();
    const qualityModes = Object.fromEntries((["FAST", "BALANCED", "QUALITY"] as const).map((mode) => {
      const selection = profile[mode];
      const model = health.models.find((candidate) => candidate.key === selection.model);
      const available = Boolean(model?.supported && (selection.device !== "CUDA" || health.hardware.cudaAvailable));
      return [mode, { available, installed: Boolean(model?.installed), model: selection.model, device: selection.device }];
    })) as LocalAsrDisplay["qualityModes"];
    return { status: "NORMAL", hardware: health.hardware, models: health.models, qualityModes };
  } catch (error) {
    return {
      status: error instanceof LocalAsrError && error.code === "LOCAL_ASR_NOT_RUNNING" ? "NOT_RUNNING" : "ERROR",
      errorCode: error instanceof LocalAsrError ? error.code : "LOCAL_ASR_INVALID_RESPONSE",
      hardware: null,
      models: [],
      qualityModes: {},
    };
  }
}

export async function initializeLocalAsrModel(input: {
  workspaceId: string;
  qualityMode?: TranscriptionQualityMode;
  model?: LocalAsrModel;
}) {
  if (isLocalReviewOffline()) throw new LocalAsrError("LOCAL_REVIEW_OFFLINE", "验收环境已关闭模型初始化。", false);
  const config = await configuration(input.workspaceId);
  const profile = await benchmarkProfile();
  const targetModel = input.model ?? profile[input.qualityMode ?? config.qualityMode].model;
  const client = new LocalAsrClient({ endpoint: config.endpoint, model: targetModel, device: "CPU" });
  const health = await client.health();
  const model = health.models.find((candidate) => candidate.key === targetModel);
  if (!model?.supported) {
    throw new LocalAsrError("LOCAL_ASR_UNSUPPORTED_HARDWARE", "当前设备暂不支持所选质量模式，建议使用均衡模式。", false);
  }
  return client.installModel(targetModel);
}
