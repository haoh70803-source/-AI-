import "server-only";
import { db, type Prisma } from "@content-center/db";
import { LLMError } from "@content-center/providers";
import type { ResearchBlock, ResearchCoverage, ResearchSource } from "@content-center/core";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ModelRouter } from "../ai/control/model-router";
import type { LLMRuntime } from "../ai/llm-runtime";
import { ResearchError, type ResearchActor } from "./access";
import { validateResearchBlocks } from "./contracts";
import { ACCOUNT_V2_SYSTEM_PROMPT, accountV2Prompt, validateAccountV2Answer } from "./account-v2-analysis";
import { accountV2AnswerSchema, parseAccountV2State, type AccountV2State } from "./account-v2-contract";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const ACCOUNT_V2_QUESTION = "先研究单条作品，再比较这个账号稳定的内容模式、反例与变化；提炼可迁移方法。";

export function accountV2Sources(state: AccountV2State): ResearchSource[] {
  return state.selected.map(work => ({ ref: work.ref, kind: "BENCHMARK_WORK", objectId: work.workId,
    title: work.title.slice(0, 500), href: `/research/benchmarks/${state.account.id}/works/${work.workId}`,
    capturedAt: state.capturedAt, publishedAt: work.publishedAt, eventAt: null,
    contentOrigin: "AI_READING", locator: "已保存的作品级分析；打开作品页可核对原始依据",
    excerpt: work.citations.map(item => item.quote).join("\n").slice(0, 20000), version: work.runId }));
}

export function accountV2Coverage(state: AccountV2State): ResearchCoverage & { accountV2: AccountV2State } {
  return { requested: state.totalWorks, observed: state.totalWorks, readable: state.readableWorks,
    timed: 0, visual: 0, aiSampleCount: state.selected.length, truncated: state.deferredWorkIds.length > 0,
    sampling: "SELECTED", timeRange: { from: null, to: null },
    gaps: [`本版综合 ${state.selected.length} 条已完成的作品研究。`,
      ...(state.deferredWorkIds.length ? [`另有 ${state.deferredWorkIds.length} 条作品研究因上下文预算未纳入本版。`] : []),
      "公开互动只用于样本内对照，不证明某方法造成更高表现。"], accountV2: state };
}

export function renderAccountV2Blocks(state: AccountV2State): ResearchBlock[] {
  const answer = state.answer; if (!answer) return [];
  const sources = accountV2Sources(state); const allRefs = sources.map(item => item.ref);
  const text = (id: string, title: string, body: string, refs: string[], limitation: string): ResearchBlock =>
    ({ id, type: "text", title, text: body, sourceRefs: [...new Set(refs)], provenance: "AI_INTERPRETATION", limitation });
  const blocks: ResearchBlock[] = [
    text("account-v2-summary", "这个账号主要在做什么", `${answer.inOneSentence}\n${answer.whatItDoes}`, allRefs, answer.researchLimits.join("；").slice(0, 2000)),
    text("account-v2-map", "内容地图", answer.contentMap.map(item => `${item.direction}：${item.meaning}`).join("\n"), answer.contentMap.flatMap(item => item.workRefs), "只覆盖本版已深拆的作品。"),

  ];
  const writing: Array<[string, string, string]> = [["topic", "选题怎么选择", answer.topicLogic], ["opening", "开头怎么切入", answer.openingLogic],
    ["structure", "内容怎么推进", answer.structureLogic], ["proof", "怎样让人理解和相信", answer.proofLogic],
    ["expression", "表达有什么特点", answer.expressionDNA], ["cta", "怎样引出下一步", answer.ctaLogic]];
  writing.filter(([, , body]) => body?.trim()).forEach(([id, title, body]) => blocks.push(text(`account-v2-writing-${id}`, title, body, allRefs, "只基于本次读过的作品，具体写法要结合自己的内容。")));
  answer.patterns.forEach((item, index) => blocks.push(text(`account-v2-pattern-${index}`, `稳定做法 · ${item.name}`,
    `${item.howUsed}\n通常怎样接：${item.continuation}\n搭配证明：${item.proofPairing || "未见稳定搭配"}\n可迁移：${item.transferable}\n反例：${item.counterRefs.join("、") || "尚无充分反例"}`,
    [...item.workRefs, ...item.counterRefs], item.limitation)));
  answer.evolution.forEach((item, index) => blocks.push(text(`account-v2-evolution-${index}`, `最近的变化 · ${item.dimension}`,
    `${item.earlier} → ${item.later}\n${item.observation}`, [...item.earlierRefs, ...item.laterRefs], item.limitation)));
  answer.skillCandidates.forEach((item, index) => blocks.push(text(`account-v2-skill-${index}`, `可以借鉴的写法 · ${item.name}`,
    `${item.goal}\n适用：${item.whenToUse}\n步骤：${item.steps.join(" → ")}\n自己的证明：${item.proofRequired}\n改写时注意：${item.prohibited}`,
    answer.patterns.filter(pattern => item.patternIds.includes(pattern.id)).flatMap(pattern => pattern.workRefs),
    "结合自己的读者和真实材料选择写法，不直接照搬原账号的事实。")));
  blocks.push({ id: "sources", type: "sources", title: "作品研究来源", sourceRefs: allRefs, provenance: "REAL_DATA",
    limitation: "研究版本保留所用作品的摘要与原文摘录；打开作品页可查看完整研究。", refs: sources });
  return validateResearchBlocks(blocks, sources);
}

export async function executeAccountV2Run(actor: ResearchActor, run: { id: string; sessionId: string; coverage: unknown }, dependencies: { runtime?: LLMRuntime } = {}) {
  const state = parseAccountV2State(run.coverage);
  if (!state || state.selected.length < 2) throw new ResearchError("WORK_COMPARISON_REQUIRED", "请先深拆不同作品，再进行账号综合研究。", 409);
  const running = { id: run.id, sessionId: run.sessionId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "RUNNING" as const };
  await db.researchRun.updateMany({ where: running, data: { stage: "ANALYZING", sourceRefs: json(accountV2Sources(state)) } });
  const runtime = dependencies.runtime ?? (await new ModelRouter().route(actor.workspaceId, { taskType: "RESEARCH", structuredOutput: true, reasoningNeed: "MEDIUM" })).runtime;
  if (runtime.mode === "MOCK") throw new ResearchError("PROVIDER_UNAVAILABLE", "账号研究需要可用的真实模型。", 503);
  const result = await executeStructuredAIRun({ workspaceId: actor.workspaceId, userId: actor.userId, action: "ANALYZE_SOURCES", operation: "RESEARCH", promptVersion: 10,
    inputSummary: { researchRunId: run.id, accountId: state.account.id, workAnalysisCount: state.selected.length, fingerprint: state.fingerprint },
    metadata: { researchSessionId: run.sessionId, researchRunId: run.id, accountId: state.account.id, workRunIds: state.selected.map(item => item.runId) },
    contextTruncated: state.deferredWorkIds.length > 0,
    onRunCreated: async aiRunId => { await db.researchRun.updateMany({ where: running, data: { aiRunId } }); },
    generate: async provider => {
      const prompt = accountV2Prompt(state); let correction: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await provider.generateStructured({ systemPrompt: ACCOUNT_V2_SYSTEM_PROMPT,
            prompt: JSON.stringify({ ...prompt, ...(correction ? { correction, instruction: "修正上一轮结构或引用错误，只引用提供的作品研究摘录。" } : {}) }),
            maxCompletionTokens: 11000 }, accountV2AnswerSchema);
          try { validateAccountV2Answer(response.data.value, state); }
          catch (error) { throw new LLMError("LLM_INVALID_RESPONSE", error instanceof Error ? error.message : "ACCOUNT_V2_EVIDENCE_INVALID", false); }
          return response;
        } catch (error) {
          if (!(error instanceof LLMError) || error.code !== "LLM_INVALID_RESPONSE") throw error;
          if (attempt === 1) throw new LLMError("LLM_INVALID_RESPONSE", "账号综合研究未通过结构或依据核对；旧结果已保留。", false,
            { ...error.details, validationIssues: error.details.validationIssues?.slice(0, 8) ?? [{ path: "accountV2", code: error.message, receivedType: "model_output" }] });
          correction = error.details.validationIssues ?? { evidenceCheck: error.message };
        }
      }
      throw new LLMError("LLM_INVALID_RESPONSE", "账号综合研究未通过核对。", false);
    },
  }, { runtime });
  const completed: AccountV2State = { ...state, answer: validateAccountV2Answer(result.output, state) };
  await db.researchRun.updateMany({ where: running, data: { coverage: json(accountV2Coverage(completed)), blocks: json(renderAccountV2Blocks(completed)),
    sourceRefs: json(accountV2Sources(completed)), resultTitle: `${state.account.name} · 内容方法研究`, status: "COMPLETED", stage: "COMPLETED", finishedAt: new Date(), errorCode: null, errorMessage: null } });
}
