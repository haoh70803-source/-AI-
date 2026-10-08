import "server-only";

import net from "node:net";
import tls from "node:tls";
import { db } from "@content-center/db";
import { getSystemProviderConfig, systemManagedProvidersEnabled } from "@content-center/integrations";
import { isLocalReviewOffline, storageHealthFromEnv } from "@content-center/providers";

export const RUNTIME_STATUSES = ["OK", "UNCONFIGURED", "MISSING", "UNREACHABLE", "DEGRADED", "DISABLED_FOR_REVIEW"] as const;
export type RuntimeStatus = (typeof RUNTIME_STATUSES)[number];

export type RuntimeHealth = {
  environment: string;
  policy: "ENVIRONMENT" | "WORKSPACE";
  checkedAt: string;
  database: { status: RuntimeStatus; target: { host: string | null; port: number | null; database: string | null } };
  redis: { status: RuntimeStatus };
  worker: { status: RuntimeStatus };
  storage: { status: RuntimeStatus };
  redfox: { status: RuntimeStatus; source: "ENVIRONMENT" | "WORKSPACE" | "NONE" };
  llm: { status: RuntimeStatus; source: "ENVIRONMENT" | "WORKSPACE" | "NONE" };
  asr: { status: RuntimeStatus; source: "ENVIRONMENT" | "WORKSPACE" | "LOCAL" | "NONE" };
};

function statusFromConfigured(configured: boolean): RuntimeStatus {
  return configured ? "OK" : "UNCONFIGURED";
}

function safeTarget(raw: string | undefined) {
  if (!raw) return { host: null, port: null, database: null };
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || null,
      port: url.port ? Number(url.port) : url.protocol === "postgres:" || url.protocol === "postgresql:" ? 5432 : null,
      database: url.pathname.replace(/^\//u, "").split("?", 1)[0] || null,
    };
  } catch {
    return { host: null, port: null, database: null };
  }
}

async function databaseStatus() {
  try {
    await db.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 AS ok");
    return "OK" as const;
  } catch {
    return "UNREACHABLE" as const;
  }
}

async function configuredWorkspaceProviders() {
  try {
    const rows = await db.$queryRawUnsafe<{ provider: string; count: bigint }[]>(`
      SELECT "provider", count(*)::bigint AS count
      FROM "IntegrationConfig"
      WHERE "status" = 'CONFIGURED'
      GROUP BY "provider"
    `);
    return new Map(rows.map((row) => [row.provider, Number(row.count)]));
  } catch {
    return new Map<string, number>();
  }
}

function tcpProbe(raw: string | undefined, fallbackPort: number) {
  if (!raw) return Promise.resolve(false);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return Promise.resolve(false);
  }
  const port = url.port ? Number(url.port) : fallbackPort;
  const secure = url.protocol === "rediss:";
  return new Promise<boolean>((resolve) => {
    const socket = secure
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.createConnection({ host: url.hostname, port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_200, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("secureConnect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function httpProbe(raw: string | undefined, path = "/") {
  if (!raw) return false;
  try {
    const url = new URL(path, raw.endsWith("/") ? raw : `${raw}/`);
    const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1_500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function workerStatus() {
  if (!process.env.WORKER_HEALTH_URL?.trim()) return "MISSING" as const;
  return (await httpProbe(process.env.WORKER_HEALTH_URL)) ? "OK" as const : "UNREACHABLE" as const;
}

export async function getRuntimeHealth(): Promise<RuntimeHealth> {
  const environment = process.env.ENVIRONMENT_ID?.trim() || "UNSET";
  const policy = systemManagedProvidersEnabled() ? "ENVIRONMENT" : "WORKSPACE";
  const workspaceProviders = policy === "WORKSPACE" ? await configuredWorkspaceProviders() : new Map<string, number>();
  const [dbStatus, redisReachable, worker, storageReachable] = await Promise.all([
    databaseStatus(),
    tcpProbe(process.env.REDIS_URL, 6379),
    workerStatus(),
    httpProbe(process.env.S3_ENDPOINT, "/minio/health/live"),
  ]);

  const environmentRedfox = policy === "ENVIRONMENT" && Boolean(getSystemProviderConfig("REDFOX"));
  const environmentLlm = policy === "ENVIRONMENT" && Boolean(getSystemProviderConfig("LLM"));
  const environmentDoubao = policy === "ENVIRONMENT" && Boolean(getSystemProviderConfig("DOUBAO_ASR"));
  const reviewOffline = isLocalReviewOffline();
  const localAsr = !reviewOffline && await httpProbe(process.env.LOCAL_ASR_ENDPOINT || "http://127.0.0.1:8765", "/health");
  const storageConfigured = storageHealthFromEnv() === "CONFIGURED";

  return {
    environment,
    policy,
    checkedAt: new Date().toISOString(),
    database: { status: dbStatus, target: safeTarget(process.env.DATABASE_URL) },
    redis: { status: redisReachable ? "OK" : "UNREACHABLE" },
    worker: { status: worker },
    storage: { status: !storageConfigured ? "UNCONFIGURED" : storageReachable ? "OK" : "DEGRADED" },
    redfox: {
      status: reviewOffline ? "DISABLED_FOR_REVIEW" : policy === "ENVIRONMENT" ? statusFromConfigured(environmentRedfox) : statusFromConfigured((workspaceProviders.get("REDFOX") ?? 0) > 0),
      source: reviewOffline ? "NONE" : policy === "ENVIRONMENT" ? "ENVIRONMENT" : (workspaceProviders.get("REDFOX") ?? 0) > 0 ? "WORKSPACE" : "NONE",
    },
    llm: {
      status: reviewOffline ? "DISABLED_FOR_REVIEW" : policy === "ENVIRONMENT" ? statusFromConfigured(environmentLlm) : statusFromConfigured((workspaceProviders.get("LLM") ?? 0) > 0),
      source: reviewOffline ? "NONE" : policy === "ENVIRONMENT" ? "ENVIRONMENT" : (workspaceProviders.get("LLM") ?? 0) > 0 ? "WORKSPACE" : "NONE",
    },
    asr: {
      status: reviewOffline ? "DISABLED_FOR_REVIEW" : environmentDoubao || localAsr || (workspaceProviders.get("DOUBAO_ASR") ?? 0) > 0 ? "OK" : "UNCONFIGURED",
      source: reviewOffline ? "NONE" : environmentDoubao ? "ENVIRONMENT" : localAsr ? "LOCAL" : (workspaceProviders.get("DOUBAO_ASR") ?? 0) > 0 ? "WORKSPACE" : "NONE",
    },
  };
}
