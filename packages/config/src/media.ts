export const MAX_VIDEO_DOWNLOAD_BYTES = 300 * 1024 * 1024;
export const MAX_IMAGE_DOWNLOAD_BYTES = 30 * 1024 * 1024;
export const MEDIA_DOWNLOAD_TIMEOUT_MS = 120_000;
export const MEDIA_DOWNLOAD_MAX_REDIRECTS = 4;

export const MAX_ASR_FLASH_DURATION_MS = 2 * 60 * 60 * 1_000;
export const MAX_ASR_FLASH_BYTES = 100 * 1024 * 1024;
export const MAX_ASR_BINARY_DATA_BYTES = 20 * 1024 * 1024;
export const ASR_AUDIO_SIGNED_URL_TTL_SECONDS = 15 * 60;
export const DEFAULT_ASR_AUDIO_RETENTION_HOURS = 24;

const runtimeEnvironment = ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {});

export function readAsrAudioRetentionHours(env: Record<string, string | undefined> = runtimeEnvironment) {
  const raw = env.ASR_AUDIO_RETENTION_HOURS?.trim();
  if (!raw) return DEFAULT_ASR_AUDIO_RETENTION_HOURS;
  const hours = Number(raw);
  if (!Number.isInteger(hours) || hours < 0 || hours > 24 * 365) throw new Error("INVALID_ASR_AUDIO_RETENTION_HOURS");
  return hours;
}
export const DOUBAO_FLASH_TIMEOUT_MS = 120_000;
