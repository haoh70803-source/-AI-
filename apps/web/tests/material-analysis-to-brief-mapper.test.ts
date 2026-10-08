import { describe, expect, it } from "vitest";
import { MaterialAnalysisToBriefMapper, readMaterialAnalysisBriefMetadata } from "../server/material-analysis/brief-mapper";

describe("MaterialAnalysisToBriefMapper", () => {
  it("maps only source-understanding fields and records primary-source provenance", () => {
    const draft = MaterialAnalysisToBriefMapper.map({
      analysis: { id: "analysis-2", version: 2, suggestedTitle: "参考标题", summary: "参考摘要", topic: "内容信任", tags: ["信任", "案例"], keywords: ["成交", "内容"], targetAudience: "教培机构负责人", coreViewpoint: "内容承担前置信任建设。", keyPoints: ["前置教育", "案例降低阻力"], coreQuestion: "内容如何缩短成交路径？" },
      source: { id: "source-primary", title: "原素材标题" },
      project: { title: "内容信任项目", audience: null },
    });
    expect(draft).toMatchObject({ topic: "内容信任", audience: "教培机构负责人", coreQuestion: "内容如何缩短成交路径？", coreMessage: "内容承担前置信任建设。", keyPoints: ["前置教育", "案例降低阻力"], background: "参考摘要", angle: "", structure: [], tone: "", risks: [] });
    expect(readMaterialAnalysisBriefMetadata(draft.metadata)).toMatchObject({ initializedFromMaterialAnalysisId: "analysis-2", materialAnalysisVersion: 2, primarySourceItemId: "source-primary", sourceTitleSuggestion: "参考标题", keywords: ["成交", "内容"], referenceTags: ["信任", "案例"] });
  });

  it("normalizes nullable analysis fields without inventing strategy", () => {
    const draft = MaterialAnalysisToBriefMapper.map({
      analysis: { id: "analysis-empty", version: 1, suggestedTitle: null, summary: null, topic: null, tags: null, keywords: null, targetAudience: null, coreViewpoint: null, keyPoints: null, coreQuestion: null },
      source: { id: "source-empty", title: null },
      project: { title: "旧项目", audience: "已有项目受众" },
    });
    expect(draft).toMatchObject({ topic: "", audience: "已有项目受众", coreQuestion: "", coreMessage: "", keyPoints: [], background: "", angle: "", structure: [], tone: "", risks: [] });
  });

  it("keeps new material understanding out of the user's supplement", () => {
    const draft = MaterialAnalysisToBriefMapper.map({
      analysis: { id: "analysis-v2", version: 1, suggestedTitle: null, summary: "参考摘要", topic: "参考主题", tags: [], keywords: [], targetAudience: "参考受众", coreViewpoint: "参考观点", keyPoints: ["参考要点"], coreQuestion: "参考问题", understanding: { whatItSays: { summary: "参考摘要", keyPoints: [] }, reusable: [], doNotCopy: [], uncertain: [] } },
      source: { id: "source-v2", title: "同行素材" },
      project: { title: "我的创作", audience: null },
    });
    expect(draft).toMatchObject({ topic: "我的创作", audience: "", coreMessage: "", coreQuestion: "", background: "", keyPoints: [] });
  });
});
