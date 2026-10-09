import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { validateDaily, validateReview, dailyEnvironment, reviewEnvironment } from "./local-profile.mjs";
export const RELEASE_REVIEW_PORT = "3032";
export function buildEnvironment(inherited, guardPath, networkLog) {
  const osKeys = new Set(["path","pathext","systemroot","windir","comspec","temp","tmp","appdata","localappdata","userprofile","home","lang"]);
  const os = Object.fromEntries(Object.entries(inherited).filter(([key]) => osKeys.has(key.toLowerCase())));
  return { ...os, NODE_ENV: "production", ENVIRONMENT_ID: "LOCAL_BUILD",
    LOCAL_RELEASE_WORKSPACE: "1", LOCAL_RELEASE_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1",
    APP_URL: "http://localhost:3032", DATABASE_URL: "postgresql://build-only:build-only@127.0.0.1:1/build_only",
    AUTH_SECRET: "BUILD_ONLY_NOT_A_RUNTIME_CREDENTIAL_0000000000000000",
    AUTH_COOKIE_PREFIX: "build-only",
    STORAGE_DRIVER: "S3_COMPATIBLE", S3_ENDPOINT: "http://127.0.0.1:1", S3_BUCKET: "build-only",
    S3_ACCESS_KEY_ID: "BUILD_ONLY", S3_SECRET_ACCESS_KEY: "BUILD_ONLY", REDIS_URL: "redis://127.0.0.1:1/0",
    WORKER_MODE: "disabled", FREE_WORKER_MODE: "false", EXTERNAL_CALLS_DISABLED: "true", LOCAL_REVIEW_OFFLINE: "false",
    SYSTEM_MANAGED_PROVIDERS: "false", DEMO_AUTO_LOGIN: "false", INTERNAL_SIGNUP_ENABLED: "false", MOCK_MODE: "false",
    NODE_OPTIONS: '--max-old-space-size=2048 --import "' + pathToFileURL(guardPath).href + '"',
    RELEASE_NETWORK_LOG: networkLog };
}
export function runtimeEnvironment(mode, values, inherited, options = {}) {
  if (!["daily","review","live"].includes(mode)) throw Error("RELEASE_PROFILE_REQUIRED");
  if (!values.AUTH_SECRET || values.AUTH_SECRET.includes("BUILD_ONLY") || !values.INTEGRATION_ENCRYPTION_KEY || !values.S3_ACCESS_KEY_ID || !values.S3_SECRET_ACCESS_KEY || !values.S3_BUCKET) throw Error("RELEASE_EXISTING_CONFIGURATION_REQUIRED");
  if (mode === "daily" && values.EXTERNAL_CALLS_DISABLED !== "true") throw Error("RELEASE_EXTERNAL_CALLS_MUST_BE_DISABLED");
  if (mode === "daily") validateDaily(values); else validateReview(values);
  const base = mode === "daily" ? dailyEnvironment(values,inherited) : reviewEnvironment(values,inherited);
  return { ...base, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", LOCAL_RELEASE_WORKSPACE: "1", LOCAL_RELEASE_PROFILE: mode,
    ENVIRONMENT_ID: mode === "live" ? "LOCAL_LIVE" : base.ENVIRONMENT_ID,
    LOCAL_REVIEW_OFFLINE: mode === "live" ? "false" : base.LOCAL_REVIEW_OFFLINE,
    APP_URL: mode === "daily" ? values.APP_URL : "http://localhost:" + RELEASE_REVIEW_PORT,
    AUTH_COOKIE_PREFIX: mode === "daily" ? values.AUTH_COOKIE_PREFIX : "content-center-12-release",
    AIHOT_PUBLIC_NEWS_ENABLED: mode === "daily" || options.publicNewsReview === true ? "true" : "false",
    REDIS_URL: mode === "live" ? "redis://127.0.0.1:16379/0" : base.REDIS_URL,
    QUEUE_PREFIX: mode === "live" ? "content-center-12-material" : base.QUEUE_PREFIX,
    WORKER_MODE: mode === "live" ? "embedded" : "disabled", FREE_WORKER_MODE: "false", EXTERNAL_CALLS_DISABLED: mode === "live" ? "false" : "true", SYSTEM_MANAGED_PROVIDERS: "false", DEMO_AUTO_LOGIN: "false", INTERNAL_SIGNUP_ENABLED: "false", ALLOW_PUBLIC_SIGNUP: "false", NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP: "false", MOCK_MODE: "false", NODE_OPTIONS: "--max-old-space-size=2048" };
}
export function releaseId(value) {
  if (!/^release-[0-9TZ]+-[a-f0-9]{8}$/.test(value ?? "")) throw Error("RELEASE_ARTIFACT_ID_REQUIRED");
  return value;
}
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
