import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { IntegrationService, secretLastFour } from "@content-center/integrations";
import { providerFetch } from "@content-center/providers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ModelRouter } from "../server/ai/control/model-router";
import { loadLLMRuntime } from "../server/ai/llm-runtime";
import { testIntegration } from "../server/integration-test";

describe("API secrets and real HTTP connection probe", () => {
  const id = randomUUID(), secret = "fixture-secret-never-return-7F2A";
  const service = new IntegrationService(); let server: Server, origin = "", workspaceId = "", userId = "";
  let status = 200, body: unknown = { choices: [{ message: { content: "OK" } }] }, requests = 0;
  const oldOrigin = process.env.PROVIDER_TEST_ORIGIN;
  beforeAll(async () => {
    server = createServer((req, res) => { requests++; expect(req.headers.authorization).toBe(`Bearer ${secret}`); expect(req.url).toBe("/v1/chat/completions"); res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; process.env.PROVIDER_TEST_ORIGIN = origin;
    userId = (await db.user.create({ data: { email: `probe-${id}@example.test`, name: "Probe" } })).id;
    workspaceId = (await db.workspace.create({ data: { name: "Probe", slug: id, members: { create: { userId, role: "OWNER" } } } })).id;
    await service.saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { provider: "CUSTOM", serviceName: "Fixture", modelId: "test-model", baseUrl: `${origin}/v1`, apiKey: secret } });
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); if (oldOrigin) process.env.PROVIDER_TEST_ORIGIN = oldOrigin; else delete process.env.PROVIDER_TEST_ORIGIN; await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
  it("encrypts, masks, isolates and resolves custom config for business runtime", async () => {
    const publicConfig = await service.getIntegrationStatus(workspaceId, "LLM");
    expect(publicConfig.status).toBe("CONFIGURED"); expect(publicConfig.lastFour).toBe("7F2A"); expect(JSON.stringify(publicConfig)).not.toContain(secret);
    const row = await db.integrationConfig.findFirstOrThrow({ where: { workspaceId } }); expect(row.encryptedConfig).not.toContain(secret);
    expect((await service.getDecryptedIntegrationConfig(workspaceId, "LLM"))?.model).toBe("test-model");
    expect(await service.getDecryptedIntegrationConfig("other-company", "LLM")).toBeNull();
    expect(secretLastFour("abcd")).not.toBe("abcd");
  });
  it("actually sends a minimal model request", async () => { expect(await testIntegration(workspaceId, "LLM", undefined, service)).toMatchObject({ ok: true }); expect(requests).toBe(1); });
  it("uses the saved custom company service through the existing business model router", async () => {
    const route = await new ModelRouter((id, selection) => loadLLMRuntime(id, service, selection)).route(workspaceId, { taskType: "GENERAL_QUERY", structuredOutput: true }, { provider: "CUSTOM", modelId: "test-model" });
    expect(route.receipt.workspaceEngine).toBe("CUSTOM");
    expect(route.receipt.selectedModel).toBe("test-model");
    const result = await route.runtime.provider.generateText({ prompt: "Hello" });
    expect(result.data.text).toBe("OK");
    expect(requests).toBe(2);
  });
  it("returns safe Chinese failures without reflecting provider errors or secrets", async () => {
    for (const code of [401, 402, 404, 429, 503]) { status = code; body = { error: { message: secret, code: "insufficient_quota" } }; const result = await testIntegration(workspaceId, "LLM", undefined, service); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(secret); }
    status = 200; body = { message: "fake success" }; expect((await testIntegration(workspaceId, "LLM", undefined, service)).ok).toBe(false);
  });
  it("blocks private and redirect credential destinations", async () => {
    await expect(providerFetch("https://127.0.0.1/v1")).rejects.toThrow();
    await expect(providerFetch("https://[::ffff:7f00:1]/v1")).rejects.toThrow();
    status = 302; await expect(providerFetch(`${origin}/v1/chat/completions`, { headers: { authorization: `Bearer ${secret}` } })).rejects.toThrow();
  });
  it("requires a new key when the destination changes and does not call disabled services", async () => {
    await expect(service.saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { provider: "CUSTOM", serviceName: "Changed", modelId: "test-model", baseUrl: "https://different.example/v1" } })).rejects.toMatchObject({ code: "INTEGRATION_SECRET_REQUIRED" });
    await service.disableIntegration({ workspaceId, userId, provider: "LLM" }); const before = requests;
    expect((await testIntegration(workspaceId, "LLM", undefined, service)).ok).toBe(false); expect(requests).toBe(before);
  });
});
