import "server-only";
import { db, type Prisma } from "@content-center/db";
import { LLMError } from "@content-center/providers";
import type { ResearchBlock, ResearchCoverage, ResearchSource } from "@content-center/core";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ModelRouter } from "../ai/control/model-router";
import type { LLMRuntime } from "../ai/llm-runtime";
import { ResearchError, type ResearchActor } from "./access";
import { validateResearchBlocks } from "./contracts";
import { FOCUS_V2_SYSTEM_PROMPT, focusV2Prompt, validateFocusV2Answer } from "./focus-v2-analysis";
import { focusV2AnswerSchema, parseFocusV2State, type FocusV2State } from "./focus-v2-contract";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export function focusV2Sources(state: FocusV2State): ResearchSource[] {
  return [
    ...state.accounts.map(account => ({ ref: `A${account.id}`, kind: "BENCHMARK_ACCOUNT" as const, objectId: account.id,
      title: account.name.slice(0, 500), href: `/research/benchmarks/${account.id}`, capturedAt: state.capturedAt,
      publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL" as const, locator: "所选账号",
      excerpt: `${account.name} · ${account.platform}`, version: null })),
    ...state.works.map(work => ({ ref: work.ref, kind: "BENCHMARK_WORK" as const, objectId: work.workId,
      title: work.title.slice(0, 500), href: `/research/benchmarks/${work.accountId}/works/${work.workId}`,
      capturedAt: state.capturedAt, publishedAt: work.publishedAt, eventAt: null, contentOrigin: "AI_READING" as const,
      locator: "已保存的作品深拆；原文摘录可在作品页核对",
      excerpt: work.citations.map(item => item.quote).join("\n").slice(0, 20000), version: work.runId })),
  ];
}
export function focusV2Coverage(state: FocusV2State): ResearchCoverage & { focusV2: FocusV2State } {
  return { requested: state.totalAvailableWorks, observed: state.works.length, readable: state.works.length,
    timed: 0, visual: 0, aiSampleCount: state.works.length, truncated: Boolean(state.deferredWorkIds.length),
    sampling: "SELECTED", timeRange: { from: null, to: null }, gaps: [
      `本次问题只读取 ${state.works.length} 条已完成的新版作品深拆。`,
      ...(state.deferredWorkIds.length ? [`另有 ${state.deferredWorkIds.length} 条已深拆作品因上下文预算未纳入。`] : []),
      "未深拆的作品没有参与正文结构判断；公开互动不能证明因果。",
    ], focusV2: state };
}
export function renderFocusV2Blocks(state: FocusV2State): ResearchBlock[] {
  const answer = state.answer; if (!answer) return [];
  const sources = focusV2Sources(state); const allRefs = sources.map(item => item.ref);
  const text = (id: string, title: string, body: string, sourceRefs: string[], limitation: string): ResearchBlock =>
    ({ id, type: "text", title, text: body, sourceRefs: [...new Set(sourceRefs)], provenance: "AI_INTERPRETATION", limitation });
  const blocks: ResearchBlock[] = [text("focus-direct-answer", "针对这个问题的结论", answer.directAnswer,
    answer.findings.flatMap(item => item.workRefs), answer.researchLimits.join("；").slice(0, 2000))];
  answer.findings.forEach((item, index) => blocks.push(text(`focus-finding-${index}`, item.title,
    `${item.observation}\n为什么重要：${item.whyItMatters}\n原文：${item.citations.map(c => `「${c.quote}」`).join("；")}`,
    [...item.workRefs, ...item.counterRefs], item.limitation)));
  answer.comparisons.forEach((item, index) => blocks.push(text(`focus-compare-${index}`, `账号差别 · ${item.dimension}`,
    item.difference, [...item.workRefs, ...item.counterRefs], item.limitation)));
  answer.dissent.forEach((item, index) => blocks.push(text(`focus-counter-${index}`, "反例或不同做法",
    `${item.observation}\n为什么要看：${item.significance}`, item.workRefs, "反例来自当前已深拆作品。")));
  answer.whatChanged.forEach((item, index) => blocks.push(text(`focus-change-${index}`, "同一账号的变化",
    item.observation, [...item.earlierRefs, ...item.laterRefs], item.limitation)));
  answer.transferable.forEach((item, index) => blocks.push(text(`focus-transfer-${index}`, "可迁移内容机制",
    `${item.mechanism}\n适用：${item.applicability}\n自己的证明：${item.ownProofNeeded}\n可测试：${item.testVariable}`,
    item.sourceWorkRefs, "迁移前需使用自己的真实资料和项目事实。")));
  blocks.push({ id: "sources", type: "sources", title: "本次专项研究的作品来源", provenance: "REAL_DATA",
    sourceRefs: allRefs, limitation: "保存本版所用作品研究的摘录，原始依据请到对应作品页核对。", refs: sources });
  return validateResearchBlocks(blocks, sources);
}
export async function executeFocusV2Run(actor: ResearchActor, run: { id: string; sessionId: string; coverage: unknown }, dependencies: { runtime?: LLMRuntime } = {}) {
  const state = parseFocusV2State(run.coverage);
  if (!state) throw new ResearchError("INVALID_EVIDENCE_SNAPSHOT", "专项研究证据快照不可用，请重新开始。", 409);
  const running = { id: run.id, sessionId: run.sessionId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "RUNNING" as const };
  await db.researchRun.updateMany({ where: running, data: { stage: "ANALYZING", sourceRefs: json(focusV2Sources(state)) } });
  const runtime = dependencies.runtime ?? (await new ModelRouter().route(actor.workspaceId, { taskType: "RESEARCH", structuredOutput: true, reasoningNeed: "MEDIUM" })).runtime;
  if (runtime.mode === "MOCK") throw new ResearchError("PROVIDER_UNAVAILABLE", "专项研究需要可用的真实模型。", 503);
  const result = await executeStructuredAIRun({ workspaceId: actor.workspaceId, userId: actor.userId,
    action: "ANALYZE_SOURCES", operation: "RESEARCH", promptVersion: 8,
    inputSummary: { researchRunId: run.id, accountIds: state.accounts.map(item => item.id), workAnalysisCount: state.works.length,
      evidenceFingerprint: state.fingerprint },
    metadata: { researchSessionId: run.sessionId, researchRunId: run.id, workRunIds: state.works.map(item => item.runId) },
    contextTruncated: Boolean(state.deferredWorkIds.length),
    onRunCreated: async aiRunId => { await db.researchRun.updateMany({ where: running, data: { aiRunId } }); },
    generate: async provider => {
      const prompt = focusV2Prompt(state); let correction: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { const response = await provider.generateStructured({ systemPrompt: FOCUS_V2_SYSTEM_PROMPT,
          prompt: JSON.stringify({ ...prompt, ...(correction ? { correction, instruction: "修正结构、作品引用或原文引文。" } : {}) }),
          maxCompletionTokens: 9000 }, focusV2AnswerSchema);
          try { validateFocusV2Answer(response.data.value, state); }
          catch (error) { throw new LLMError("LLM_INVALID_RESPONSE", error instanceof Error ? error.message : "FOCUS_V2_EVIDENCE_INVALID", false); }
          return response;
        } catch (error) {
          if (!(error instanceof LLMError) || error.code !== "LLM_INVALID_RESPONSE") throw error;
          if (attempt === 1) throw new LLMError("LLM_INVALID_RESPONSE", "专项研究未通过结构或依据核对；旧结果已保留。", false,
            { ...error.details, validationIssues: error.details.validationIssues?.slice(0, 8) ?? [{ path: "focusV2", code: error.message, receivedType: "model_output" }] });
          correction = error.details.validationIssues ?? { evidenceCheck: error.message };
        }
      }
      throw new LLMError("LLM_INVALID_RESPONSE", "专项研究未通过核对。", false);
    },
  }, { runtime });
  const completed: FocusV2State = { ...state, answer: validateFocusV2Answer(result.output, state) };
  await db.researchRun.updateMany({ where: running, data: { coverage: json(focusV2Coverage(completed)), blocks: json(renderFocusV2Blocks(completed)),
    sourceRefs: json(focusV2Sources(completed)), resultTitle: `${state.question.slice(0, 120)} · 专项研究`, status: "COMPLETED",
    stage: "COMPLETED", finishedAt: new Date(), errorCode: null, errorMessage: null } });
}
