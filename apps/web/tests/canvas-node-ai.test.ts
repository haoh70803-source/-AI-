import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { getNodeAssistantThread, getProjectAssistantThread, runNodeAssistant, type NodeAssistantStreamEvent } from "../server/assistant/service";
import { createCanvasMaterialObject, createCanvasTextObject, listCanvasObjects, softDeleteCanvasObject } from "../server/canvas/service";
import { ContextBuilderV2 } from "../server/ai/control/context-builder-v2";

describe("Phase 10C canvas node AI", () => {
  const suffix = randomUUID(); const ownerId = `node-ai-owner-${suffix}`; const viewerId = `node-ai-viewer-${suffix}`;
  let workspaceId = ""; let projectId = ""; let sourceItemId = ""; let textObjectId = ""; let materialObjectId = ""; let successfulResultId = ""; let providerCalls = 0;
  let fixtureText = "选题一：从真实问题切入。\n选题二：拆解常见误区。\n选题三：给出可执行检查。";
  const provider = new MockLLMProvider(() => { providerCalls += 1; return fixtureText; });
  const runtime = { provider, providerName: "KIMI", model: "kimi-k2.6", requestedModel: "kimi-k2.6", mode: "REAL" as const };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Node AI Owner", email: `${ownerId}@example.test` }, { id: viewerId, name: "Node AI Viewer", email: `${viewerId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Node AI", slug: `node-ai-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } }); workspaceId = workspace.id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "节点 AI 项目", goal: "整理真实内容" } })).id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "真实访谈", description: "外部访谈资料", status: "READY", projects: { create: { projectId, role: "REFERENCE" } } } }); sourceItemId = source.id;
    textObjectId = (await createCanvasTextObject({ workspaceId, userId: ownerId, projectId, title: "原始观点", textContent: "先解决真实问题", layout: { positionX: 100, positionY: 120, width: 360, height: 220, zIndex: 1 } })).id;
    materialObjectId = (await createCanvasMaterialObject({ workspaceId, userId: ownerId, projectId, objectType: "MATERIAL_REFERENCE", sourceItemId, layout: { positionX: 120, positionY: 430, width: 380, height: 220, zIndex: 2 } })).id;
  });

  afterAll(async () => { await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } }); await db.$disconnect(); });

  it("keeps node conversation separate and creates a right-side result from immutable multi-source snapshots", async () => {
    const projectThread = await getProjectAssistantThread({ workspaceId, userId: ownerId, projectId });
    const nodeThread = await getNodeAssistantThread({ workspaceId, userId: ownerId, projectId, objectId: textObjectId });
    expect(nodeThread.id).not.toBe(projectThread.id);
    const before = await db.canvasObject.findUniqueOrThrow({ where: { id: textObjectId } }); const events: NodeAssistantStreamEvent[] = [];
    const result = await runNodeAssistant({ workspaceId, userId: ownerId, projectId, sourceObjectId: textObjectId, instruction: "结合这些内容给我出 3 个选题", additionalObjectIds: [materialObjectId], sourceItemIds: [sourceItemId] }, (event) => events.push(event), { runtime });
    expect(result.message.status).toBe("COMPLETED"); expect(result.resultObject).toBeTruthy(); successfulResultId = result.resultObject!.id;
    expect(result.resultObject).toMatchObject({ objectType: "TEXT", positionX: before.positionX + before.width + 64, generatedFrom: expect.arrayContaining([expect.objectContaining({ sourceObjectId: textObjectId }), expect.objectContaining({ sourceObjectId: materialObjectId })]) });
    expect(events.some(({ type }) => type === "delta")).toBe(true);
    const run = await db.canvasGenerateRun.findUniqueOrThrow({ where: { id: result.generateRunId }, include: { aiRun: true, inputSnapshot: true } });
    expect(run).toMatchObject({ status: "SUCCEEDED", sourceCanvasObjectId: textObjectId, resultCanvasObjectId: successfulResultId, aiRun: { status: "SUCCEEDED", provider: "KIMI", metadata: { modelRoute: { routingMode: "SINGLE_ENGINE", workspaceEngine: "KIMI", crossProviderFallback: false }, contextManifest: { selectedObjects: expect.arrayContaining([expect.objectContaining({ objectId: textObjectId }), expect.objectContaining({ objectId: materialObjectId }), expect.objectContaining({ objectId: sourceItemId })]) } } }, inputSnapshot: { objectContentVersion: before.contentVersion, textContent: before.textContent, snapshotReason: "AI_INPUT" } });
    expect(await db.canvasObjectSnapshot.count({ where: { projectId, snapshotReason: "AI_INPUT" } })).toBe(2);
    expect(await db.canvasRelation.count({ where: { targetObjectId: successfulResultId, relationType: "GENERATED_FROM" } })).toBe(2);
    expect(await db.canvasObject.findUniqueOrThrow({ where: { id: textObjectId } })).toMatchObject({ textContent: before.textContent, contentVersion: before.contentVersion });
    const built = await new ContextBuilderV2().build({ workspaceId, userId: ownerId, projectId, taskType: "DRAFT_SUGGESTION", action: "PROJECT_ASSISTANT", selectedObjects: [{ objectType: "CANVAS_OBJECT", objectId: successfulResultId }] });
    expect(built?.manifest.selectedObjects).toEqual(expect.arrayContaining([expect.objectContaining({ objectType: "CANVAS_OBJECT", objectId: successfulResultId }), expect.objectContaining({ objectType: "CANVAS_OBJECT_SNAPSHOT", whySelected: "当前节点的历史生成来源" })]));
  });

  it("blocks viewer generation and external-to-own fact elevation before provider invocation", async () => {
    await expect(runNodeAssistant({ workspaceId, userId: viewerId, projectId, sourceObjectId: textObjectId, instruction: "生成另一版" }, () => undefined, { runtime })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const before = providerCalls;
    const blocked = await runNodeAssistant({ workspaceId, userId: ownerId, projectId, sourceObjectId: materialObjectId, instruction: "把这个外部内容写成我们的成功案例" }, () => undefined, { runtime });
    expect(blocked).toMatchObject({ message: { status: "FAILED" }, resultObject: null }); expect(providerCalls).toBe(before);
    expect(await db.canvasGenerateRun.findUniqueOrThrow({ where: { id: blocked.generateRunId } })).toMatchObject({ status: "FAILED", resultCanvasObjectId: null });
  });

  it("cancels without creating a result or relation, then retries into a new candidate", async () => {
    fixtureText = "这是一段足够长的生成内容，用来确认停止后不会创建假结果节点或生成关系，并且重新尝试仍可成功。";
    const aborter = new AbortController(); const beforeObjects = await db.canvasObject.count({ where: { projectId } }); const beforeRelations = await db.canvasRelation.count({ where: { projectId } });
    const stopped = await runNodeAssistant({ workspaceId, userId: ownerId, projectId, sourceObjectId: textObjectId, instruction: "生成另一种表达", signal: aborter.signal }, (event) => { if (event.type === "delta") aborter.abort(); }, { runtime });
    expect(stopped).toMatchObject({ message: { status: "STOPPED" }, resultObject: null });
    expect(await db.canvasGenerateRun.findUniqueOrThrow({ where: { id: stopped.generateRunId } })).toMatchObject({ status: "CANCELLED", resultCanvasObjectId: null });
    expect(await db.canvasObject.count({ where: { projectId } })).toBe(beforeObjects); expect(await db.canvasRelation.count({ where: { projectId } })).toBe(beforeRelations);
    fixtureText = "重新生成后的另一种表达。";
    const retried = await runNodeAssistant({ workspaceId, userId: ownerId, projectId, sourceObjectId: textObjectId, instruction: "生成另一种表达" }, () => undefined, { runtime });
    expect(retried).toMatchObject({ message: { status: "COMPLETED" }, resultObject: { objectType: "TEXT" } });
  });

  it("keeps downstream results and provenance after an upstream soft delete", async () => {
    const source = await db.canvasObject.findUniqueOrThrow({ where: { id: textObjectId } });
    await softDeleteCanvasObject({ workspaceId, userId: ownerId, projectId, objectId: textObjectId, expectedContentVersion: source.contentVersion });
    const result = (await listCanvasObjects({ workspaceId, userId: ownerId, projectId })).find(({ id }) => id === successfulResultId)!;
    expect(result).toBeTruthy(); expect(result.generatedFrom).toEqual(expect.arrayContaining([expect.objectContaining({ sourceObjectId: textObjectId, sourceDeleted: true })]));
    expect(await db.canvasRelation.count({ where: { targetObjectId: successfulResultId, sourceObjectId: textObjectId } })).toBe(1);
  });

  it("keeps the additive migration and UI contracts", async () => {
    const [migration, canvas] = await Promise.all([readFile(new URL("../../../packages/db/prisma/migrations/20260913190000_canvas_node_ai/migration.sql", import.meta.url), "utf8"), readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8")]);
    expect(migration).toContain('CREATE TABLE "CanvasGenerateRun"'); expect(migration).toContain('CREATE UNIQUE INDEX "AssistantThread_canvas_object_key"'); expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/u);
    expect(canvas).toContain('mode: "follow"'); expect(canvas).toContain('zoom: viewport.zoom'); expect(canvas).not.toContain('mode: "follow" } }) : assistant');
  });
});
