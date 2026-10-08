import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ context: vi.fn(), decrypt: vi.fn(), fetch: vi.fn(), test: vi.fn() }));
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: calls.context, apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
vi.mock("@content-center/integrations", () => ({ IntegrationService: class { getDecryptedIntegrationConfig = calls.decrypt; }, systemManagedProvidersEnabled: () => false }));
vi.mock("@content-center/providers", async () => ({ isLocalReviewOffline: (await import("../../../packages/providers/src/review-policy")).isLocalReviewOffline, providerFetch: calls.fetch }));
vi.mock("@/server/integration-test", () => ({ testIntegration: calls.test }));
vi.mock("@/server/account-api", () => ({ rejectCrossOrigin: () => null }));
vi.mock("@/server/integration-api", () => ({ configurableProviderOrResponse: () => ({ provider: "LLM" }), integrationApiError: () => Response.json({ error: "FAILED" }, { status: 500 }) }));
import { GET } from "../app/api/integrations/LLM/models/route";
import { POST } from "../app/api/integrations/[provider]/test/route";
const routes = [{ name: "模型列表", run: () => GET() }, { name: "连接测试", run: () => POST(new Request("http://localhost:3020/api/integrations/LLM/test", { method: "POST", body: "{}" }), { params: Promise.resolve({ provider: "LLM" }) }) }];
async function responseFor(route: typeof routes[number]) { const response = await route.run(); if (!response) throw Error("ROUTE_RETURNED_NO_RESPONSE"); return response; }
beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_ID", "LOCAL_TEST"); vi.stubEnv("EXTERNAL_CALLS_DISABLED", "false"); vi.stubEnv("LOCAL_REVIEW_OFFLINE", "false");
  calls.context.mockResolvedValue({ workspace: { id: "fixture-workspace" }, role: "OWNER" });
  calls.decrypt.mockResolvedValue({ baseUrl: "https://provider.example.invalid", apiKey: "synthetic-fixture-only" });
  calls.fetch.mockResolvedValue(Response.json({ data: [{ id: "fixture-model" }] }));
  calls.test.mockResolvedValue({ ok: true, message: "fixture-only" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe.each(routes)("$name policy diagnostics", route => {
  it.each(["EXTERNAL_CALLS_DISABLED", "LOCAL_REVIEW_OFFLINE", "ENVIRONMENT_ID"])("reports %s before credential access or external work", async flag => {
    vi.stubEnv(flag, flag === "ENVIRONMENT_ID" ? "LOCAL_REVIEW" : "true");
    const response = await responseFor(route);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "EXTERNAL_CALLS_DISABLED", message: expect.stringContaining("配置仍可查看和保存") });
    expect(calls.decrypt).not.toHaveBeenCalled(); expect(calls.fetch).not.toHaveBeenCalled(); expect(calls.test).not.toHaveBeenCalled();
  });
  it.each([null, "VIEWER", "EDITOR"])("preserves auth and permission rejection for %s", async role => {
    vi.stubEnv("EXTERNAL_CALLS_DISABLED", "true");
    calls.context.mockResolvedValue(role === null ? null : { workspace: { id: "fixture-workspace" }, role });
    const response = await responseFor(route);
    expect(response.status).toBe(role === null ? 401 : 403);
    expect((await response.json()).error).toBe(role === null ? "UNAUTHORIZED" : "FORBIDDEN");
    expect(calls.decrypt).not.toHaveBeenCalled(); expect(calls.fetch).not.toHaveBeenCalled(); expect(calls.test).not.toHaveBeenCalled();
  });
  it("preserves allowed path using only synthetic mocked dependencies", async () => {
    const response = await responseFor(route); expect(response.status).toBe(200);
    if (route.name === "模型列表") expect(await response.json()).toEqual({ items: [{ id: "fixture-model", label: "fixture-model" }] });
    else expect(await response.json()).toMatchObject({ ok: true });
  });
});
it("keeps unconfigured model diagnosis when external policy permits", async () => {
  calls.decrypt.mockResolvedValue(null); const response = await GET(); expect(response.status).toBe(409); expect((await response.json()).error).toBe("NOT_CONFIGURED"); expect(calls.fetch).not.toHaveBeenCalled();
});

it("uses shared configuration error handling instead of misreporting a model network failure", async () => {
  calls.decrypt.mockRejectedValue(new Error("synthetic configuration failure"));
  const response = await GET(); expect(response.status).toBe(500);
  expect((await response.json()).error).toBe("FAILED"); expect(calls.fetch).not.toHaveBeenCalled();
});
it.each([401,403])("distinguishes upstream directory authorization %s from local role rejection", async status => {
  calls.fetch.mockResolvedValue(new Response(null,{status}));
  const response=await GET(); expect(response.status).toBe(502);
  expect((await response.json()).error).toBe("MODEL_LIST_AUTH_FAILED");
});
it("distinguishes directory timeout without exposing raw provider errors", async()=>{
  calls.fetch.mockRejectedValue(Object.assign(new Error("synthetic-only"),{name:"TimeoutError"}));
  const response=await GET(); expect(response.status).toBe(504);
  const body=await response.json();expect(body.error).toBe("MODEL_LIST_TIMEOUT");expect(JSON.stringify(body)).not.toContain("synthetic-only");
});
