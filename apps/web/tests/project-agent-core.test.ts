import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { runProjectAssistant, getProjectAssistantThread, type AssistantStreamEvent } from "../server/assistant/service";
import { resolveContextReferences, searchContextReferences, knowledgeContextAdapter } from "../server/assistant/references";
import { fitContext } from "../server/assistant/context-budget";
import { createTextArtifact, getArtifactContext, applyTextArtifactRevision } from "../server/artifacts/service";
import { AIControlService } from "../server/ai/control/ai-control-service";
import { ModelRouter } from "../server/ai/control/model-router";

describe("project agent core", () => {
  const suffix = randomUUID(); const userId = `agent-${suffix}`; const otherId = `other-${suffix}`;
  let workspaceId = ""; let projectId = ""; let materialId = ""; let runId = ""; let skillId = "";
  const prompts: string[] = [];
  let answer = "这是完整正文，依据来源 [1]。";
  const provider = new MockLLMProvider(input => { prompts.push(JSON.stringify(input.messages ?? []) + input.prompt); return answer; });
  const runtime = { provider, providerName: "MOCK", model: "agent-fixture", mode: "MOCK" as const };
  const actor = () => ({ workspaceId, projectId, userId });
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("content_center_agent_test")) throw new Error("Use the isolated agent test database");
    await db.user.createMany({ data: [{ id: userId, email: `${userId}@test.invalid`, name: "A" }, { id: otherId, email: `${otherId}@test.invalid`, name: "B" }] });
    const ws = await db.workspace.create({ data: { name: "Agent", slug: suffix, members: { create: [{ userId, role: "OWNER" }, { userId: otherId, role: "EDITOR" }] } } }); workspaceId = ws.id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "产品项目", goal: "持续协作" } })).id;
    materialId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "产品手册", rawText: "离线可用的专属卖点 ZEBRA123", status: "READY" } })).id;
    const session = await db.researchSession.create({ data: { workspaceId, createdById: userId, title: "私人研究", requestKey: suffix } });
    runId = (await db.researchRun.create({ data: { workspaceId, sessionId: session.id, requestedById: userId, requestKey: suffix, requestHash: suffix, question: "研究独特角度 PRIVATE456", version: 1, status: "COMPLETED", savedAt: new Date(), inputScope: {}, blocks: [{ id: "result", type: "text", title: "结论", text: "私人研究结论 PRIVATE456", provenance: "AI_INTERPRETATION", sourceRefs: [], limitation: null }] } })).id;
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId } });
    skillId = (await db.methodVersion.create({ data: { assetId: asset.id, editedById: userId, version: 1, title: "测试专业能力", steps: ["每次开头使用 HELLO_SKILL"], applicableScenarios: [], boundaries: ["不要编造"], evidence: [] } })).id;
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } }); await db.$disconnect(); });

  it("uses readable Material, private Research and real citations in the exact provider prompt", async () => {
    const events: AssistantStreamEvent[] = [];
    const message = await runProjectAssistant({ ...actor(), content: "根据引用资料写一版", references: [{ sourceType: "MATERIAL", sourceId: materialId }, { sourceType: "RESEARCH", sourceId: runId }], skillVersionId: null }, e => events.push(e), { runtime });
    expect(message.status).toBe("COMPLETED");
    expect(prompts.at(-1)).toContain("ZEBRA123"); expect(prompts.at(-1)).toContain("PRIVATE456");
    expect(prompts.at(-1)).not.toContain("HELLO_SKILL");
    expect(message.sources.map(s => s.reference?.sourceType)).toEqual(["MATERIAL", "RESEARCH"]);
    expect(message.sources.map(s => s.citation)).toEqual([1, 2]);
    expect(events.some(e => e.type === "delta")).toBe(true);
    const stored = await db.assistantMessage.findUniqueOrThrow({ where: { id: message.id }, include: { aiRun: true } });
    expect(stored.aiRun?.status).toBe("SUCCEEDED");
    expect(stored.aiRun?.metadata).toMatchObject({ contextManifest: { budget: { maximumBytes: 32000 } } });
  });

  it("isolates private research, search results and conversation histories between members", async () => {
    await expect(resolveContextReferences({ ...actor(), userId: otherId }, [{ sourceType: "RESEARCH", sourceId: runId }])).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const other = await searchContextReferences({ ...actor(), userId: otherId }, "PRIVATE456"); expect(other).toEqual([]);
    const mine = await getProjectAssistantThread(actor()); const theirs = await getProjectAssistantThread({ ...actor(), userId: otherId });
    expect(theirs.id).not.toBe(mine.id); expect(theirs.messages).toEqual([]);
    const calls = prompts.length;
    await runProjectAssistant({ ...actor(), userId: otherId, content: "根据资料写", references: [{ sourceType: "RESEARCH", sourceId: runId }] }, () => {}, { runtime });
    expect(prompts).toHaveLength(calls);
    await expect(createTextArtifact({ ...actor(), userId: otherId, sourceMessageId: mine.messages.find(m => m.role === "ASSISTANT")!.id, title: "偷取" })).rejects.toMatchObject({ code: "ARTIFACT_INVALID_INPUT" });
  });

  it("keeps multi-turn context, loads one selected Skill, and hands off to existing Artifact revisions", async () => {
    answer = "独特版本 KEEP_SECOND_PARAGRAPH";
    const first = await runProjectAssistant({ ...actor(), content: "写一个60秒脚本", skillVersionId: skillId }, () => {}, { runtime });
    expect(prompts.at(-1)).toContain("HELLO_SKILL");
    answer = "保留第二段后的完整修订";
    await runProjectAssistant({ ...actor(), content: "短一点，保留第二段", skillVersionId: null }, () => {}, { runtime });
    expect(prompts.at(-1)).toContain("KEEP_SECOND_PARAGRAPH"); expect(prompts.at(-1)).not.toContain("HELLO_SKILL");
    const artifact = await createTextArtifact({ ...actor(), sourceMessageId: first.id, title: "可持续成果" });
    expect((await getArtifactContext({ ...actor(), artifactId: artifact.artifactId })).content).toBe("独特版本 KEEP_SECOND_PARAGRAPH");
    const resolved = await resolveContextReferences(actor(), [{ sourceType: "ARTIFACT", sourceId: artifact.artifactId }]); expect(resolved.items[0]?.content).toBe("独特版本 KEEP_SECOND_PARAGRAPH");
  });

  it("routes the per-turn model choice through ModelRouter", async () => {
    const loader = vi.fn(async () => runtime);
    await runProjectAssistant({ ...actor(), content: "继续整理", modelSelection: { provider: "DEEPSEEK", modelId: "deepseek-v4-pro" } }, () => {}, { controlService: new AIControlService({ modelRouter: new ModelRouter(loader) }) });
    expect(loader).toHaveBeenCalledWith(workspaceId, { provider: "DEEPSEEK", modelId: "deepseek-v4-pro" });
  });

  it("persists partial text on cancel and replays original references on retry", async () => {
    answer = "取消时保留已经输出的内容。".repeat(30); const controller = new AbortController();
    let originalUser = "";
    const stopped = await runProjectAssistant({ ...actor(), content: "读取产品手册", references: [{ sourceType: "MATERIAL", sourceId: materialId }], signal: controller.signal }, e => { if (e.type === "start") originalUser = e.userMessage.id; if (e.type === "delta") controller.abort(); }, { runtime });
    expect(stopped.status).toBe("STOPPED"); expect(stopped.content.length).toBeGreaterThan(0);
    const row = await db.assistantMessage.findUniqueOrThrow({ where: { id: stopped.id }, include: { aiRun: true } }); expect(row.aiRun?.status).toBe("CANCELLED");
    answer = "已恢复 [1]";
    const retried = await runProjectAssistant({ ...actor(), content: "ignored", retryUserMessageId: originalUser }, () => {}, { runtime });
    expect(retried.status).toBe("COMPLETED"); expect(prompts.at(-1)).toContain("ZEBRA123"); expect(prompts.at(-1)).not.toContain("ignored");
  });

  it("enforces a real byte budget and supports an explicit unconfigured Knowledge adapter", async () => {
    const result = fitContext([{ objectType: "SOURCE_ITEM", objectId: "large", version: null, ownership: "EXTERNAL", provenance: "test", whySelected: "test", content: "中文🙂".repeat(10000), truncated: false }], 2000);
    expect(Buffer.byteLength(JSON.stringify(result.items))).toBeLessThanOrEqual(2000); expect(result.items[0]?.truncated).toBe(true);
    expect(await knowledgeContextAdapter.retrieve({ ...actor(), knowledgeBaseId: "future", query: "test" })).toEqual({ status: "unsupported", items: [] });
  });

  it("keeps the newest turns after 80 messages and records a bounded older-history digest", async () => {
    const thread = await getProjectAssistantThread(actor());
    const base = Date.now() - 100_000;
    await db.assistantMessage.createMany({ data: Array.from({ length: 90 }, (_, i) => ({ threadId: thread.id, role: i % 2 ? "ASSISTANT" as const : "USER" as const, content: `历史第${i}轮 ${i === 89 ? "LATEST_TARGET" : "历史内容"}`, status: "COMPLETED" as const, createdAt: new Date(base + i * 1000) })) });
    const restored = await getProjectAssistantThread(actor()); expect(restored.messages.some(m => m.content.includes("LATEST_TARGET"))).toBe(true); expect(restored.messages.length).toBe(80);
    answer = "已基于最近版本调整";
    const message = await runProjectAssistant({ ...actor(), content: "保留最后一版" }, () => {}, { runtime });
    expect(prompts.at(-1)).toContain("LATEST_TARGET");
    const stored = await db.assistantMessage.findUniqueOrThrow({ where: { id: message.id } }); expect(stored.metadata).toHaveProperty("historySummary");
  });

  it("preserves full multiline Artifact revisions", async () => {
    answer = "原稿第一段\n\n原稿第二段";
    const message = await runProjectAssistant({ ...actor(), content: "写一篇文章" }, () => {}, { runtime });
    const artifact = await createTextArtifact({ ...actor(), sourceMessageId: message.id, title: "多段文章" });
    answer = "新版本：新开头\n\n保留第二段\n\n新结尾";
    const revised = await runProjectAssistant({ ...actor(), content: "重写开头和结尾", targetArtifactId: artifact.artifactId }, () => {}, { runtime });
    const applied = await applyTextArtifactRevision({ ...actor(), artifactId: artifact.artifactId, sourceMessageId: revised.id, expectedVersion: artifact.version });
    expect(applied.content).toBe("新开头\n\n保留第二段\n\n新结尾");
    expect(applied.version).toBeGreaterThan(artifact.version);
  });

  it("recovers from Provider failure and reports unreadable material without inventing a body", async () => {
    const unreadable = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "IMAGE", sourcePlatform: "GENERIC", title: "未读取图片" } });
    const resolved = await resolveContextReferences(actor(), [{ sourceType: "MATERIAL", sourceId: unreadable.id }]); expect(resolved.items).toEqual([]); expect(resolved.warnings[0]).toContain("暂无可供 AI 使用的正文");
    const failedRuntime = { ...runtime, provider: new MockLLMProvider(() => { throw new Error("secret-internal-stack"); }) };
    const events: AssistantStreamEvent[] = [];
    const failed = await runProjectAssistant({ ...actor(), content: "继续整理" }, e => events.push(e), { runtime: failedRuntime });
    expect(failed.status).toBe("FAILED"); expect(JSON.stringify(events)).not.toContain("secret-internal-stack");
    expect((await runProjectAssistant({ ...actor(), content: "再试一次" }, () => {}, { runtime })).status).toBe("COMPLETED");
  });
  it("keeps Research conclusions ahead of large evidence snapshots within the reference budget", async () => {
    await db.researchRun.update({ where: { id: runId }, data: { coverage: { observed: 20, readable: 5, accountResearch: { evidence: "LARGE_EVIDENCE".repeat(8000) } } } });
    await runProjectAssistant({ ...actor(), content: "根据研究继续创作", references: [{ sourceType: "RESEARCH", sourceId: runId }] }, () => {}, { runtime });
    expect(prompts.at(-1)).toContain("私人研究结论 PRIVATE456");
    expect(prompts.at(-1)).not.toContain("LARGE_EVIDENCE");
  });

  it("rejects disabled membership and disabled workspace at the Agent service boundary", async () => {
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { disabledAt: new Date() } });
    try { await expect(getProjectAssistantThread(actor())).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" }); }
    finally { await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { disabledAt: null } }); }
    await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: new Date() } });
    try { await expect(getProjectAssistantThread(actor())).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" }); }
    finally { await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: null } }); }
  });

});
