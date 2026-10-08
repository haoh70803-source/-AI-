import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { enqueueMaterialAnalysis } = vi.hoisted(() => ({ enqueueMaterialAnalysis: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@content-center/worker/queue-producer", () => ({ enqueueMaterialAnalysis }));

import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { MockLLMProvider } from "@content-center/providers";
import { createProjectFromMaterial, getMaterialAnalysis, requestMaterialAnalysis, updateMaterialAnalysis } from "../server/material-analysis/service";
import { readMaterialAnalysisBriefMetadata } from "../server/material-analysis/brief-mapper";
import { materialAnalysisOutputSchema } from "../server/material-analysis/schemas";

describe("V1.2B-1 smart material analysis", () => {
  const suffix = randomUUID();
  const userAId = `material-a-${suffix}`;
  const userBId = `material-b-${suffix}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let sourceAId = "";
  let sourceBId = "";

  const output = {
    whatItSays: { summary: "这条素材讨论内容团队如何减少创作前的信息损耗。", keyPoints: ["先整理素材", "人工确认结果"] },
    reusable: [{ content: "先拆信息再表达", whyUseful: "这是可迁移的方法" }],
    doNotCopy: [{ content: "当天成交13个", reason: "这是原作者案例，不是我们的事实" }],
    uncertain: [{ content: "星加克", reason: "原转写中的实体无法确认" }],
  };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userAId, name: "Material A", email: `${userAId}@example.test` }, { id: userBId, name: "Material B", email: `${userBId}@example.test` }] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "Material A", slug: `material-a-${suffix}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Material B", slug: `material-b-${suffix}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id; workspaceBId = workspaceB.id;
    const [sourceA, sourceB] = await Promise.all([
      db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "素材 A", description: "市场信号只用于辅助理解", status: "READY", transcript: { create: { workspaceId: workspaceAId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: "这是一段关于素材整理、人工确认与可靠创作流程的中文转写。", segments: [] } } } }),
      db.sourceItem.create({ data: { workspaceId: workspaceBId, createdById: userBId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "私有文本素材 B", rawText: "这是一条可以直接进入项目的已有文本素材。", status: "READY", transcript: { create: { workspaceId: workspaceBId, provider: "MANUAL_TEXT", providerMode: "REAL", fullText: "这是一条已有文本或字幕素材，不需要云端转写。", segments: [] } } } }),
    ]);
    sourceAId = sourceA.id; sourceBId = sourceB.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  it("accepts only the bounded material-understanding contract", () => {
    expect(materialAnalysisOutputSchema.parse(output)).toEqual(output);
    expect(() => materialAnalysisOutputSchema.parse({ ...output, reusable: [{ content: "缺少原因" }] })).toThrow();
    expect(() => materialAnalysisOutputSchema.parse({ ...output, hook: "不属于本阶段" })).toThrow();
    expect(() => materialAnalysisOutputSchema.parse({ ...output, uncertain: undefined })).toThrow();
    expect(() => materialAnalysisOutputSchema.parse("not-json")).toThrow();
  });

  it("queues one persisted analysis attempt and returns immediately", async () => {
    const runtime = { provider: new MockLLMProvider(() => output), providerName: "FIXTURE", model: "fixture-kimi-2.6", productModel: "FIXTURE" as const, mode: "FIXTURE" as const };
    const result = await requestMaterialAnalysis({ workspaceId: workspaceAId, userId: userAId, sourceItemId: sourceAId }, { runtime });
    expect(result).toMatchObject({ version: 1, status: "QUEUED", origin: "AI", stale: false });
    expect(result.jobId).toBeTruthy();
    expect(enqueueMaterialAnalysis).toHaveBeenCalledWith(expect.objectContaining({ jobId: result.jobId, workspaceId: workspaceAId, sourceItemId: sourceAId, requestedById: userAId }), 3);
    await expect(db.ingestJob.findUnique({ where: { id: result.jobId } })).resolves.toMatchObject({ jobType: "ANALYZE_MATERIAL", status: "QUEUED", metadata: { materialAnalysisId: result.id } });
    await db.materialAnalysis.update({ where: { id: result.id }, data: { status: "COMPLETED", understanding: output, summary: output.whatItSays.summary, keyPoints: output.whatItSays.keyPoints } });
  });

  it("prevents duplicate processing and keeps the older version", async () => {
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: sourceAId } });
    const processing = await db.materialAnalysis.create({ data: { workspaceId: workspaceAId, sourceItemId: sourceAId, createdById: userAId, version: 2, status: "PROCESSING", tags: [], keywords: [], keyPoints: [], transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    const runtime = { provider: new MockLLMProvider(() => output), providerName: "FIXTURE", model: "fixture-kimi-2.6", mode: "FIXTURE" as const };
    await expect(requestMaterialAnalysis({ workspaceId: workspaceAId, userId: userAId, sourceItemId: sourceAId }, { runtime })).rejects.toMatchObject({ code: "ANALYSIS_ALREADY_PROCESSING" });
    await db.materialAnalysis.update({ where: { id: processing.id }, data: { status: "FAILED", errorCode: "TEST_INTERRUPTED", errorMessage: "测试中的中断任务" } });
    await expect(requestMaterialAnalysis({ workspaceId: workspaceAId, userId: userAId, sourceItemId: sourceAId }, { runtime })).resolves.toMatchObject({ version: 3, status: "QUEUED" });
    expect(await db.materialAnalysis.count({ where: { sourceItemId: sourceAId, status: "COMPLETED" } })).toBe(1);
    await expect(getMaterialAnalysis({ workspaceId: workspaceAId, sourceItemId: sourceAId })).resolves.toMatchObject({ current: { version: 1, status: "COMPLETED" }, latestAttempt: { version: 3, status: "PROCESSING" }, job: { status: "QUEUED" } });
  });

  it("saves human edits to the four-block result and marks stale after transcript changes", async () => {
    const current = (await getMaterialAnalysis({ workspaceId: workspaceAId, sourceItemId: sourceAId })).current!;
    const changed = { ...output, whatItSays: { ...output.whatItSays, summary: "人工确认后的摘要" } };
    const edited = await updateMaterialAnalysis({ workspaceId: workspaceAId, userId: userAId, sourceItemId: sourceAId, analysisId: current.id, data: changed });
    expect(edited).toMatchObject({ origin: "HUMAN", understanding: changed });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.transcript.update({ where: { sourceItemId: sourceAId }, data: { fullText: "更新后的转写文本。" } });
    expect((await getMaterialAnalysis({ workspaceId: workspaceAId, sourceItemId: sourceAId })).current?.stale).toBe(true);
  });

  it("creates one project and brief from the primary material without extra AI calls or later overwrite", async () => {
    const aiRunsBefore = await db.aIRun.count({ where: { workspaceId: workspaceAId } });
    const usageBefore = await db.apiUsage.count({ where: { workspaceId: workspaceAId } });
    const sourceAnalysis = await db.materialAnalysis.findFirstOrThrow({ where: { workspaceId: workspaceAId, sourceItemId: sourceAId, status: "COMPLETED" }, orderBy: { version: "desc" } });
    const first = await createProjectFromMaterial({ workspaceId: workspaceAId, sourceItemId: sourceAId, userId: userAId });
    expect(first).toMatchObject({ created: true, briefInitialized: true });
    await expect(db.projectSource.findFirst({ where: { projectId: first.projectId, sourceItemId: sourceAId } })).resolves.toBeTruthy();
    const initialBrief = await db.creativeBrief.findUniqueOrThrow({ where: { projectId: first.projectId } });
    expect(initialBrief).toMatchObject({ topic: "素材 A", audience: "", coreMessage: "", coreQuestion: "", background: "", angle: "", structure: [], tone: "" });
    expect(initialBrief.keyPoints).toEqual([]);
    const provenance = readMaterialAnalysisBriefMetadata(initialBrief.metadata);
    expect(provenance).toMatchObject({ primarySourceItemId: sourceAId, initializedFromMaterialAnalysisId: sourceAnalysis.id, materialAnalysisVersion: sourceAnalysis.version });
    expect(await db.aIRun.count({ where: { workspaceId: workspaceAId } })).toBe(aiRunsBefore);
    expect(await db.apiUsage.count({ where: { workspaceId: workspaceAId } })).toBe(usageBefore);

    await db.creativeBrief.update({ where: { id: initialBrief.id }, data: { audience: "人工修改受众", coreQuestion: "人工修改问题", version: { increment: 1 } } });
    const latest = await db.materialAnalysis.findFirstOrThrow({ where: { workspaceId: workspaceAId, sourceItemId: sourceAId }, orderBy: { version: "desc" } });
    await db.materialAnalysis.create({ data: { workspaceId: workspaceAId, sourceItemId: sourceAId, createdById: userAId, version: latest.version + 1, status: "COMPLETED", suggestedTitle: "新版标题", summary: "新版摘要", topic: "新版主题", tags: [], keywords: [], targetAudience: "新版受众", coreViewpoint: "新版观点", keyPoints: ["新版要点"], coreQuestion: "新版问题", transcriptUpdatedAtAtAnalysis: latest.transcriptUpdatedAtAtAnalysis } });
    const second = await createProjectFromMaterial({ workspaceId: workspaceAId, sourceItemId: sourceAId, userId: userAId });
    expect(second).toEqual({ projectId: first.projectId, created: false, briefInitialized: false });
    await expect(db.creativeBrief.findUniqueOrThrow({ where: { id: initialBrief.id } })).resolves.toMatchObject({ audience: "人工修改受众", coreQuestion: "人工修改问题", topic: "素材 A" });
    expect(readMaterialAnalysisBriefMetadata((await db.creativeBrief.findUniqueOrThrow({ where: { id: initialBrief.id } })).metadata)?.materialAnalysisVersion).toBe(provenance?.materialAnalysisVersion);
  });

  it("keeps text material project work available without RedFox or Doubao", async () => {
    const integrations = new IntegrationService();
    await expect(integrations.getIntegrationStatus(workspaceBId, "REDFOX")).resolves.toMatchObject({ status: "UNCONFIGURED", configured: false });
    await expect(integrations.getIntegrationStatus(workspaceBId, "DOUBAO_ASR")).resolves.toMatchObject({ status: "UNCONFIGURED", configured: false });
    const first = await createProjectFromMaterial({ workspaceId: workspaceBId, sourceItemId: sourceBId, userId: userBId });
    expect(first).toMatchObject({ created: true, briefInitialized: false });
    await expect(db.creativeBrief.findUnique({ where: { projectId: first.projectId } })).resolves.toBeNull();
    const second = await createProjectFromMaterial({ workspaceId: workspaceBId, sourceItemId: sourceBId, userId: userBId });
    expect(second).toEqual({ projectId: first.projectId, created: false, briefInitialized: false });
    await expect(createProjectFromMaterial({ workspaceId: workspaceAId, sourceItemId: sourceBId, userId: userAId })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
  });

  it("enforces workspace scope and never enables product MOCK results", async () => {
    await expect(getMaterialAnalysis({ workspaceId: workspaceAId, sourceItemId: sourceBId })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    const fixtureRuntime = { provider: new MockLLMProvider(() => output), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" as const };
    await expect(requestMaterialAnalysis({ workspaceId: workspaceAId, userId: userAId, sourceItemId: sourceBId }, { runtime: fixtureRuntime })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    const runtime = { provider: new MockLLMProvider(() => output), providerName: "MOCK", model: "mock", mode: "MOCK" as const };
    await expect(requestMaterialAnalysis({ workspaceId: workspaceBId, userId: userBId, sourceItemId: sourceBId }, { runtime })).rejects.toMatchObject({ code: "MOCK_NOT_ALLOWED" });
  });
});
