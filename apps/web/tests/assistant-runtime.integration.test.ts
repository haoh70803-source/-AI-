import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import type { LLMGenerateInput } from "@content-center/providers";
import { getProjectAssistantThread, runProjectAssistant } from "../server/assistant/service";
import { recallAssistantMemory } from "../server/assistant/memory";
import { assertAssistantCapacity } from "../server/assistant/capacity";
const suffix = randomUUID(), users = Array.from({ length: 6 }, (_, i) => `runtime-${suffix}-${i}`);
let workspaceId = "", projectId = "";
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("content_center_agent_test")) throw Error("ISOLATED_AGENT_DATABASE_REQUIRED");
  await db.user.createMany({ data: users.map(id => ({ id, email: `${id}@test.invalid`, name: "Runtime fixture" })) });
  workspaceId = (await db.workspace.create({ data: { name: "Runtime fixture", slug: suffix, members: { create: users.map(userId => ({ userId, role: "OWNER" as const })) } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: users[0]!, title: "客户沟通" } })).id;
});
afterAll(async () => {
  if (workspaceId) {
    await db.verification.deleteMany({ where: { id: { in: users.map(userId => "auth-rate:" + createHash("sha256").update(`assistant:${workspaceId}:${userId}`).digest("hex")) } } });
    await db.workspace.delete({ where: { id: workspaceId } });
  }
  await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
});
it("recalls a year-old preference beyond 90 newer messages, without leaking another user's history", async () => {
  const userId = users[0]!;
  const runtime = { provider: new MockLLMProvider(() => "完成"), providerName: "MOCK", model: "fixture", mode: "MOCK" as const };
  await runProjectAssistant({ workspaceId, projectId, userId, content: "开始创作" }, () => {}, { runtime });
  const thread = await getProjectAssistantThread({ workspaceId, projectId, userId });
  const old = await db.assistantMessage.create({ data: { threadId: thread.id, role: "USER", content: "记住，客户沟通稿避免用承诺效果的标题 OLD_PREFERENCE", status: "COMPLETED", createdAt: new Date("2025-01-01") } });
  await db.assistantMessage.createMany({ data: Array.from({ length: 90 }, (_, i) => ({ threadId: thread.id, role: "USER" as const, content: `普通历史记录 ${i}`, status: "COMPLETED" as const, createdAt: new Date(Date.now() - 100_000 + i * 1000) })) });
  const cache = { get: async () => null, set: async () => {} };
  const found = await recallAssistantMemory({ workspaceId, projectId, userId, threadId: thread.id, query: "客户沟通", excludeIds: [], before: new Date() }, { cache });
  expect(found.items.some(item => item.objectId === old.id)).toBe(true);
  await expect(recallAssistantMemory({ workspaceId, projectId, userId: users[1]!, threadId: thread.id, query: "客户沟通", excludeIds: [], before: new Date() }, { cache })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});
it("atomically admits only three simultaneous users and releases slots on completion", async () => {
  vi.stubEnv("ASSISTANT_GLOBAL_CONCURRENCY", "3"); vi.stubEnv("ASSISTANT_WORKSPACE_CONCURRENCY", "3");
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); let started = 0; let rejected = 0;
  const provider = new MockLLMProvider(() => "已完成客户沟通稿"), base = provider.streamText.bind(provider);
  provider.streamText = async (input, options) => { started += 1; await gate; return base(input, options); };
  const runtime = { provider, providerName: "MOCK", model: "fixture", mode: "MOCK" as const };
  const pending = users.map(userId => runProjectAssistant({ workspaceId, projectId, userId, content: "写客户沟通稿" }, () => {}, { runtime }).then(value => ({ value }), error => { rejected += 1; return { error }; }));
  try { await expect.poll(() => started).toBe(3); await expect.poll(() => rejected).toBe(3); expect(await db.assistantMessage.count({ where: { thread: { workspaceId }, status: { in: ["PENDING", "STREAMING"] } } })).toBe(3); }
  finally { finish(); }
  const results = await Promise.all(pending);
  expect(results.filter(result => "value" in result && result.value.status === "COMPLETED")).toHaveLength(3);
  expect(results.filter(result => "error" in result && result.error.code === "RATE_LIMITED")).toHaveLength(3);
  await expect(db.$transaction(tx => assertAssistantCapacity(tx, { workspaceId, userId: users[0]! }))).resolves.toBeUndefined();
  vi.unstubAllEnvs();
});

it("preserves a creative task and user scene beyond recent dialogue, with native roles and deletion checks", async () => {
  const captured: LLMGenerateInput[] = [];
  const runtime = { provider: new MockLLMProvider(input => { captured.push(input); return "请告诉我发生了什么。"; }), providerName: "MOCK", model: "fixture", mode: "MOCK" as const };
  const actor = { workspaceId, projectId, userId: users[2]! };
  const instruction = "帮我把一件日常小事写成朋友圈文案。50字以内简短版、约120字叙事版、配图建议。根据真实场景和感受，不替我编故事。";
  await runProjectAssistant({ ...actor, content: instruction }, () => {}, { runtime });
  await runProjectAssistant({ ...actor, content: "煮泡面发现鸡蛋没了，清汤寡水吃完，居然挺满足" }, () => {}, { runtime });
  for (let i = 0; i < 6; i++) await runProjectAssistant({ ...actor, content: "短一点" }, () => {}, { runtime });
  expect(captured.at(-1)?.messages?.[0]).toEqual({ role: "user", content: instruction });
  expect(captured.at(-1)?.messages?.some(m => m.role === "user" && m.content.includes("居然挺满足"))).toBe(true);
  expect(captured.at(-1)?.messages?.some(m => m.role === "assistant")).toBe(true);
  expect(captured.at(-1)?.prompt).not.toContain('"objectType":"ASSISTANT_MESSAGE"');
  const thread = await getProjectAssistantThread(actor);
  const original = thread.messages.find(m => m.role === "USER" && m.content === instruction)!;
  await db.assistantMessage.delete({ where: { id: original.id } });
  await runProjectAssistant({ ...actor, content: "短一点" }, () => {}, { runtime });
  expect(captured.at(-1)?.messages?.some(m => m.content === instruction)).toBe(false);
});
