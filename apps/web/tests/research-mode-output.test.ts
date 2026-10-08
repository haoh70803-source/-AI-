import { describe, expect, it } from "vitest";
import type { ResearchSource } from "@content-center/core";
import { validateAndRenderModeAnswer } from "../server/research/mode-output";

const source = (ref: string, kind: ResearchSource["kind"], objectId: string): ResearchSource => ({ ref, kind, objectId, title: objectId, href: null, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: null, excerpt: "原始来源记录", version: null });
const sources = [source("M1", "MATERIAL", "material"), source("B1", "BENCHMARK_ACCOUNT", "account"), source("B2", "BENCHMARK_WORK", "work"), source("T1", "TREND", "trend")];
const section = { title: "边界", text: "只说明实际证据。", sourceRefs: ["M1"], limitation: "样本有限" };
const cited = { sourceRefs: ["M1"], limitation: "仅此材料" };

describe("Research mode outputs", () => {
  it("requires a cited breakdown and keeps the analysis separate from raw Material", () => {
    const result = validateAndRenderModeAnswer("BREAKDOWN", { sections: [section], breakdowns: [{ materialRef: "M1", audienceTask: "了解问题", openingPromise: "解释问题", structure: "提出再解释", coreClaims: "有待核实的观点", evidence: "引用材料", turn: "补充限制", cta: "请核实", conditions: "只适用当前材料", doNotCopy: "独特表述", ...cited }] }, sources, { M1: "原始可读正文" });
    expect(result.blocks).toMatchObject([{ title: "内容拆解：material", provenance: "AI_INTERPRETATION", sourceRefs: ["M1"] }]);
    expect(() => validateAndRenderModeAnswer("BREAKDOWN", { sections: [section] }, sources, {})).toThrow();
  });
  it("requires an explicit comparison with two readable cited materials", () => {
    const second = source("M2", "MATERIAL", "another-material");
    const breakdown = (materialRef: string) => ({ materialRef, audienceTask: "了解问题", openingPromise: "解释问题", structure: "提出再解释", coreClaims: "观点待核实", evidence: "引用来源", turn: "补充限制", cta: "继续核对", conditions: "仅当前材料", doNotCopy: "独特表述", sourceRefs: [materialRef], limitation: "样本有限" });
    const data = { sections: [section], breakdowns: [breakdown("M1"), breakdown("M2")], comparison: { commonalities: "都描述问题", differences: "论据不同", transferable: "需核验后借鉴", sourceRefs: ["M1", "M2"], limitation: "只覆盖两条材料" } };
    const inputs = { M1: "第一条实际正文", M2: "第二条实际正文" };
    expect(validateAndRenderModeAnswer("BREAKDOWN", data, [...sources, second], inputs).blocks).toMatchObject([{ title: "内容拆解：material" }, { title: "内容拆解：another-material" }, { title: "多条内容比较" }]);
    expect(() => validateAndRenderModeAnswer("BREAKDOWN", { ...data, comparison: null }, [...sources, second], inputs)).toThrow("RESEARCH_COMPARISON_REQUIRED");
    expect(() => validateAndRenderModeAnswer("BREAKDOWN", { ...data, comparison: { ...data.comparison, sourceRefs: ["M1"] } }, [...sources, second], inputs)).toThrow("RESEARCH_COMPARISON_SOURCES_REQUIRED");
  });
  it("checks actual account sampling and source ownership inside structured findings", () => {
    const output = { sections: [section], accountFindings: [{ accountId: "account", sampleScope: "WINDOW", audienceTask: "了解需求", themes: "有待比较", openings: "未确认", structure: "未确认", directionChange: "缺少连续样本", transferable: "验证观点", doNotCopy: "独特文案", sourceRefs: ["B1", "B2"], limitation: "窗口样本" }] };
    const rendered = validateAndRenderModeAnswer("BENCHMARK", output, sources, {}, { account: "WINDOW" });
    expect(rendered.blocks).toHaveLength(1);
    expect(rendered.blocks[0]).toMatchObject({ text: expect.stringContaining("缺少可读正文，无法判断开头类型") });
    expect(rendered.sections).toEqual([]);
    expect(() => validateAndRenderModeAnswer("BENCHMARK", output, sources, {}, { account: "HISTORY" })).toThrow("RESEARCH_SAMPLE_SCOPE_MISMATCH");
  });
  it("requires topic task, benefit, evidence gaps and validation; rejects fake probability", () => {
    const topic = { title: "常青议题", audienceTask: "解决持续问题", coreBenefit: "得到核验方法", angle: "从常见误区入手", whyNow: "持续有人需要", trendRefs: [], benchmarkRefs: [], historyRefs: [], profileRefs: [], evidenceGaps: ["尚无外部趋势"], nextValidation: "访谈受众", evergreen: true, ...cited };
    expect(validateAndRenderModeAnswer("OPPORTUNITY", { sections: [section], topics: [topic] }, sources, {}).blocks[0]).toMatchObject({ type: "text", title: "选题：常青议题" });
    expect(() => validateAndRenderModeAnswer("OPPORTUNITY", { sections: [section], topics: [{ ...topic, whyNow: "爆款概率 87%" }] }, sources, {})).toThrow();
    expect(() => validateAndRenderModeAnswer("OPPORTUNITY", { sections: [section], topics: [{ ...topic, trendRefs: ["T1"] }] }, sources, {})).toThrow("RESEARCH_MISSING_TOPIC_CITATION");
    const historySource = source("A1", "PROJECT_ARTIFACT", "saved-artifact");
    expect(validateAndRenderModeAnswer("OPPORTUNITY", { sections: [section], topics: [{ ...topic, historyRefs: ["A1"], sourceRefs: ["M1", "A1"] }] }, [...sources, historySource], {}).blocks).toHaveLength(1);
  });
});
