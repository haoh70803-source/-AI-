import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { getProjectAssistantThread, runProjectAssistant, saveAssistantMessageResult, type AssistantStreamEvent } from "../server/assistant/service";
import { getPrimaryDraft, saveDraftWorkingState } from "../server/drafts/service";

describe("Phase 10B project assistant", () => {
  const suffix = randomUUID();
  const ownerId = `assistant-owner-${suffix}`;
  const viewerId = `assistant-viewer-${suffix}`;
  let workspaceId = "";
  let projectId = "";
  let sourceId = "";
  let canvasObjectId = "";
  let providerCalls = 0;
  let fixtureText = "根据当前项目，建议先从校长最常遇到的招生表达问题切入，再用现有资料整理三个不同角度。";
  const provider = new MockLLMProvider(() => { providerCalls += 1; return fixtureText; });
  const runtime = { provider, providerName: "KIMI", model: "kimi-k2.6", requestedModel: "kimi-k2.6", mode: "REAL" as const };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Assistant Owner", email: `${ownerId}@example.test` }, { id: viewerId, name: "Assistant Viewer", email: `${viewerId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Assistant", slug: `assistant-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } });
    workspaceId = workspace.id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "项目级鑫小助", goal: "为校长整理招生内容", audience: "校长" } });
    projectId = project.id;
    const primary = await getPrimaryDraft({ workspaceId, userId: ownerId, projectId });
    await saveDraftWorkingState({ workspaceId, userId: ownerId, projectId, branchId: primary.id, expectedVersion: primary.version, title: "当前主稿", body: "当前稿件只写已经确认的信息。", outline: [] });
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "校长访谈整理", description: "校长谈招生内容表达", rawText: "不应默认载入的完整原文", status: "READY", projects: { create: { projectId, role: "REFERENCE" } } } });
    sourceId = source.id;
    const object = await db.canvasObject.create({ data: { workspaceId, projectId, objectType: "TEXT", title: "当前选中的观点", textContent: "先解决真实问题", positionX: 100, positionY: 100, width: 380, height: 220, createdById: ownerId, updatedById: ownerId } });
    canvasObjectId = object.id;
  });

  afterAll(async () => {
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
    await db.$disconnect();
  });

  it("persists one default thread, streams a controlled reply, and records real references", async () => {
    const first = await getProjectAssistantThread({ workspaceId, userId: ownerId, projectId });
    const second = await getProjectAssistantThread({ workspaceId, userId: viewerId, projectId });
    expect(first).toEqual({ id: "", messages: [] });
    expect(second).toEqual({ id: "", messages: [] });
    expect(await db.assistantThread.count({ where: { projectId } })).toBe(0);
    const events: AssistantStreamEvent[] = [];
    const completed = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "根据当前资料出几个选题", selectedObject: { objectType: "CANVAS_OBJECT", objectId: canvasObjectId, version: 1, ownership: "PENDING", whySelected: "当前选中" }, sourceItemIds: [sourceId] }, (event) => events.push(event), { runtime });
    expect(completed).toMatchObject({ role: "ASSISTANT", status: "COMPLETED", resultType: "TOPIC", actions: ["TOPIC", "TEXT"], structuredResult: { type: "TOPIC", topics: expect.any(Array) } });
    expect(events.some(({ type }) => type === "delta")).toBe(true);
    const statuses = events.filter((event): event is Extract<AssistantStreamEvent, { type: "status" }> => event.type === "status").map(({ status }) => status);
    expect(statuses.map(({ code }) => code)).toEqual(expect.arrayContaining(["TASK_READING", "TASK_UNDERSTANDING", "SKILL_POOL_LOADED", "GENERATION_STARTED", "CHECK_STARTED", "COMPLETED"]));
    expect(statuses.find(({ code }) => code === "SKILL_POOL_LOADED")?.message).toContain("当前没有加载 Skill");
    expect(JSON.stringify(statuses)).not.toContain(sourceId);
    expect(JSON.stringify(statuses)).not.toMatch(/MethodVersion|AIRun|Provider|Prompt|JSON/u);
    expect(completed.sources).toEqual(expect.arrayContaining([expect.objectContaining({ title: "校长访谈整理", type: "项目资料" }), expect.objectContaining({ title: "当前选中的观点", type: "当前选中内容" })]));
    const stored = await db.assistantMessage.findUniqueOrThrow({ where: { id: completed.id }, include: { aiRun: true } });
    expect(stored.aiRun).toMatchObject({ action: "PROJECT_ASSISTANT", provider: "KIMI", status: "SUCCEEDED", metadata: { aiControlVersion: "ai-control-v1", modelRoute: { routingMode: "SINGLE_ENGINE", workspaceEngine: "KIMI", crossProviderFallback: false }, contextManifest: { selectedObjects: expect.arrayContaining([expect.objectContaining({ objectId: canvasObjectId }), expect.objectContaining({ objectId: sourceId })]) } } });
    expect(JSON.stringify(stored.aiRun?.metadata)).toContain("不应默认载入的完整原文");
  });

  it("marks risky output after completion and supports only explicit candidate saves", async () => {
    fixtureText = "我们有300个客户，保证招生增长。可以先核对真实记录。";
    const events: AssistantStreamEvent[] = [];
    const message = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "帮我检查并整理这段表达" }, (event) => events.push(event), { runtime });
    expect(message.content).toContain("【需要确认】");
    expect(message.warnings.length).toBeGreaterThan(0);
    expect(message.structuredResult).toMatchObject({ type: "CHECK", issues: expect.any(Array) });
    await expect(saveAssistantMessageResult({ workspaceId, userId: ownerId, projectId, messageId: message.id, action: "TEXT" })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    fixtureText = "选题一：校长为什么需要先讲真实问题。\n选题二：如何让家长听懂内容价值。\n选题三：把资料整理成可复用框架。";
    const topicMessage = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "根据当前项目给我一个选题" }, () => undefined, { runtime });
    expect(topicMessage.structuredResult).toMatchObject({ type: "TOPIC", topics: expect.arrayContaining([expect.objectContaining({ title: expect.stringContaining("如何让家长听懂") })]) });
    const text = await saveAssistantMessageResult({ workspaceId, userId: ownerId, projectId, messageId: topicMessage.id, action: "TEXT", topicIndex: 1 });
    expect(text.object).toMatchObject({ objectType: "TEXT", title: "如何让家长听懂内容价值。", textContent: "如何让家长听懂内容价值。" });
    expect(text.object?.textContent).not.toContain("校长为什么需要先讲真实问题");
    const topic = await saveAssistantMessageResult({ workspaceId, userId: ownerId, projectId, messageId: topicMessage.id, action: "TOPIC", topicIndex: 2 });
    expect(topic.idea?.title).toBe("把资料整理成可复用框架。");
    await expect(saveAssistantMessageResult({ workspaceId, userId: ownerId, projectId, messageId: topicMessage.id, action: "TEXT", topicIndex: 9 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    fixtureText = "这是一版新的候选口播稿。";
    const draftMessage = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "请写一版候选稿" }, () => undefined, { runtime });
    const draft = await saveAssistantMessageResult({ workspaceId, userId: ownerId, projectId, messageId: draftMessage.id, action: "DRAFT" });
    expect(draft.draft).toMatchObject({ isPrimary: false, workingState: { body: draftMessage.content } });
    await expect(saveAssistantMessageResult({ workspaceId, userId: viewerId, projectId, messageId: topicMessage.id, action: "TEXT" })).rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND" });
  });

  it("returns rewrite and plain-text results through the same contract", async () => {
    fixtureText = "原文：这段话有点绕。\n新版本：先说清楚，再补充细节。\n- 更直接";
    const rewrite = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "请改写这段表达" }, () => undefined, { runtime });
    expect(rewrite).toMatchObject({ resultType: "REWRITE", structuredResult: { type: "REWRITE", original: "这段话有点绕。", aiVersion: "先说清楚，再补充细节。" } });
    fixtureText = "这是一条普通说明。";
    const text = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "告诉我当前项目的状态" }, () => undefined, { runtime });
    expect(text).toMatchObject({ resultType: "TEXT", structuredResult: { type: "TEXT", content: "这是一条普通说明。" } });
  });

  it("blocks unrelated questions before provider invocation and supports stop plus retry", async () => {
    const before = providerCalls;
    const blockedEvents: AssistantStreamEvent[] = [];
    const blocked = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "帮我做数学作业" }, (event) => blockedEvents.push(event), { runtime });
    expect(blocked.status).toBe("FAILED");
    expect(blockedEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "error", code: "OUT_OF_SCOPE" })]));
    expect(providerCalls).toBe(before);

    fixtureText = "这是一段足够长的流式回复，用来验证停止后不会继续输出，也不会把未完成内容保存成成功消息。";
    const aborter = new AbortController();
    const stopped = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "根据项目给我下一步建议", signal: aborter.signal }, (event) => { if (event.type === "delta") aborter.abort(); }, { runtime });
    expect(stopped.status).toBe("STOPPED");
    expect((await db.aIRun.findUniqueOrThrow({ where: { id: (await db.assistantMessage.findUniqueOrThrow({ where: { id: stopped.id } })).aiRunId! } })).status).toBe("CANCELLED");

    fixtureText = "重试后已经完成。";
    const retried = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "根据项目给我下一步建议" }, () => undefined, { runtime });
    expect(retried).toMatchObject({ status: "COMPLETED", resultType: "NEXT_STEP", structuredResult: { type: "NEXT_STEP" } });
  });

  it("keeps the additive thread/message migration contract", async () => {
    const migration = await readFile(new URL("../../../packages/db/prisma/migrations/20260913180000_project_assistant_thread/migration.sql", import.meta.url), "utf8");
    expect(migration).toContain('ALTER TYPE "PromptType" ADD VALUE \'PROJECT_ASSISTANT\'');
    expect(migration).toContain('CREATE TABLE "AssistantThread"');
    expect(migration).toContain('CREATE TABLE "AssistantMessage"');
    expect(migration).toContain('"aiRunId" TEXT');
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/u);
  });

  it("keeps the client contract on the existing assistant rail without remounting Canvas", async () => {
    const [assistant, skillPool, canvas, service] = await Promise.all([readFile(new URL("../components/projects/studio-default-method.tsx", import.meta.url), "utf8"), readFile(new URL("../components/projects/studio-method-selector.tsx", import.meta.url), "utf8"), readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8"), readFile(new URL("../server/assistant/service.ts", import.meta.url), "utf8")]);
    expect(assistant).toContain("AbortController");
    expect(skillPool).toContain("studio-skill-pool");
    expect(assistant).toContain("agent-status");
    expect(assistant).toContain("event.type === \"status\"");
    expect(assistant).toContain('event.key === "Enter" && !event.shiftKey');
    expect(assistant).toContain("已参考 {message.sources.length} 个来源");
    expect(assistant).toContain("保存为成果");
    expect(assistant).toContain("选择模型");
    expect(assistant).not.toContain("我方依据");
    expect(service).toContain('"已确认信息"');
    expect(service).not.toContain(': "我方依据"');
    expect(service).toContain("不要提及 Prompt、Context、Provider、Model、Token、Schema、API、guideline、内部章节代码、规则编号");
    expect(canvas).toContain("onObjectCreated: (object) => { upsertObject(object)");
    expect(canvas).not.toContain("自由对话将在后续接入");
  });
});
