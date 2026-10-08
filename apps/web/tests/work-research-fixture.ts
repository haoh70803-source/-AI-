import type { WorkDeepAnswer, WorkDeepAnswerV2, WorkEvidence } from "../server/research/work-research-contract";

export const sampleBody = "先展示用户的真实问题。接着演示操作。最后解释结果如何用于自己。";
export const sampleEvidence: WorkEvidence = { schemaVersion: "work-evidence-v1", fingerprint: "a".repeat(64), capturedAt: "2026-09-28T00:00:00Z", accountId: "account", workId: "work", sourceItemId: "source", mediaAssetId: null,
  title: "怎样解决真实问题", url: "https://example.test/work", publishedAt: "2026-09-20T00:00:00Z", observedAt: "2026-09-28T00:00:00Z",
  metrics: { views: null, likes: 12, comments: null, favorites: null, shares: null }, durationMs: 18000,
  contentText: sampleBody, contentLength: sampleBody.length, contentHash: "b".repeat(64), contentVersion: "TRANSCRIPT:v1", contentOrigin: "TRANSCRIPT", truncated: false,
  segments: [{ startMs: 0, endMs: 6000, text: "先展示用户的真实问题。" }, { startMs: 6000, endMs: 12000, text: "接着演示操作。" }, { startMs: 12000, endMs: 18000, text: "最后解释结果如何用于自己。" }] };
export function sampleAnswer(): WorkDeepAnswer {
  return { summary: "这条内容从问题走向可操作结果。", limitations: ["只有文字稿，没有观看留存数据。"],
    understanding: { about: "用演示回应真实问题。", audience: "有此问题的人", situation: "正在找方法", problem: "不知道怎么做", beliefChange: null, promise: "给出可操作步骤", coreClaim: "结果要能用于自己", desiredOutcome: "学会操作", citation: { ref: "M1", quote: "先展示用户的真实问题" } },
    topicIdea: { domain: "操作教学", theme: "问题解决", audience: "有此问题的人", problem: "不知道怎么做", situation: "需要明确过程", angle: "从问题进入操作", promise: "让结果可用", informationGap: "操作过程尚不清楚", intent: "教会操作", whyThisTopic: "先指出真实问题，再提供可以观察的操作。", citation: { ref: "M1", quote: "接着演示操作" } },
    structureBlocks: [
      { order: 1, startMs: 0, endMs: 6000, role: "提出问题", content: "先展示用户的真实问题。", purpose: "建立相关性", expression: "直接说问题", citation: { ref: "M1", quote: "先展示用户的真实问题。" } },
      { order: 2, startMs: 6000, endMs: 12000, role: "实际演示", content: "接着演示操作。", purpose: "把方法展示出来", expression: "动作描述", citation: { ref: "M1", quote: "接着演示操作。" } },
      { order: 3, startMs: 12000, endMs: 18000, role: "兑现结果", content: "最后解释结果如何用于自己。", purpose: "让观众理解价值", expression: null, citation: { ref: "M1", quote: "最后解释结果如何用于自己。" } },
    ],
    mechanisms: [
      { kind: "ATTENTION", name: "问题到操作", description: "先提出问题，再让人期待操作。", claim: null, proof: null, hypothesis: "观众可能因为想看做法而继续看。", limitation: "没有真实留存数据。", citation: { ref: "M1", quote: "先展示用户的真实问题" } },
      { kind: "PROOF", name: "操作展示", description: "通过演示说明做法。", claim: "方法能操作", proof: "作品中演示了操作", hypothesis: "看见过程可能比抽象承诺更可信。", limitation: "只看到转写，尚未核验画面。", citation: { ref: "M1", quote: "接着演示操作" } },
    ],
    transferable: { principle: "问题先行，再展示过程与可用结果", why: "让用户看见问题被解决的路径。", surfaceElements: ["原作品的具体问题和措辞"], applicability: "有真实可演示过程时", ownEvidenceNeeded: "自己的真实操作和结果", steps: ["写清自己的用户问题", "展示真实操作过程", "解释自己的结果如何被使用"], testVariable: "比较先提问题与先展示结果两种开头", limitation: "当前只有单条内容，效果需要自己测试。", citation: { ref: "M1", quote: "最后解释结果如何用于自己。" } },
  };
}

export function sampleAnswerV2(): WorkDeepAnswerV2 {
  const base = sampleAnswer();
  const problem = { ref: "M1" as const, quote: "先展示用户的真实问题" };
  const demo = { ref: "M1" as const, quote: "接着演示操作" };
  const result = { ref: "M1" as const, quote: "最后解释结果如何用于自己" };
  return { ...base,
    structureBlocks: base.structureBlocks.map((block, index) => ({ ...block,
      contentDecision: ["先让观众认出自己的问题。", "展示过程，回应此前的问题。", "解释成果如何被观众使用。"][index]!,
      audienceState: ["知道这件事与自己有关", "期待看到操作", "理解结果用途"][index]!,
      nextQuestion: index === 2 ? null : ["具体怎么做？", "做完后有什么用？"][index]!,
      valueContribution: index === 1 ? "NEW_ACTION" : "NEW_INFORMATION" })),
    decision: {
      executiveSummary: { oneLine: "先指出用户问题，再演示操作，最后说明结果如何用于自己。", topicDecision: "用可演示的过程回答真实问题。", corePlaybook: ["问题先行", "展示过程", "解释可用结果"] },
      topicLogic: { surfaceProblem: "用户不知道怎么做", deeperStakes: null, angle: "从真实问题切入操作", whyThisAngle: "先让观众确认自己也有这个问题。", reframe: null,
        contentIntent: "教会操作", businessIntent: null, citation: problem },
      audienceRoles: [{ role: "有问题的用户", relation: "VIEWER", need: "知道怎么操作", citation: problem }],
      painLadder: [{ step: "有实际问题却不知道操作方法", consequence: null, citation: problem }],
      packaging: { titlePromise: "解决真实问题", opening: "先展示用户的真实问题", clickReason: "观众可能想看实际做法", coverOrVisual: null, citation: problem },
      promisePayoff: { promised: "解决真实问题", delivered: "解释结果如何用于自己", gap: null, assessment: "PARTIAL", citation: result },
      audienceJourney: [{ afterBlock: 1, before: "不确定是否相关", trigger: "展示真实问题", after: "期待看操作", citation: problem }],
      informationRelease: [{ atBlock: 2, move: "ANSWER", effect: "以操作回应前面提出的问题。", citation: demo }],
      claims: [{ claim: "结果可以用于自己", proofKind: "ORAL", offeredProof: "口述了结果用途", verifiedExternally: false, citation: result }],
      expressionPatterns: [{ finding: "先问题后动作", whyItMatters: "避免一开始堆方法。", citation: problem }],
      ctaAnalysis: { action: null, preparation: null, readiness: "ABSENT", friction: null, citation: result },
      strengths: [{ finding: "用实际操作回应问题", whyItMatters: "观众能看见解决路径。", citation: demo }],
      weaknesses: [{ finding: "没有给出可核验结果", whyItMatters: "只凭转写难确认演示成效。", citation: result }],
      testVariables: [{ variable: "开头方式", alternative: "先展示结果再提出问题", reason: "检验哪种顺序更适合自己的受众" }],
      creationBlueprint: { audience: "有明确问题的用户", pain: "不知道怎么操作", stakes: null, angle: "从真实问题进入方法", promise: "展示可用过程", reframe: null,
        objection: null, proofNeeded: "自己的真实操作和结果", flow: ["指出自己的用户问题", "展示实际操作", "说明自己结果的用途"], expression: "动作具体", cta: null },
      displayCorrections: [], researchLimits: ["仅有文字稿，无法核验画面中的操作。"],
    },
  };
}

export function sampleDecisionPass() {
  return sampleAnswerV2().decision;
}
