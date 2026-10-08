import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { createProject } from "../server/project-service";
import { getUnifiedCreativeAnalysisState, runUnifiedCreativeAnalysis } from "../server/unified-analysis/service";
import { unifiedCreativeAnalysisProviderSchema } from "../server/unified-analysis/schemas";

describe("Unified Creative Analysis", () => {
  const suffix = randomUUID();
  const ownerId = `unified-owner-${suffix}`;
  const outsiderId = `unified-outsider-${suffix}`;
  let workspaceId = "";
  let outsiderWorkspaceId = "";
  let projectId = "";
  let sourceId = "";
  let analysisId = "";
  let calls = 0;

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Unified Owner", email: `${ownerId}@example.test` }, { id: outsiderId, name: "Unified Outsider", email: `${outsiderId}@example.test` }] });
    const [workspace, outsiderWorkspace] = await Promise.all([
      db.workspace.create({ data: { name: "Unified", slug: `unified-${suffix}`, members: { create: { userId: ownerId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Unified Outsider", slug: `unified-outsider-${suffix}`, members: { create: { userId: outsiderId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; outsiderWorkspaceId = outsiderWorkspace.id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "可信素材", rawText: "创作前应先建立清晰的问题、素材依据和事实边界。" } });
    sourceId = source.id;
    const material = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: sourceId, createdById: ownerId, version: 1, status: "COMPLETED", suggestedTitle: "参考标题", summary: "素材讨论可靠创作准备。", topic: "可靠创作", tags: [], keywords: [], targetAudience: "内容团队", coreViewpoint: "先整理依据，再决定创作策略。", keyPoints: ["明确问题", "绑定来源"], coreQuestion: "如何减少无依据创作？", transcriptUpdatedAtAtAnalysis: new Date() } });
    analysisId = material.id;
    projectId = (await createProject({ workspaceId, userId: ownerId, title: "统一分析项目", audience: "内容团队", sourceItemId: sourceId })).id;
    await db.creativeBrief.create({ data: { workspaceId, projectId, createdById: ownerId, topic: "可靠创作", angle: "", audience: "内容团队", coreMessage: "先整理依据，再决定创作策略。", coreQuestion: "如何减少无依据创作？", background: "素材讨论可靠创作准备。", keyPoints: ["明确问题", "绑定来源"], structure: [], tone: "", risks: [], metadata: { handoff: "MATERIAL_ANALYSIS", initializedFromMaterialAnalysisId: analysisId, materialAnalysisVersion: 1, primarySourceItemId: sourceId, sourceItemTitle: "可信素材", sourceTitleSuggestion: "参考标题", keywords: [], referenceTags: [] } } });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, outsiderWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
    await db.$disconnect();
  });

  const advisory = () => ({
    creativeInterpretation: { text: "这篇内容应从事实边界切入。", classification: "AI_INTERPRETATION" as const, sourceItemIds: [sourceId] },
    angles: [{ title: "从失败成本切入", angle: "先说明无依据创作的返工成本。", rationale: "与素材问题直接相关", classification: "AI_SUGGESTION" as const, sourceItemIds: [sourceId] }],
    structure: { overallApproach: "问题—依据—行动", classification: "AI_SUGGESTION" as const, sourceItemIds: [sourceId], sections: [{ title: "问题", purpose: "建立冲突", keyMessage: "无依据创作导致返工。", supportingPoints: ["事实边界不清"], sourceItemIds: [sourceId] }] },
    expressionDirection: { description: "直接、具体、少口号。", rationale: "符合内容团队使用场景", classification: "AI_SUGGESTION" as const, sourceItemIds: [sourceId] },
    riskNotes: [{ text: "不要把来源观点写成已证实事实。", classification: "AI_INTERPRETATION" as const, sourceItemIds: [sourceId] }],
    titleReferences: [{ title: "为什么 AI 内容总在返工？", rationale: "用问题呈现成本", classification: "AI_SUGGESTION" as const, sourceItemIds: ["invented-source"] }],
  });

  it("normalizes a concise Kimi response and keeps non-core sections optional", () => {
    const result = unifiedCreativeAnalysisProviderSchema.parse({
      creativeUnderstanding: "应从事实边界切入。",
      recommendations: [{ title: "先讲返工", recommendation: "说明无依据创作的成本。", extra: "ignored" }],
      risks: "核对事实来源",
      extraField: true,
    });
    expect(result.creativeInterpretation.text).toBe("应从事实边界切入。");
    expect(result.angles).toHaveLength(1);
    expect(result.riskNotes).toHaveLength(1);
    expect(result.structure.sections).toEqual([]);
    expect(result).not.toHaveProperty("extraField");
  });

  it("still rejects a response without core interpretation or a useful angle", () => {
    expect(() => unifiedCreativeAnalysisProviderSchema.parse({ risks: [] })).toThrow();
    expect(() => unifiedCreativeAnalysisProviderSchema.parse({ creativeUnderstanding: "有理解", recommendations: [] })).toThrow();
  });

  it("runs one structured analysis, preserves source facts, strips fake references and records provenance", async () => {
    const runtime = { provider: new MockLLMProvider(() => { calls += 1; return advisory(); }), providerName: "FIXTURE", model: "fixture-kimi-2.6", productModel: "FIXTURE" as const, mode: "FIXTURE" as const };
    const result = await runUnifiedCreativeAnalysis({ workspaceId, userId: ownerId, projectId }, { runtime });
    expect(result).toMatchObject({ status: "COMPLETED", version: 1, cached: false, isStale: false, schemaVersion: "unified-creative-analysis-v1" });
    expect(result.output).toMatchObject({ summary: { text: "素材讨论可靠创作准备。", classification: "SOURCE_FACT", sourceItemIds: [sourceId] }, coreQuestion: { text: "如何减少无依据创作？" }, groundingGaps: ["SOURCE_REFERENCE_GAP"] });
    expect(JSON.stringify(result.output)).not.toContain("invented-source");
    expect(calls).toBe(1);
    await expect(db.aIRun.findFirst({ where: { projectId, action: "UNIFIED_CREATIVE_ANALYSIS", status: "SUCCEEDED" } })).resolves.toBeTruthy();
    await expect(db.apiUsage.count({ where: { workspaceId, operation: "UNIFIED_CREATIVE_ANALYSIS", success: true } })).resolves.toBe(1);
    const stored = await db.unifiedCreativeAnalysis.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.provenance).toMatchObject({ primarySourceItemId: sourceId, creativeBriefVersion: 1, materialAnalyses: [{ sourceItemId: sourceId, materialAnalysisId: analysisId, version: 1 }] });
  });

  it("reuses an identical fingerprint and page-state reads never call the provider", async () => {
    const runtime = { provider: new MockLLMProvider(() => { calls += 1; return advisory(); }), providerName: "FIXTURE", model: "fixture-kimi-2.6", productModel: "FIXTURE" as const, mode: "FIXTURE" as const };
    await expect(runUnifiedCreativeAnalysis({ workspaceId, userId: ownerId, projectId }, { runtime })).resolves.toMatchObject({ cached: true, version: 1 });
    await expect(getUnifiedCreativeAnalysisState({ workspaceId, userId: ownerId, projectId })).resolves.toMatchObject({ analysis: { isStale: false, version: 1 } });
    expect(calls).toBe(1);
    await expect(db.apiUsage.count({ where: { workspaceId, operation: "UNIFIED_CREATIVE_ANALYSIS" } })).resolves.toBe(1);
  });

  it("marks changed Brief and source input stale, creates a new version, and never overwrites the Brief", async () => {
    const brief = await db.creativeBrief.findUniqueOrThrow({ where: { projectId } });
    await db.creativeBrief.update({ where: { id: brief.id }, data: { coreQuestion: "用户修改后的问题", version: { increment: 1 } } });
    await expect(getUnifiedCreativeAnalysisState({ workspaceId, userId: ownerId, projectId })).resolves.toMatchObject({ analysis: { isStale: true, version: 1 } });
    const runtime = { provider: new MockLLMProvider(() => { calls += 1; return advisory(); }), providerName: "FIXTURE", model: "fixture-kimi-2.6", productModel: "FIXTURE" as const, mode: "FIXTURE" as const };
    await expect(runUnifiedCreativeAnalysis({ workspaceId, userId: ownerId, projectId }, { runtime })).resolves.toMatchObject({ cached: false, version: 2 });
    await expect(db.creativeBrief.findUniqueOrThrow({ where: { id: brief.id } })).resolves.toMatchObject({ coreQuestion: "用户修改后的问题", version: 2 });
    expect(calls).toBe(2);
    await db.sourceItem.update({ where: { id: sourceId }, data: { rawText: "主素材已更新，但不会自动调用 AI。" } });
    await expect(getUnifiedCreativeAnalysisState({ workspaceId, userId: ownerId, projectId })).resolves.toMatchObject({ analysis: { isStale: true, version: 2 } });
    expect(calls).toBe(2);
  });

  it("enforces Workspace membership", async () => {
    await expect(getUnifiedCreativeAnalysisState({ workspaceId, userId: outsiderId, projectId })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(runUnifiedCreativeAnalysis({ workspaceId: outsiderWorkspaceId, userId: outsiderId, projectId }, { runtime: { provider: new MockLLMProvider(advisory), providerName: "FIXTURE", model: "fixture" } })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});
