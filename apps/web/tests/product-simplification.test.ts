import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { warningsFromUnderstanding } from "../server/ai/draft-warnings";
import { materialAnalysisOutputSchema } from "../server/material-analysis/schemas";

const understanding = {
  whatItSays: { summary: "原作者分享自己的成交案例。", keyPoints: ["内容建立信任"] },
  reusable: [{ content: "先解释问题，再给方法", whyUseful: "可迁移的表达机制" }],
  doNotCopy: [{ content: "百分之九十八都在我这里上过", reason: "无法验证且属于原作者陈述" }, { content: "当天成交13个", reason: "原作者案例" }],
  uncertain: [{ content: "星加克", reason: "实体无法确认，不能猜测纠正" }],
};

describe("Product Simplification V1 fact boundary", () => {
  it("keeps uncertain entities verbatim in the four-block contract", () => {
    const parsed = materialAnalysisOutputSchema.parse(understanding);
    expect(parsed.uncertain[0]?.content).toBe("星加克");
    expect(JSON.stringify(parsed)).not.toContain("星巴克");
  });

  it("warns softly instead of rejecting a useful draft", () => {
    const warnings = warningsFromUnderstanding({ body: "我们当天成交13个，这个结果很稳定。", understandings: [understanding], sourceTexts: ["原作者说当天成交13个，并分享了自己的完整过程。"] });
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNCERTAIN_REFERENCE" }), expect.objectContaining({ code: "UNVERIFIED_REFERENCE_CLAIM" })]));
  });

  it("does not turn an omitted original-author claim into a blocking error", () => {
    const warnings = warningsFromUnderstanding({ body: "内容可以提前建立信任，但结果取决于真实业务。", understandings: [understanding], sourceTexts: [] });
    expect(warnings.some(({ code }) => code === "UNVERIFIED_REFERENCE_CLAIM")).toBe(false);
    expect(warnings).toEqual([expect.objectContaining({ code: "UNCERTAIN_REFERENCE" })]);
  });
});
