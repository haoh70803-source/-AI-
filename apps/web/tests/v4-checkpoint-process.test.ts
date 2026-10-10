import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/knowledge/feishu-context", () => ({ feishuContextItems: async () => [], feishuLinks: () => "" }));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { runProjectAssistant } from "../server/assistant/service";
it.skipIf(!process.env.V4_CHECKPOINT_ACTOR)("exits the isolated worker after a persisted checkpoint without running finalizers", async () => {
  const actor = JSON.parse(process.env.V4_CHECKPOINT_ACTOR!);
  const provider = new MockLLMProvider(() => "unused");
  provider.streamText = async (_input, options) => {
    await options?.onDelta?.("硬中断恢复片段。".repeat(400));
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const message = await db.assistantMessage.findFirst({ where: { thread: { workspaceId: actor.workspaceId, projectId: actor.projectId, createdById: actor.userId }, status: "STREAMING", content: { contains: "硬中断恢复片段" } } });
      if (message) process.kill(process.pid, "SIGKILL");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("checkpoint was not persisted");
  };
  await runProjectAssistant({ ...actor, content: "写长文本，验证进程中断", skillVersionIds: [] }, () => {}, { runtime: { provider, providerName: "MOCK", model: "checkpoint", mode: "MOCK" } });
  expect.fail("the worker must exit without a normal completion");
}, 20000);
