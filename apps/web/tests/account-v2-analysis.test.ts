import { describe, expect, it } from "vitest";
import { accountV2Prompt, validateAccountV2Answer } from "../server/research/account-v2-analysis";
import type { AccountV2Answer, AccountV2State } from "../server/research/account-v2-contract";

const state: AccountV2State = { schemaVersion: "account-research-v2", account: { id: "account", name: "账号", platform: "DOUYIN" },
  capturedAt: "2026-09-29T00:00:00Z", fingerprint: "a".repeat(64), collectionRunId: null, totalWorks: 12, readableWorks: 4, deferredWorkIds: [], answer: null,
  selected: [
    { ref: "W1", workId: "work-1", runId: "run-1", title: "先看真实问题", publishedAt: "2026-08-01", views: 100, likes: 10,
      topic: "用户问题", angle: "先提出问题", oneLine: "用问题开场后展示过程。", playbook: ["问题先行"], structure: ["问题", "操作"],
      proofKinds: ["DEMO"], expression: ["动作具体"], cta: null, strengths: ["展示过程"], weaknesses: ["结果证明不足"],
      citations: [{ ref: "M1", quote: "先展示用户的真实问题" }] },
    { ref: "W2", workId: "work-2", runId: "run-2", title: "把问题放在开头", publishedAt: "2026-09-01", views: 150, likes: 15,
      topic: "用户问题", angle: "从问题到方法", oneLine: "让观众看到解决路径。", playbook: ["问题先行"], structure: ["问题", "方法"],
      proofKinds: ["ORAL"], expression: ["短句"], cta: null, strengths: ["明确问题"], weaknesses: ["案例不足"],
      citations: [{ ref: "M1", quote: "用户提出了一个需要解决的问题" }] },
  ] };

function answer(): AccountV2Answer {
  return { inOneSentence: "经常先提出用户问题，再给一条解决路径。", whatItDoes: "围绕用户实际问题组织内容。",
    contentMap: [{ direction: "问题解决", meaning: "从困境进入操作", workRefs: ["W1", "W2"] }],
    topicLogic: "先找到具体问题。", openingLogic: "直接说问题。", structureLogic: "问题后接方法。", proofLogic: "演示与口述并存，未核实效果。",
    expressionDNA: "多用短句和动作词。", ctaLogic: "样本没有稳定 CTA。",
    patterns: [{ id: "pattern-one", name: "问题先行", kind: "选题与开头", howUsed: "先让用户认出问题，再展示解决路径。", topicContexts: ["用户问题"],
      continuation: "后面给出方法。", proofPairing: "有时演示，有时口述。", workRefs: ["W1", "W2"], counterRefs: [],
      performanceObservation: "两个样本都有公开点赞，不能说明因果。", recentChange: null, transferable: "从自己的用户问题开始。", limitation: "只有两个深拆样本。",
      citations: [{ ref: "W1", quote: "先展示用户的真实问题" }, { ref: "W2", quote: "用户提出了一个需要解决的问题" }] }],
    counterExamples: [], highVsTypical: { observation: "公开表现有差别，样本不足以归因。", highRefs: ["W2"], typicalRefs: ["W1"], counterRefs: [], limitation: "没有留存和转化数据。" },
    evolution: [{ dimension: "证明方式", earlier: "过程演示", later: "口述方法", earlierRefs: ["W1"], laterRefs: ["W2"],
      observation: "当前样本的证明方式不同。", limitation: "不能把两个样本当作长期趋势。" }],
    learn: ["从具体问题开始"], doNotCopy: ["不要照搬客户案例"],
    skillCandidates: [{ name: "问题先行内容", goal: "帮助观众识别问题并看到方法", whenToUse: "有真实问题和过程时", inputs: ["问题", "过程"],
      steps: ["指出真实问题", "展示真实过程"], proofRequired: "自己的操作记录", cautions: "样本少，继续验证", prohibited: "编造结果", testVariables: ["开头顺序"],
      exampleFlow: ["问题", "过程", "结果"], patternIds: ["pattern-one"] }], researchLimits: ["只有两条深拆作品。"] };
}

describe("account V2 synthesis from saved work analyses", () => {
  it("accepts grounded cross-work patterns and does not send raw transcripts", () => {
    expect(validateAccountV2Answer(answer(), state).patterns[0]?.workRefs).toEqual(["W1", "W2"]);
    const prompt = accountV2Prompt(state);
    expect(prompt.scope.deeplyAnalyzedWorks).toBe(2);
    expect(JSON.stringify(prompt)).not.toContain("完整原始文字稿");
  });
  it("rejects a one-work pattern or a quote absent from that work", () => {
    const one = answer(); one.patterns[0]!.workRefs = ["W1"];
    expect(() => validateAccountV2Answer(one, state)).toThrow(/Too small|ACCOUNT_V2_PATTERN_NEEDS_MULTIPLE_WORKS/);
    const invented = answer(); invented.patterns[0]!.citations[1]!.quote = "没有被保存的作品原话";
    expect(() => validateAccountV2Answer(invented, state)).toThrow("ACCOUNT_V2_QUOTE_NOT_IN_WORK_SNAPSHOT");
  });
  it("rejects reversed time claims and skill candidates without a real pattern", () => {
    const reversed = answer(); reversed.evolution[0]!.earlierRefs = ["W2"]; reversed.evolution[0]!.laterRefs = ["W1"];
    expect(() => validateAccountV2Answer(reversed, state)).toThrow("ACCOUNT_V2_EVOLUTION_TIME_UNSUPPORTED");
    const skill = answer(); skill.skillCandidates[0]!.patternIds = ["invented"];
    expect(() => validateAccountV2Answer(skill, state)).toThrow("ACCOUNT_V2_SKILL_WITHOUT_PATTERN");
  });
});
