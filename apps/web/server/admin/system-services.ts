import "server-only";

import { getSystemProviderConfig, resolveSystemProviderConfig, systemManagedProvidersEnabled } from "@content-center/integrations";
import { isLocalReviewOffline } from "@content-center/providers";
import { storageHealthFromEnv } from "@content-center/providers/storage";

async function localFunAsrStatus() {
  if (isLocalReviewOffline()) return "DISABLED_FOR_REVIEW" as const;
  const baseUrl = process.env.LOCAL_ASR_ENDPOINT?.trim() || "http://127.0.0.1:8765";
  try {
    const response = await fetch(new URL("/health", `${baseUrl.replace(/\/$/, "")}/`), {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok ? "AVAILABLE" as const : "UNAVAILABLE" as const;
  } catch {
    return "UNAVAILABLE" as const;
  }
}

export async function getSystemServiceStatuses() {
  const offline = isLocalReviewOffline();
  return {
    policy: systemManagedProvidersEnabled() ? "ENV_MANAGED" as const : "WORKSPACE_MANAGED" as const,
    ai: offline ? "DISABLED_FOR_REVIEW" as const : getSystemProviderConfig("LLM") ? "CONFIGURED" as const : "UNCONFIGURED" as const,
    redfox: offline ? "DISABLED_FOR_REVIEW" as const : getSystemProviderConfig("REDFOX") ? "CONFIGURED" as const : "UNCONFIGURED" as const,
    doubao: offline ? "DISABLED_FOR_REVIEW" as const : (await resolveSystemProviderConfig("DOUBAO_ASR")) ? "CONFIGURED" as const : "UNCONFIGURED" as const,
    localFunAsr: await localFunAsrStatus(),
    storage: storageHealthFromEnv(),
    developmentPrimary: "LOCAL_FUNASR" as const,
    productionPrimary: "DOUBAO_RECORDING_FILE_2_0" as const,
  };
}
