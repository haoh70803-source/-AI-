import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { db } from "@content-center/db";
import { encryptConfig, parseMasterEncryptionKey, decryptConfig } from "./encryption";
import { IntegrationService } from "./service";
import {
  ensureSystemConfigWorkspace,
  parseSystemDoubaoConfig,
  readStoredSystemProviderConfig,
  resolveSystemProviderConfig,
  stripSystemProviderSecrets,
  SYSTEM_CONFIG_WORKSPACE_ID,
  SYSTEM_CONFIG_WORKSPACE_SLUG,
} from "./system-config";

const key = randomBytes(32).toString("base64");
const keySource = () => key;

const envNames = ["NODE_ENV", "SYSTEM_MANAGED_PROVIDERS", "DOUBAO_API_KEY", "DOUBAO_APP_ID", "DOUBAO_ACCESS_TOKEN", "DOUBAO_ASR_RESOURCE_ID", "DOUBAO_ASR_BASE_URL"] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function enableSystemManaged() {
  delete process.env.NODE_ENV;
  process.env.SYSTEM_MANAGED_PROVIDERS = "true";
}

type StoredRow = {
  id: string;
  workspaceId: string;
  provider: string;
  status: string;
  configured: boolean;
  publicConfig: Record<string, unknown>;
  encryptedConfig: string | null;
  lastFour: string | null;
  updatedAt: Date;
};

function mockPrisma(initial: { workspaceId?: string; row?: StoredRow | null } = {}) {
  const state = {
    workspaceId: initial.workspaceId ?? null as string | null,
    row: initial.row ?? null as StoredRow | null,
  };
  const prisma = {
    workspace: {
      findUnique: vi.fn(async () => (state.workspaceId ? { id: state.workspaceId, slug: SYSTEM_CONFIG_WORKSPACE_SLUG } : null)),
      upsert: vi.fn(async ({ create }: { create: { id: string; name: string; slug: string } }) => {
        state.workspaceId = state.workspaceId ?? "system-workspace-id";
        return { ...create, id: state.workspaceId };
      }),
    },
    integrationConfig: {
      findUnique: vi.fn(async () => state.row),
      upsert: vi.fn(async ({ create, update }: { create: Partial<StoredRow>; update: Partial<StoredRow> }) => {
        state.row = { id: "row-1", updatedAt: new Date(), ...state.row, ...create, ...update } as StoredRow;
        return state.row;
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work({
      integrationConfig: { upsert: prisma.integrationConfig.upsert },
      auditLog: { create: prisma.auditLog.create },
    }),
  };
  return { prisma: prisma as unknown as typeof db, state };
}

function storedDoubaoRow(secretConfig: Record<string, unknown>, publicConfig: Record<string, unknown>, status = "CONFIGURED"): StoredRow {
  return {
    id: "row-1",
    workspaceId: "system-workspace-id",
    provider: "DOUBAO_ASR",
    status,
    configured: status === "CONFIGURED",
    publicConfig,
    encryptedConfig: encryptConfig(secretConfig, parseMasterEncryptionKey(key)),
    lastFour: "1234",
    updatedAt: new Date(),
  };
}

describe("system provider config storage", () => {
  it("creates the reserved system workspace idempotently", async () => {
    const { prisma, state } = mockPrisma();
    const workspace = await ensureSystemConfigWorkspace(prisma);
    expect(workspace.slug).toBe(SYSTEM_CONFIG_WORKSPACE_SLUG);
    expect(prisma.workspace.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: SYSTEM_CONFIG_WORKSPACE_ID } }));
    await ensureSystemConfigWorkspace(prisma);
    expect(state.workspaceId).toBe("system-workspace-id");
  });

  it("resolver returns null when system-managed mode is disabled, even with a stored config", async () => {
    delete process.env.NODE_ENV;
    process.env.SYSTEM_MANAGED_PROVIDERS = "false";
    const { prisma } = mockPrisma({
      workspaceId: "system-workspace-id",
      row: storedDoubaoRow({ apiKey: "stored-secret" }, { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo" }),
    });
    await expect(resolveSystemProviderConfig("DOUBAO_ASR", { prisma, keySource })).resolves.toBeNull();
  });

  it("env config wins over the stored database config", async () => {
    enableSystemManaged();
    process.env.DOUBAO_API_KEY = "env-secret";
    process.env.DOUBAO_ASR_RESOURCE_ID = "volc.env.resource";
    const { prisma } = mockPrisma({
      workspaceId: "system-workspace-id",
      row: storedDoubaoRow({ apiKey: "stored-secret" }, { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.stored.resource" }),
    });
    const resolved = await resolveSystemProviderConfig("DOUBAO_ASR", { prisma, keySource });
    expect(resolved?.source).toBe("env");
    expect(resolved?.config).toMatchObject({ apiKey: "env-secret", resourceId: "volc.env.resource", protocol: "RECORDING_FILE_2_0" });
    expect(prisma.integrationConfig.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the stored database config when env is absent, with fixed Recording File 2.0 protocol", async () => {
    enableSystemManaged();
    const { prisma } = mockPrisma({
      workspaceId: "system-workspace-id",
      row: storedDoubaoRow({ apiKey: "stored-secret-1234" }, { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo" }),
    });
    const resolved = await resolveSystemProviderConfig("DOUBAO_ASR", { prisma, keySource });
    expect(resolved?.source).toBe("database");
    expect(resolved?.config).toMatchObject({
      authMode: "API_KEY",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "volc.bigasr.auc_turbo",
      apiKey: "stored-secret-1234",
      protocol: "RECORDING_FILE_2_0",
    });
    expect(resolved?.lastFour).toBe("1234");
  });

  it("ignores stored rows that are not CONFIGURED", async () => {
    enableSystemManaged();
    const { prisma } = mockPrisma({
      workspaceId: "system-workspace-id",
      row: storedDoubaoRow({ apiKey: "stored-secret" }, { authMode: "API_KEY", resourceId: "volc.bigasr.auc_turbo" }, "DISABLED"),
    });
    await expect(resolveSystemProviderConfig("DOUBAO_ASR", { prisma, keySource })).resolves.toBeNull();
  });

  it("reads LEGACY_APP_TOKEN stored configs with decrypted access token", async () => {
    enableSystemManaged();
    const { prisma } = mockPrisma({
      workspaceId: "system-workspace-id",
      row: storedDoubaoRow(
        { accessToken: "legacy-token-5678" },
        { authMode: "LEGACY_APP_TOKEN", appId: "app-1", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo" },
      ),
    });
    const resolved = await resolveSystemProviderConfig("DOUBAO_ASR", { prisma, keySource });
    expect(resolved?.config).toMatchObject({ authMode: "LEGACY_APP_TOKEN", appId: "app-1", accessToken: "legacy-token-5678" });
  });

  it("strips every secret field from public views", () => {
    const stripped = stripSystemProviderSecrets("DOUBAO_ASR", {
      authMode: "LEGACY_APP_TOKEN",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "volc.bigasr.auc_turbo",
      appId: "app-1",
      apiKey: "secret",
      accessToken: "secret",
      protocol: "RECORDING_FILE_2_0",
    });
    expect(stripped).not.toHaveProperty("apiKey");
    expect(stripped).not.toHaveProperty("accessToken");
    expect(stripped).toMatchObject({ appId: "app-1", protocol: "RECORDING_FILE_2_0" });
  });

  it("keeps stored secrets encrypted at rest", async () => {
    const { prisma, state } = mockPrisma({
      workspaceId: "system-workspace-id",
      row: storedDoubaoRow({ apiKey: "plaintext-secret" }, { authMode: "API_KEY", resourceId: "volc.bigasr.auc_turbo" }),
    });
    expect(state.row!.encryptedConfig).not.toContain("plaintext-secret");
    expect(JSON.stringify(state.row!.publicConfig)).not.toContain("plaintext-secret");
    const stored = await readStoredSystemProviderConfig("DOUBAO_ASR", { prisma, keySource });
    expect(stored?.config.apiKey).toBe("plaintext-secret");
  });
});

describe("system DOUBAO_ASR save flow", () => {
  it("requires explicit valid system fields and the legacy App ID", () => {
    expect(() => parseSystemDoubaoConfig({
      authMode: "API_KEY",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "",
      apiKey: "secret",
    })).toThrow();
    expect(() => parseSystemDoubaoConfig({
      authMode: "LEGACY_APP_TOKEN",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "recording-file-resource",
      accessToken: "secret",
    })).toThrow();
    expect(parseSystemDoubaoConfig({
      authMode: "API_KEY",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "recording-file-resource",
      apiKey: "",
      boostingTableId: "",
    })).toEqual({
      authMode: "API_KEY",
      baseUrl: "https://openspeech.bytedance.com",
      resourceId: "recording-file-resource",
    });
  });

  it("preserves the old secret when the update sends an empty secret", async () => {
    enableSystemManaged();
    const { prisma, state } = mockPrisma({ workspaceId: "system-workspace-id" });
    const service = new IntegrationService(prisma, keySource);
    await service.saveIntegrationConfig({
      workspaceId: "system-workspace-id",
      userId: "admin",
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo", apiKey: "original-secret-4321" },
    });
    const result = await service.saveIntegrationConfig({
      workspaceId: "system-workspace-id",
      userId: "admin",
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_v2", apiKey: "" },
    });
    expect(result.status).toBe("CONFIGURED");
    expect(result.lastFour).toBe("4321");
    const secrets = decryptConfig(state.row!.encryptedConfig!, parseMasterEncryptionKey(key));
    expect(secrets.apiKey).toBe("original-secret-4321");
    expect(state.row!.publicConfig.resourceId).toBe("volc.bigasr.auc_v2");
  });

  it("rejects a fresh config without the required secret", async () => {
    const { prisma } = mockPrisma({ workspaceId: "system-workspace-id" });
    const service = new IntegrationService(prisma, keySource);
    await expect(service.saveIntegrationConfig({
      workspaceId: "system-workspace-id",
      userId: "admin",
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo" },
    })).rejects.toMatchObject({ code: "INTEGRATION_SECRET_REQUIRED" });
    expect(prisma.integrationConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid URLs and incomplete legacy configs", async () => {
    const { prisma } = mockPrisma({ workspaceId: "system-workspace-id" });
    const service = new IntegrationService(prisma, keySource);
    await expect(service.saveIntegrationConfig({
      workspaceId: "system-workspace-id",
      userId: "admin",
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", baseUrl: "not-a-url", resourceId: "volc.bigasr.auc_turbo", apiKey: "secret" },
    })).rejects.toThrow();
    await expect(service.saveIntegrationConfig({
      workspaceId: "system-workspace-id",
      userId: "admin",
      provider: "DOUBAO_ASR",
      config: { authMode: "LEGACY_APP_TOKEN", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo", appId: "app-1" },
    })).rejects.toMatchObject({ code: "INTEGRATION_SECRET_REQUIRED" });
    expect(prisma.integrationConfig.upsert).not.toHaveBeenCalled();
  });

  it("resolves the saved config through IntegrationService in system-managed mode", async () => {
    enableSystemManaged();
    const { prisma } = mockPrisma({ workspaceId: "system-workspace-id" });
    const service = new IntegrationService(prisma, keySource);
    await service.saveIntegrationConfig({
      workspaceId: "system-workspace-id",
      userId: "admin",
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", baseUrl: "https://openspeech.bytedance.com", resourceId: "volc.bigasr.auc_turbo", apiKey: "saved-secret-9999" },
    });
    const status = await service.getIntegrationStatus("any-workspace", "DOUBAO_ASR");
    expect(status).toMatchObject({ status: "CONFIGURED", configured: true, lastFour: "9999" });
    expect(JSON.stringify(status)).not.toContain("saved-secret-9999");
    const decrypted = await service.getDecryptedIntegrationConfig("any-workspace", "DOUBAO_ASR");
    expect(decrypted).toMatchObject({ apiKey: "saved-secret-9999", protocol: "RECORDING_FILE_2_0" });
  });
});
