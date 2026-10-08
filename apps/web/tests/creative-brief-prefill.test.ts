import { describe, expect, it } from "vitest";
import { CreativeBriefPrefillService } from "../server/studio/creative-brief-prefill";

const unified = {
  schemaVersion: "unified-creative-analysis-v1",
  summary: { text: "参考背景", classification: "SOURCE_FACT", sourceItemIds: ["source-1"] },
  coreQuestion: { text: "内容如何提前建立信任？", classification: "SOURCE_FACT", sourceItemIds: ["source-1"] },
  coreViewpoint: { text: "内容承担前置信任建设。", classification: "SOURCE_FACT", sourceItemIds: ["source-1"] },
  keyPoints: [{ text: "案例降低决策风险", classification: "SOURCE_FACT", sourceItemIds: ["source-1"] }],
  creativeInterpretation: { text: "适合从信任前置切入。", classification: "AI_INTERPRETATION", sourceItemIds: ["source-1"] },
  angles: [{ title: "信任前置", angle: "不要先讲销售技巧，而是讲信任如何在见面前完成。", rationale: "贴合素材", classification: "AI_SUGGESTION", sourceItemIds: ["source-1"] }],
  structure: { overallApproach: "案例—现象—原因—判断—方法", classification: "AI_SUGGESTION", sourceItemIds: ["source-1"], sections: [{ title: "案例", purpose: "建立情境", keyMessage: "先展示结果", supportingPoints: [], sourceItemIds: ["source-1"] }] },
  expressionDirection: { description: "直接、具体", rationale: "适合目标受众", classification: "AI_SUGGESTION", sourceItemIds: ["source-1"] },
  riskNotes: [{ text: "案例结果需要核实", classification: "AI_INTERPRETATION", sourceItemIds: ["source-1"] }],
  titleReferences: [{ title: "没见面，为什么也敢付费？", rationale: "制造反差", classification: "AI_SUGGESTION", sourceItemIds: ["source-1"] }],
  sourceReferences: [{ sourceItemId: "source-1", title: "信任素材", role: "REFERENCE" }],
  groundingGaps: [],
} as const;

const analysis = { id: "analysis-1", version: 2, suggestedTitle: "参考标题", summary: "素材摘要", topic: "内容信任", tags: [], keywords: [], targetAudience: "教培机构老板", coreViewpoint: "短视频承担销售前置教育。", keyPoints: ["持续内容建立专业认知"], coreQuestion: "为什么没见面也敢付费？" };
const source = { sourceItem: { id: "source-1", title: "信任素材", materialAnalyses: [analysis] } };
const project = { title: "信任项目", audience: null, status: "DRAFT" };

describe("CreativeBriefPrefillService", () => {
  it("prefills one creation plan from MaterialAnalysis and UnifiedCreativeAnalysis without another model call", () => {
    const result = CreativeBriefPrefillService.build({ project, sources: [source], existingBrief: null, unifiedAnalysisOutput: unified, hasMotherContent: false });
    expect(result.plan).toMatchObject({ topic: "内容信任", audience: "教培机构老板", coreQuestion: "为什么没见面也敢付费？", coreMessage: "短视频承担销售前置教育。", angle: "不要先讲销售技巧，而是讲信任如何在见面前完成。", tone: "直接、具体", risks: ["案例结果需要核实"] });
    expect(result.plan.structure).toEqual(["案例—现象—原因—判断—方法", "案例：先展示结果"]);
    expect(result.origins).toEqual(["MaterialAnalysis", "UnifiedCreativeAnalysis"]);
    expect(result.autoPrefilled).toBe(true);
  });

  it("never replaces an existing user Brief value", () => {
    const existing = { topic: "用户主题", angle: "用户角度", audience: "用户受众", coreMessage: "用户判断", coreQuestion: "用户问题", background: "用户背景", keyPoints: ["用户要点"], structure: ["用户结构"], tone: "用户语气", risks: ["用户风险"], version: 4, metadata: null };
    const result = CreativeBriefPrefillService.build({ project, sources: [source], existingBrief: existing, unifiedAnalysisOutput: unified, hasMotherContent: false });
    expect(result.plan).toMatchObject({ topic: "用户主题", angle: "用户角度", audience: "用户受众", coreMessage: "用户判断", coreQuestion: "用户问题", background: "用户背景", keyPoints: ["用户要点"], structure: ["用户结构"], tone: "用户语气", risks: ["用户风险"], version: 4 });
    expect(result.autoPrefilled).toBe(false);
    expect(result.origins).toEqual(["User Brief", "MaterialAnalysis", "UnifiedCreativeAnalysis"]);
  });

  it("supports a discovery project without MaterialAnalysis", () => {
    const result = CreativeBriefPrefillService.build({ project, sources: [], existingBrief: null, unifiedAnalysisOutput: unified, hasMotherContent: false });
    expect(result.plan).toMatchObject({ topic: "", coreQuestion: "内容如何提前建立信任？", coreMessage: "内容承担前置信任建设。", angle: "不要先讲销售技巧，而是讲信任如何在见面前完成。" });
    expect(result.origins).toEqual(["UnifiedCreativeAnalysis"]);
  });

  it("keeps a legacy project without analysis usable", () => {
    const result = CreativeBriefPrefillService.build({ project, sources: [], existingBrief: null, unifiedAnalysisOutput: null, hasMotherContent: false });
    expect(result.plan.version).toBe(0);
    expect(result.stage).toBe("PREPARING");
    expect(result.origins).toEqual([]);
  });

  it("opens directly in the mother-content stage for an existing mother content or writing state", () => {
    expect(CreativeBriefPrefillService.build({ project, sources: [], existingBrief: null, unifiedAnalysisOutput: null, hasMotherContent: true }).stage).toBe("WRITING");
    expect(CreativeBriefPrefillService.build({ project: { ...project, status: "WRITING" }, sources: [], existingBrief: null, unifiedAnalysisOutput: null, hasMotherContent: false }).stage).toBe("WRITING");
  });
});
