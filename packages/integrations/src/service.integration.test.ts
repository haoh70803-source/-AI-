import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IntegrationService } from "./service";

describe("IntegrationService integration", () => {
  const runId = randomUUID();
  const userId = `integration-admin-${runId}`;
  const plaintext = `fake-admin-secret-${randomUUID()}`;
  const replacementSecret = `replacement-secret-${randomUUID()}`;
  const key = randomBytes(32).toString("base64");
  const service = new IntegrationService(db, () => key);
  let workspaceId = "";

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "Integration Admin", email: `${userId}@example.test` } });
    const workspace = await db.workspace.create({
      data: {
        name: "Integration Test",
        slug: `integration-${runId}`,
        members: { create: { userId, role: "ADMIN" } },
      },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("stores an ADMIN-provided RedFox key encrypted and only exposes public data", async () => {
    const publicResult = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "REDFOX",
      config: { baseUrl: "https://example.invalid", apiKey: plaintext },
    });
    expect(publicResult).toMatchObject({ status: "CONFIGURED", configured: true, lastFour: plaintext.slice(-4) });
    expect(JSON.stringify(publicResult)).not.toContain(plaintext);

    const stored = await db.integrationConfig.findUniqueOrThrow({
      where: { workspaceId_provider: { workspaceId, provider: "REDFOX" } },
    });
    expect(stored.encryptedConfig).not.toContain(plaintext);
    expect(JSON.stringify(stored.publicConfig)).not.toContain(plaintext);
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "REDFOX")).resolves.toEqual({
      baseUrl: "https://example.invalid",
      apiKey: plaintext,
    });

    await expect(service.disableIntegration({ workspaceId, userId, provider: "REDFOX" })).resolves.toMatchObject({ status: "DISABLED" });
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "REDFOX")).resolves.toBeNull();
    await expect(service.enableIntegration({ workspaceId, userId, provider: "REDFOX" })).resolves.toMatchObject({ status: "CONFIGURED" });

    const audits = await db.auditLog.findMany({ where: { workspaceId, resourceId: stored.id } });
    expect(JSON.stringify(audits)).not.toContain(plaintext);
    expect(audits.map((audit) => audit.action)).toEqual(expect.arrayContaining([
      "integration.created",
      "integration.disabled",
      "integration.enabled",
    ]));
    expect(audits).toHaveLength(3);
  });

  it("fails closed without a master key and does not create a plaintext row", async () => {
    const withoutKey = new IntegrationService(db, () => undefined);
    await expect(withoutKey.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "LLM",
      config: {
        integrationType: "KIMI",
        productModel: "KIMI_2_6",
        baseUrl: "https://example.invalid/v1",
        apiKey: "must-never-be-stored",
        apiModelId: "example-model",
      },
    })).rejects.toThrow("Secret encryption is not configured");
    await expect(db.integrationConfig.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: "LLM" } },
    })).resolves.toBeNull();
  });

  it("stores the current Doubao API key encrypted and exposes only protocol defaults", async () => {
    const apiKey = `doubao-${randomUUID()}`;
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "DOUBAO_ASR",
      config: { authMode: "API_KEY", apiKey },
    });
    expect(result).toMatchObject({
      status: "CONFIGURED",
      configured: true,
      publicConfig: {
        authMode: "API_KEY",
        baseUrl: "https://openspeech.bytedance.com",
        resourceId: "volc.bigasr.auc_turbo",
      },
      lastFour: apiKey.slice(-4),
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    const stored = await db.integrationConfig.findUniqueOrThrow({
      where: { workspaceId_provider: { workspaceId, provider: "DOUBAO_ASR" } },
    });
    expect(stored.encryptedConfig).not.toContain(apiKey);
    expect(JSON.stringify(stored.publicConfig)).not.toContain(apiKey);
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "DOUBAO_ASR")).resolves.toMatchObject({ apiKey });
  });

  it("stores the transcription product policy without requiring or fabricating a secret", async () => {
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "TRANSCRIPTION",
      config: { source: "LOCAL_FUNASR", qualityMode: "BALANCED", selectionMode: "AUTO", fallbackToDoubao: false },
    });
    expect(result).toMatchObject({
      status: "CONFIGURED",
      configured: true,
      lastFour: null,
      publicConfig: { source: "LOCAL_FUNASR", qualityMode: "BALANCED", selectionMode: "AUTO", fallbackToDoubao: false },
    });
    const stored = await db.integrationConfig.findUniqueOrThrow({
      where: { workspaceId_provider: { workspaceId, provider: "TRANSCRIPTION" } },
    });
    expect(stored.encryptedConfig).toBeNull();
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "TRANSCRIPTION")).resolves.toMatchObject({
      source: "LOCAL_FUNASR",
      qualityMode: "BALANCED",
    });
  });

  it("preserves the streaming protocol and encrypted key when public settings are saved without a new key", async () => {
    const apiKey = `streaming-${randomUUID()}`;
    await service.saveIntegrationConfig({workspaceId,userId,provider:"DOUBAO_ASR",config:{apiKey,protocol:"STREAMING_2_0",resourceId:"volc.seedasr.sauc.duration"}});
    const saved = await service.saveIntegrationConfig({workspaceId,userId,provider:"DOUBAO_ASR",config:{resourceId:"volc.seedasr.sauc.duration"}});
    expect(saved.publicConfig).toMatchObject({protocol:"STREAMING_2_0",resourceId:"volc.seedasr.sauc.duration"});
    expect(JSON.stringify(saved)).not.toContain(apiKey);
    await expect(service.getDecryptedIntegrationConfig(workspaceId,"DOUBAO_ASR")).resolves.toMatchObject({apiKey,protocol:"STREAMING_2_0"});
  });

  it("requires an explicit key when the RedFox destination changes", async () => {
    await expect(service.saveIntegrationConfig({ workspaceId, userId, provider: "REDFOX", config: { baseUrl: "https://changed.example.invalid" } })).rejects.toMatchObject({ code: "INTEGRATION_SECRET_REQUIRED" });
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "REDFOX",
      config: { baseUrl: "https://changed.example.invalid", apiKey: plaintext },
    });
    expect(result).toMatchObject({ publicConfig: { baseUrl: "https://changed.example.invalid" }, lastFour: plaintext.slice(-4) });
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "REDFOX")).resolves.toEqual({
      baseUrl: "https://changed.example.invalid",
      apiKey: plaintext,
    });
  });

  it("replaces the RedFox secret and updates lastFour without exposing plaintext", async () => {
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "REDFOX",
      config: { baseUrl: "https://changed.example.invalid", apiKey: replacementSecret },
    });
    expect(result.lastFour).toBe(replacementSecret.slice(-4));
    expect(JSON.stringify(result)).not.toContain(replacementSecret);
    const stored = await db.integrationConfig.findUniqueOrThrow({
      where: { workspaceId_provider: { workspaceId, provider: "REDFOX" } },
    });
    expect(stored.encryptedConfig).not.toContain(replacementSecret);
    const audits = await db.auditLog.findMany({ where: { workspaceId, resourceId: stored.id } });
    expect(JSON.stringify(audits)).not.toContain(replacementSecret);
  });

  it("stores Kimi provider and model separately while keeping the legacy input compatible", async () => {
    const apiKey = `kimi-${randomUUID()}`;
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "LLM",
      config: {
        integrationType: "KIMI",
        productModel: "KIMI_2_6",
        baseUrl: "https://kimi.example.invalid/v1",
        apiKey,
        apiModelId: "workspace-confirmed-model-id",
      },
    });
    expect(result).toMatchObject({
      publicConfig: { provider: "KIMI", modelId: "workspace-confirmed-model-id", legacyProductModel: "KIMI_2_6" },
      lastFour: apiKey.slice(-4),
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "LLM")).resolves.toMatchObject({
      provider: "KIMI",
      baseUrl: "https://kimi.example.invalid/v1",
      apiKey,
      model: "workspace-confirmed-model-id",
      modelId: "workspace-confirmed-model-id",
      requestedModel: "workspace-confirmed-model-id",
      mode: "REAL",
    });
  });

  it("keeps a missing API model ID unconfigured without discarding the encrypted secret", async () => {
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "LLM",
      config: {
        integrationType: "KIMI",
        productModel: "KIMI_2_6",
        baseUrl: "https://kimi.example.invalid/v1",
        apiModelId: "",
      },
    });
    expect(result).toMatchObject({ status: "UNCONFIGURED", configured: false, lastFour: expect.any(String) });
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "LLM")).resolves.toBeNull();
  });

  it("marks legacy alternate/custom configuration for reconfiguration without deleting its secret", async () => {
    const before = await db.integrationConfig.findUniqueOrThrow({
      where: { workspaceId_provider: { workspaceId, provider: "LLM" } },
    });
    await db.integrationConfig.update({
      where: { id: before.id },
      data: {
        status: "CONFIGURED",
        configured: true,
        publicConfig: { provider: "kimi", label: "legacy-alternate", modelId: "legacy-model-id" },
      },
    });
    await expect(service.getIntegrationStatus(workspaceId, "LLM")).resolves.toMatchObject({
      status: "NEEDS_RECONFIGURATION",
      configured: false,
    });
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "LLM")).resolves.toBeNull();
    const after = await db.integrationConfig.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.encryptedConfig).toBe(before.encryptedConfig);
  });

  it("stores a Workspace-scoped DeepSeek key and requires a new secret when switching provider", async () => {
    await expect(service.saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { provider: "DEEPSEEK", modelId: "deepseek-v4-pro" } })).rejects.toMatchObject({ code: "INTEGRATION_SECRET_REQUIRED" });
    const apiKey = `deepseek-${randomUUID()}`;
    const result = await service.saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { provider: "DEEPSEEK", modelId: "deepseek-v4-pro", apiKey } });
    expect(result).toMatchObject({ status: "CONFIGURED", publicConfig: { provider: "DEEPSEEK", modelId: "deepseek-v4-pro", baseUrl: "https://api.deepseek.com" }, lastFour: apiKey.slice(-4) });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    const stored = await db.integrationConfig.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId, provider: "LLM" } } });
    expect(stored.encryptedConfig).not.toContain(apiKey);
    expect(JSON.stringify(stored.publicConfig)).not.toContain(apiKey);
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "LLM")).resolves.toMatchObject({ provider: "DEEPSEEK", model: "deepseek-v4-pro", requestedModel: "deepseek-v4-pro", apiKey });
  });

  it("keeps an explicit fixture in MOCK state instead of presenting it as real Kimi", async () => {
    const result = await service.saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "LLM",
      mode: "FIXTURE",
      config: {
        provider: "fixture-openai-compatible",
        baseUrl: "http://127.0.0.1:4311/v1",
        apiKey: "fixture-secret",
        model: "fixture-model",
      },
    });
    expect(result).toMatchObject({ status: "MOCK", configured: false, publicConfig: { integrationType: "FIXTURE", productModel: "FIXTURE" } });
    await expect(service.getDecryptedIntegrationConfig(workspaceId, "LLM")).resolves.toMatchObject({
      provider: "fixture-openai-compatible",
      model: "fixture-model",
      mode: "FIXTURE",
    });
  });

  it("isolates provider configuration by Workspace", async () => {
    const otherUserId = `other-integration-${runId}`;
    const otherSecret = `other-workspace-${randomUUID()}`;
    await db.user.create({ data: { id: otherUserId, name: "Other Admin", email: `${otherUserId}@example.test` } });
    const otherWorkspace = await db.workspace.create({
      data: { name: "Other Integration Test", slug: `other-${runId}`, members: { create: { userId: otherUserId, role: "OWNER" } } },
    });
    try {
      await service.saveIntegrationConfig({
        workspaceId: otherWorkspace.id,
        userId: otherUserId,
        provider: "REDFOX",
        config: { baseUrl: "https://other.example.invalid", apiKey: otherSecret },
      });
      await expect(service.getDecryptedIntegrationConfig(workspaceId, "REDFOX")).resolves.toMatchObject({ apiKey: replacementSecret });
      await expect(service.getDecryptedIntegrationConfig(otherWorkspace.id, "REDFOX")).resolves.toEqual({ baseUrl: "https://other.example.invalid", apiKey: otherSecret });
    } finally {
      await db.workspace.delete({ where: { id: otherWorkspace.id } });
      await db.user.delete({ where: { id: otherUserId } });
    }
  });
});
