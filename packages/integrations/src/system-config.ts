import { db, type Prisma } from "@content-center/db";
import { z } from "zod";
import { decryptConfig, parseMasterEncryptionKey } from "./encryption";
import {
  DOUBAO_AUTH_MODES,
  normalizePublicProviderConfig,
  providerConfigFields,
  type ConfigurableIntegrationProvider,
} from "./schemas";
import { getSystemProviderConfig, systemManagedProvidersEnabled } from "./system-provider-policy";

export const SYSTEM_CONFIG_WORKSPACE_ID = "system-provider-config";
export const SYSTEM_CONFIG_WORKSPACE_SLUG = "system-provider-config";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(max).optional(),
);

const systemDoubaoConfigSchema = z.object({
  authMode: z.enum(DOUBAO_AUTH_MODES),
  baseUrl: z.string().trim().url().max(2_000),
  resourceId: z.string().trim().min(1).max(500),
  apiKey: optionalText(10_000),
  appId: optionalText(500),
  accessToken: optionalText(10_000),
  boostingTableId: optionalText(500),
  boostingTableName: optionalText(500),
}).strict().superRefine((config, context) => {
  if (config.authMode === "LEGACY_APP_TOKEN" && !config.appId) {
    context.addIssue({ code: "custom", path: ["appId"], message: "App ID is required for legacy authentication." });
  }
});

export function parseSystemDoubaoConfig(input: unknown) {
  return systemDoubaoConfigSchema.parse(input);
}

type SystemConfigDatabase = typeof db;

type SystemConfigDeps = {
  prisma?: SystemConfigDatabase;
  keySource?: () => string | undefined;
};

export type StoredSystemProviderConfig = {
  config: Record<string, unknown>;
  status: string;
  lastFour: string | null;
  updatedAt: Date;
};

export type ResolvedSystemProviderConfig = {
  config: Record<string, unknown>;
  source: "env" | "database";
  lastFour: string | null;
  updatedAt: Date | null;
};

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function stripSystemProviderSecrets(
  provider: ConfigurableIntegrationProvider,
  config: Record<string, unknown>,
) {
  const secretFields = new Set(providerConfigFields[provider].secretFields);
  return Object.fromEntries(Object.entries(config).filter(([key]) => !secretFields.has(key)));
}

export async function ensureSystemConfigWorkspace(prisma: SystemConfigDatabase = db) {
  return prisma.workspace.upsert({
    where: { id: SYSTEM_CONFIG_WORKSPACE_ID },
    create: { id: SYSTEM_CONFIG_WORKSPACE_ID, name: "System Configuration", slug: SYSTEM_CONFIG_WORKSPACE_SLUG },
    update: {},
  });
}

export async function readStoredSystemProviderConfig(
  provider: ConfigurableIntegrationProvider,
  deps: SystemConfigDeps = {},
): Promise<StoredSystemProviderConfig | null> {
  const prisma = deps.prisma ?? db;
  const keySource = deps.keySource ?? (() => process.env.INTEGRATION_ENCRYPTION_KEY);
  const workspace = await prisma.workspace.findUnique({ where: { id: SYSTEM_CONFIG_WORKSPACE_ID } });
  if (!workspace) return null;
  const row = await prisma.integrationConfig.findUnique({
    where: { workspaceId_provider: { workspaceId: workspace.id, provider } },
  });
  if (!row) return null;
  const secretConfig = row.encryptedConfig
    ? decryptConfig(row.encryptedConfig, parseMasterEncryptionKey(keySource()))
    : {};
  const publicConfig = normalizePublicProviderConfig(provider, jsonObject(row.publicConfig));
  const config: Record<string, unknown> = { ...publicConfig, ...secretConfig };
  if (provider === "DOUBAO_ASR") config.protocol = "RECORDING_FILE_2_0";
  return { config, status: row.status, lastFour: row.lastFour, updatedAt: row.updatedAt };
}

export async function resolveSystemProviderConfig(
  provider: ConfigurableIntegrationProvider,
  deps: SystemConfigDeps = {},
): Promise<ResolvedSystemProviderConfig | null> {
  if (!systemManagedProvidersEnabled()) return null;
  const envConfig = getSystemProviderConfig(provider);
  if (envConfig) return { config: envConfig, source: "env", lastFour: null, updatedAt: null };
  const stored = await readStoredSystemProviderConfig(provider, deps);
  if (!stored || stored.status !== "CONFIGURED") return null;
  return { config: stored.config, source: "database", lastFour: stored.lastFour, updatedAt: stored.updatedAt };
}
