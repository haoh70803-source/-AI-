import type { AccountV2State } from "../server/research/account-v2-contract";
export function accountAnswer(state: AccountV2State) {
  const [first, second] = state.selected; if (!first || !second) throw new Error("FIXTURE_WORKS_MISSING");
  const earlier = [first, second].sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
  return { inOneSentence: "围绕具体问题给出可观察的解决路径。", whatItDoes: "把问题和方法相连。",
    contentMap: [{ direction: "实际问题", meaning: "让观众先识别问题", workRefs: [first.ref, second.ref] }],
    topicLogic: "从真实问题出发。", openingLogic: "先说具体问题。", structureLogic: "问题之后接方法。", proofLogic: "作品说了方法，但仍要核对实际展示。",
    expressionDNA: "动作词多于抽象形容。", ctaLogic: "当前样本没有稳定行动模式。",
    patterns: [{ id: "pattern-one", name: "问题先行", kind: "选题", howUsed: "先指出问题，再给操作。", topicContexts: ["用户问题"], continuation: "后面演示方法。",
      proofPairing: "展示操作过程。", workRefs: [first.ref, second.ref], counterRefs: [], performanceObservation: null, recentChange: null,
      transferable: "从自己的客户问题切入。", limitation: "样本仍少。",
      citations: [first, second].map(item => ({ ref: item.ref, quote: item.citations[0]!.quote })) }],
    counterExamples: [], highVsTypical: { observation: "当前公开指标只是样本内对照。", highRefs: [second.ref], typicalRefs: [first.ref], counterRefs: [], limitation: "不能用点赞证明因果。" },
    evolution: [{ dimension: "表达", earlier: "先说问题", later: "先说问题并展示操作", earlierRefs: [earlier[0]!.ref], laterRefs: [earlier[1]!.ref],
      observation: "两个样本的处理细节不同。", limitation: "不能仅凭两条作品推断长期趋势。" }],
    learn: ["找真实问题"], doNotCopy: ["不搬运具体案例"],
    skillCandidates: [{ name: "问题先行", goal: "帮助观众认出问题", whenToUse: "有真实问题时", inputs: ["问题", "过程"],
      steps: ["写出问题", "展示过程"], proofRequired: "自有操作记录", cautions: "继续验证", prohibited: "编造效果", testVariables: ["开头顺序"],
      exampleFlow: ["问题", "过程"], patternIds: ["pattern-one"] }], researchLimits: ["只综合当前完成的作品深拆。"] };
}
