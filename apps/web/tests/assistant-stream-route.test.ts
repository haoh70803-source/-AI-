import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ context: vi.fn(), thread: vi.fn(), run: vi.fn() }));
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: calls.context, apiError: (error: string, status: number) => Response.json({ error }, { status }) }));
vi.mock("@/server/assistant/api", () => ({ assistantApiError: (error: { code?: string; message?: string }) => Response.json({ error: error.code || "UNKNOWN", message: error.message }, { status: error.code === "RATE_LIMITED" ? 429 : 500 }) }));
vi.mock("@/server/assistant/service", () => ({ getProjectAssistantThread: calls.thread, runProjectAssistant: calls.run }));
import { POST } from "../app/api/projects/[id]/assistant/route";
const route = { params: Promise.resolve({ id: "project" }) };
const request = () => new Request("http://localhost:3022/api/projects/project/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "写一版客户沟通口播" }) });
beforeEach(() => { calls.context.mockResolvedValue({ workspace: { id: "workspace" }, session: { user: { id: "user" } } }); calls.thread.mockResolvedValue({ id: "thread", messages: [] }); });
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
it("streams connection, real progress and text before the generation promise finishes", async () => {
  let finish!: () => void;
  calls.run.mockImplementation(async (_input, emit) => { emit({ type: "status", status: { code: "MEMORY_READING", message: "正在检索项目历史" } }); emit({ type: "delta", messageId: "message", delta: "客户说再考虑一下" }); await new Promise<void>(resolve => { finish = resolve; }); });
  const response = await POST(request(), route);
  expect(response.headers.get("x-accel-buffering")).toBe("no");
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  const first = decoder.decode((await reader.read()).value); expect(first).toContain(": connected");
  expect(decoder.decode((await reader.read()).value)).toContain("MEMORY_READING");
  expect(decoder.decode((await reader.read()).value)).toContain("客户说再考虑一下");
  finish(); while (!(await reader.read()).done) { /* Drain the closed SSE response. */ }
});
it("keeps the SSE stream alive during slow tools, and cancellation reaches the provider", async () => {
  vi.useFakeTimers(); let signal!: AbortSignal; let finish!: () => void;
  calls.run.mockImplementation(async (input) => { signal = input.signal; await new Promise<void>(resolve => { finish = resolve; }); });
  const response = await POST(request(), route), reader = response.body!.getReader(); await reader.read();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(": heartbeat");
  await reader.cancel(); expect(signal.aborted).toBe(true); finish();
  await vi.advanceTimersByTimeAsync(15_000);
});
it("preserves capacity failures as actionable stream errors rather than generic failures", async () => {
  calls.run.mockRejectedValue({ code: "RATE_LIMITED", message: "任务较多，请稍后重试" });
  const response = await POST(request(), route), body = await response.text();
  expect(body).toContain("RATE_LIMITED"); expect(body).toContain("任务较多");
});
it("rejects unauthorized requests before opening streams", async () => {
  calls.context.mockResolvedValue(null); expect((await POST(request(), route)).status).toBe(401); expect(calls.run).not.toHaveBeenCalled();
});
