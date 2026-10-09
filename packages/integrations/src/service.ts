import { db, type Prisma } from "@content-center/db";
import { decryptConfig, encryptConfig, parseMasterEncryptionKey, secretLastFour } from "./encryption";
import { classifyLLMConfig, llmRuntimeConfig } from "./kimi-model-policy";
import {
  type ConfigurableIntegrationProvider,
  isConfigurableIntegrationProvider,
  normalizePublicProviderConfig,
  parseProviderConfig,
  providerRequiresSecret,
  primarySecretField,
  splitProviderConfig,
} from "./schemas";
import { resolveSystemProviderConfig, stripSystemProviderSecrets } from "./system-config";
import { systemManagedProvidersEnabled } from "./system-provider-policy";

export const INTEGRATION_AUDIT_ACTIONS = [
  "integration.created",
  "integration.updated",
  "integration.disabled",
  "integration.enabled",
  "integration.deleted",
  "integration.tested",
  "integration.test_failed",
] as const;

export class IntegrationServiceError extends Error {
  constructor(
    readonly code: "INTEGRATION_NOT_FOUND" | "UNSUPPORTED_INTEGRATION" | "INTEGRATION_SECRET_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "IntegrationServiceError";
  }
}

type IntegrationDatabase = typeof db;

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function inputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type PublicIntegrationConfig = {
  provider: ConfigurableIntegrationProvider;
  status: "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "ERROR" | "DISABLED" | "MOCK";
  configured: boolean;
  publicConfig: Record<string, unknown>;
  lastFour: string | null;
  updatedAt: Date | null;
};

function llmDisplayStatus(
  publicConfig: Record<string, unknown>,
  storedStatus: "CONFIGURED" | "UNCONFIGURED" | "ERROR" | "DISABLED" | "MOCK",
): PublicIntegrationConfig["status"] {
  if (storedStatus === "DISABLED" || storedStatus === "ERROR") return storedStatus;
  const policyState = classifyLLMConfig(publicConfig);
  if (policyState === "NEEDS_RECONFIGURATION") return "NEEDS_RECONFIGURATION";
  if (policyState === "FIXTURE") return "MOCK";
  if (policyState === "UNCONFIGURED") return "UNCONFIGURED";
  return storedStatus === "CONFIGURED" ? "CONFIGURED" : "UNCONFIGURED";
}

export class IntegrationService {
  constructor(
    private readonly prisma: IntegrationDatabase = db,
    private readonly keySource: () => string | undefined = () => process.env.INTEGRATION_ENCRYPTION_KEY,
  ) {
    const configuredKey = this.keySource();
    if (configuredKey?.trim()) parseMasterEncryptionKey(configuredKey);
  }

  async getIntegrationStatus(workspaceId: string, provider: ConfigurableIntegrationProvider): Promise<PublicIntegrationConfig> {
    if (systemManagedProvidersEnabled()) {
      const resolved = await resolveSystemProviderConfig(provider, { prisma: this.prisma, keySource: this.keySource });
      const publicConfig = resolved ? stripSystemProviderSecrets(provider, resolved.config) : null;
      return {
        provider,
        status: publicConfig ? "CONFIGURED" : "UNCONFIGURED",
        configured: Boolean(publicConfig),
        publicConfig: publicConfig ?? {},
        lastFour: resolved?.lastFour ?? null,
        updatedAt: resolved?.updatedAt ?? null,
      };
    }
    const row = await this.prisma.integrationConfig.findUnique({
      where: { workspaceId_provider: { workspaceId, provider } },
    });
    if (!row) {
      return { provider, status: "UNCONFIGURED", configured: false, publicConfig: {}, lastFour: null, updatedAt: null };
    }
    const publicConfig = normalizePublicProviderConfig(provider, jsonObject(row.publicConfig));
    const status = provider === "LLM" ? llmDisplayStatus(publicConfig, row.status) : row.status;
    return {
      provider,
      status,
      configured: status === "CONFIGURED",
      publicConfig,
      lastFour: row.lastFour,
      updatedAt: row.updatedAt,
    };
  }

  async getPublicIntegrationConfig(workspaceId: string, provider: ConfigurableIntegrationProvider) {
    return this.getIntegrationStatus(workspaceId, provider);
  }

  async getDecryptedIntegrationConfig(workspaceId: string, provider: ConfigurableIntegrationProvider): Promise<Record<string, unknown> | null> {
    if (systemManagedProvidersEnabled()) {
      const resolved = await resolveSystemProviderConfig(provider, { prisma: this.prisma, keySource: this.keySource });
      return resolved?.config ?? null;
    }
    const row = await this.prisma.integrationConfig.findUnique({
      where: { workspaceId_provider: { workspaceId, provider } },
    });
    if (!row || (row.status !== "CONFIGURED" && row.status !== "MOCK")) return null;
    const secretConfig = row.encryptedConfig
      ? decryptConfig(row.encryptedConfig, parseMasterEncryptionKey(this.keySource()))
      : {};
    const publicConfig = normalizePublicProviderConfig(provider, jsonObject(row.publicConfig));
    if (provider === "LLM") {
      return llmRuntimeConfig(publicConfig, secretConfig);
    }
    return { ...publicConfig, ...secretConfig };
  }

  async saveIntegrationConfig(input: {
    workspaceId: string;
    userId: string;
    provider: ConfigurableIntegrationProvider;
    config: unknown;
    mode?: "FIXTURE";
  }) {
    const parsed = parseProviderConfig(input.provider, input.config, { allowFixture: input.mode === "FIXTURE" });
    const requiresSecret = providerRequiresSecret(input.provider);
    const key = requiresSecret ? parseMasterEncryptionKey(this.keySource()) : null;
    const existing = await this.prisma.integrationConfig.findUnique({
      where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: input.provider } },
    });
    const { publicConfig: parsedPublicConfig, secretConfig: suppliedSecrets } = splitProviderConfig(input.provider, parsed);
    const existingSecrets = existing?.encryptedConfig && key ? decryptConfig(existing.encryptedConfig, key) : {};
    const existingPublicConfig = existing ? normalizePublicProviderConfig(input.provider, jsonObject(existing.publicConfig)) : {};
    const publicConfig = input.provider === "DOUBAO_ASR"
      && parsedPublicConfig.protocol === undefined
      && (existingPublicConfig.protocol === "FLASH" || existingPublicConfig.protocol === "RECORDING_FILE_2_0" || existingPublicConfig.protocol === "STREAMING_2_0")
      ? { ...parsedPublicConfig, protocol: existingPublicConfig.protocol }
      : parsedPublicConfig;
    const llmProviderChanged = Boolean(existing && (
      (input.provider === "LLM" && existingPublicConfig.provider !== publicConfig.provider)
      || (existingPublicConfig.baseUrl && existingPublicConfig.baseUrl !== publicConfig.baseUrl)
    ));
    const secretConfig = { ...(llmProviderChanged ? {} : existingSecrets), ...suppliedSecrets };
    const combinedConfig = { ...publicConfig, ...secretConfig };
    const primarySecret = primarySecretField(input.provider, combinedConfig);
    const primaryValue = primarySecret ? secretConfig[primarySecret] : undefined;
    if (requiresSecret && (typeof primaryValue !== "string" || !primaryValue)) {
      throw new IntegrationServiceError("INTEGRATION_SECRET_REQUIRED", `${primarySecret} is required.`);
    }
    const secretConfigured = requiresSecret ? typeof primaryValue === "string" && primaryValue.length > 0 : true;
    const llmPolicyState = input.provider === "LLM" ? classifyLLMConfig(publicConfig) : null;
    const configured = input.provider === "LLM"
      ? secretConfigured && llmPolicyState === "CURRENT"
      : secretConfigured;
    const encryptedConfig = Object.keys(secretConfig).length > 0 && key ? encryptConfig(secretConfig, key) : null;
    const changedFields = Object.keys(parsed).sort();
    const status = llmPolicyState === "FIXTURE" ? "MOCK" : configured ? "CONFIGURED" : "UNCONFIGURED";

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.integrationConfig.upsert({
        where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: input.provider } },
        create: {
          workspaceId: input.workspaceId,
          provider: input.provider,
          status,
          configured,
          publicConfig: inputJson(publicConfig),
          encryptedConfig,
          lastFour: requiresSecret && secretConfigured ? secretLastFour(primaryValue as string) : null,
          encryptionKeyVersion: 1,
        },
        update: {
          status,
          configured,
          publicConfig: inputJson(publicConfig),
          encryptedConfig,
          lastFour: requiresSecret && secretConfigured ? secretLastFour(primaryValue as string) : null,
          encryptionKeyVersion: 1,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: existing ? "integration.updated" : "integration.created",
          resourceType: "integration_config",
          resourceId: row.id,
          metadata: { provider: input.provider, status, changedFields },
        },
      });
      return {
        provider: input.provider,
        status: row.status,
        configured: status === "CONFIGURED",
        publicConfig,
        lastFour: row.lastFour,
        updatedAt: row.updatedAt,
      } satisfies PublicIntegrationConfig;
    });
  }

  async disableIntegration(input: { workspaceId: string; userId: string; provider: ConfigurableIntegrationProvider }) {
    return this.setEnabled(input, false);
  }

  async enableIntegration(input: { workspaceId: string; userId: string; provider: ConfigurableIntegrationProvider }) {
    return this.setEnabled(input, true);
  }

  private async setEnabled(
    input: { workspaceId: string; userId: string; provider: ConfigurableIntegrationProvider },
    enabled: boolean,
  ) {
    const existing = await this.prisma.integrationConfig.findUnique({
      where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: input.provider } },
    });
    if (!existing) throw new IntegrationServiceError("INTEGRATION_NOT_FOUND", "Integration does not exist.");
    let configured = false;
    if (enabled && !providerRequiresSecret(input.provider)) {
      configured = true;
    } else if (enabled && existing.encryptedConfig) {
      const secrets = decryptConfig(existing.encryptedConfig, parseMasterEncryptionKey(this.keySource()));
      const publicConfig = normalizePublicProviderConfig(input.provider, jsonObject(existing.publicConfig));
      const primarySecret = primarySecretField(input.provider, { ...publicConfig, ...secrets });
      configured = Boolean(primarySecret && typeof secrets[primarySecret] === "string");
    }
    const publicConfig = normalizePublicProviderConfig(input.provider, jsonObject(existing.publicConfig));
    const llmPolicyState = input.provider === "LLM" ? classifyLLMConfig(publicConfig) : null;
    if (input.provider === "LLM") configured = configured && llmPolicyState === "CURRENT";
    const status = !enabled
      ? "DISABLED"
      : llmPolicyState === "FIXTURE"
        ? "MOCK"
        : configured
          ? "CONFIGURED"
          : "UNCONFIGURED";
    await this.prisma.$transaction([
      this.prisma.integrationConfig.update({
        where: { id: existing.id },
        data: { status, configured },
      }),
      this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: enabled ? "integration.enabled" : "integration.disabled",
          resourceType: "integration_config",
          resourceId: existing.id,
          metadata: { provider: input.provider, status, changedFields: ["status"] },
        },
      }),
    ]);
    return this.getIntegrationStatus(input.workspaceId, input.provider);
  }

  async deleteIntegration(input: { workspaceId: string; userId: string; provider: ConfigurableIntegrationProvider }) {
    const existing = await this.prisma.integrationConfig.findUnique({
      where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: input.provider } },
    });
    if (!existing) throw new IntegrationServiceError("INTEGRATION_NOT_FOUND", "Integration does not exist.");
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: "integration.deleted",
          resourceType: "integration_config",
          resourceId: existing.id,
          metadata: { provider: input.provider, status: "UNCONFIGURED", changedFields: [] },
        },
      });
      await tx.integrationConfig.delete({ where: { id: existing.id } });
    });
  }
}

export function assertConfigurableProvider(value: string): ConfigurableIntegrationProvider {
  if (!isConfigurableIntegrationProvider(value)) {
    throw new IntegrationServiceError("UNSUPPORTED_INTEGRATION", "Integration provider is not configurable.");
  }
  return value;
}
