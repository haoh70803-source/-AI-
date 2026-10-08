import "server-only";
import { db, type Prisma } from "@content-center/db";
import { LLMError } from "@content-center/providers";
import type { ResearchBlock, ResearchCoverage, ResearchSource } from "@content-center/core";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ModelRouter } from "../ai/control/model-router";
import type { LLMRuntime } from "../ai/llm-runtime";
import { ResearchError, type ResearchActor } from "./access";
import { validateResearchBlocks } from "./contracts";
import { TOPIC_OPPORTUNITY_V2_SYSTEM_PROMPT, topicOpportunityV2Prompt, validateTopicOpportunityV2Answer } from "./topic-opportunity-v2-analysis";
import { parseTopicOpportunityV2State, topicOpportunityV2AnswerSchema, type TopicOpportunityV2State } from "./topic-opportunity-v2-contract";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const TOPIC_V2_QUESTION = "这个趋势里大家在讲什么；结合我的项目和真实资料，现在有哪些值得验证的选题机会？";

export function topicOpportunityV2Sources(state: TopicOpportunityV2State): ResearchSource[] {
  const common = { capturedAt: state.capturedAt, eventAt: null };
  return [
    { ...common, ref: "T1", kind: "TREND", objectId: state.trend.snapshotId, title: state.trend.title.slice(0, 500),
      href: `/research/trends/${state.trend.stableKey}`, publishedAt: null, contentOrigin: "ORIGINAL", locator: "趋势榜单快照",
      excerpt: `观察于 ${state.trend.observedAt}；排名 ${state.trend.rank ?? "未提供"}。观察时间不等于事件发生时间。`, version: state.trend.snapshotId },
    { ...common, ref: "P1", kind: "USER_INPUT", objectId: state.project.id, title: state.project.title.slice(0, 500),
      href: `/dashboard?project=${state.project.id}`, publishedAt: null, contentOrigin: "USER_PROVIDED", locator: "用户所选项目",
      excerpt: [state.project.title, state.project.goal, state.project.audience].filter(Boolean).join("\n"), version: null },
    ...state.ownMaterials.map(item => ({ ...common, ref: item.ref, kind: "MATERIAL" as const, objectId: item.id,
      title: item.title.slice(0, 500), href: `/library/${item.id}`, publishedAt: null, contentOrigin: "ORIGINAL" as const,
      locator: "用户所选资料的当前可读内容", excerpt: item.excerpt, version: item.version })),
    ...state.related.map(item => ({ ...common, ref: item.ref, kind: "BENCHMARK_WORK" as const, objectId: item.externalId,
      title: item.title.slice(0, 500), href: item.url, publishedAt: item.publishedAt,
      contentOrigin: item.bodyOrigin === "TRANSCRIPT" ? "MACHINE_TRANSCRIPT" as const : item.bodyOrigin === "SOURCE_UNDERSTANDING" ? "AI_READING" as const : "ORIGINAL" as const,
      locator: item.bodyExcerpt ? "主动搜索的候选作品及已收录正文摘录" : "主动搜索的候选作品标题，未读取完整正文",
      excerpt: item.bodyExcerpt || item.title, version: null })),
    ...state.workMethods.map(item => ({ ...common, ref: item.ref, kind: "BENCHMARK_WORK" as const, objectId: item.workId,
      title: item.title.slice(0, 500), href: `/research/results/run/${item.runId}`, publishedAt: null,
      contentOrigin: "AI_READING" as const, locator: "已保存作品研究的方法摘录", excerpt: `${item.oneLine}\n${item.mechanism}\n原文：${item.citation}`, version: item.runId })),
  ];
}

export function topicOpportunityV2Coverage(state: TopicOpportunityV2State): ResearchCoverage & { topicOpportunityV2: TopicOpportunityV2State } {
  return { requested: state.related.length + state.ownMaterials.length, observed: state.related.length + state.ownMaterials.length,
    readable: state.related.filter(item => item.bodyExcerpt).length + state.ownMaterials.length, timed: 0, visual: 0,
    aiSampleCount: state.workMethods.length, truncated: state.related.length >= 12 || state.ownMaterials.some(item => item.excerpt.length >= 4500),
    sampling: "SELECTED", timeRange: { from: null, to: null },
    gaps: ["趋势记录是观察快照；相关作品来自一次主动搜索，不能代表全平台。", ...(!state.related.length ? ["当前没有检索到相关作品，不能判断内容拥挤或空白。"] : []),
      "只有标题的相关作品没有正文结构证据。"], topicOpportunityV2: state };
}

export function renderTopicOpportunityV2Blocks(state: TopicOpportunityV2State): ResearchBlock[] {
  const answer = state.answer; if (!answer) return [];
  const sources = topicOpportunityV2Sources(state); const refs = sources.map(item => item.ref);
  const text = (id: string, title: string, body: string, sourceRefs: string[], limitation: string): ResearchBlock =>
    ({ id, type: "text", title, text: body, sourceRefs: [...new Set(sourceRefs)], provenance: "AI_INTERPRETATION", limitation });
  const blocks: ResearchBlock[] = [
    text("topic-v2-meaning", "这个趋势为什么值得关注", `${answer.trendMeaning}\n${answer.whyNow}`, ["T1"], answer.whyNowLimit),
    text("topic-v2-angles", "目前看见的内容切角", answer.angleClusters.map(item => `${item.angle}：${item.howItIsTold}`).join("\n") || "当前搜索没有足够内容切角。", answer.angleClusters.flatMap(item => item.contentRefs), "只代表本次查询的候选作品。"),
    text("topic-v2-fit", "我们的项目凭什么能讲", `${answer.businessFit.reason}\n受众：${answer.businessFit.audience}\n待补：${answer.businessFit.missingEvidence.join("；") || "暂无"}`, ["P1", ...answer.businessFit.ownEvidenceRefs], "项目与资料的当前版本可能后续变化。"),
  ];
  answer.opportunities.forEach((item, index) => blocks.push(text(`topic-v2-opportunity-${index}`, `选题机会 · ${item.topic}`,
    `${item.angle}\n为什么现在讲：${item.whyNow}\n与已有内容的差别：${item.difference}\n适用机制：${item.mechanism}\n自己的证明：${item.ownProof}\n结构：${item.flow.join(" → ")}`,
    ["T1", "P1", ...item.trendContentRefs, ...item.ownEvidenceRefs], item.limitation)));
  blocks.push({ id: "sources", type: "sources", title: "本版趋势、相关内容与自有资料快照", sourceRefs: refs,
    provenance: "REAL_DATA", limitation: "来源快照固定；后续打开链接可能看到新的内容。", refs: sources });
  return validateResearchBlocks(blocks, sources);
}

export async function executeTopicOpportunityV2Run(actor: ResearchActor, run: { id: string; sessionId: string; coverage: unknown }, dependencies: { runtime?: LLMRuntime } = {}) {
  const state = parseTopicOpportunityV2State(run.coverage);
  if (!state) throw new ResearchError("INVALID_EVIDENCE_SNAPSHOT", "选题研究的证据快照不可用，请重新开始。", 409);
  const running = { id: run.id, sessionId: run.sessionId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "RUNNING" as const };
  await db.researchRun.updateMany({ where: running, data: { stage: "ANALYZING", sourceRefs: json(topicOpportunityV2Sources(state)) } });
  const runtime = dependencies.runtime ?? (await new ModelRouter().route(actor.workspaceId, { taskType: "RESEARCH", structuredOutput: true, reasoningNeed: "MEDIUM" })).runtime;
  if (runtime.mode === "MOCK") throw new ResearchError("PROVIDER_UNAVAILABLE", "选题机会研究需要可用的真实模型。", 503);
  const result = await executeStructuredAIRun({ workspaceId: actor.workspaceId, userId: actor.userId, projectId: state.project.id,
    action: "ANALYZE_SOURCES", operation: "RESEARCH", promptVersion: 12,
    inputSummary: { researchRunId: run.id, trendSnapshotId: state.trend.snapshotId, relatedCount: state.related.length, ownMaterialCount: state.ownMaterials.length },
    metadata: { researchSessionId: run.sessionId, researchRunId: run.id, trendKey: state.trend.stableKey, projectId: state.project.id,
      materialIds: state.ownMaterials.map(item => item.id) }, contextTruncated: state.related.length >= 12,
    onRunCreated: async aiRunId => { await db.researchRun.updateMany({ where: running, data: { aiRunId } }); },
    generate: async provider => {
      const prompt = topicOpportunityV2Prompt(state); let correction: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await provider.generateStructured({ systemPrompt: TOPIC_OPPORTUNITY_V2_SYSTEM_PROMPT,
            prompt: JSON.stringify({ ...prompt, ...(correction ? { correction, instruction: "修正结构或范围引用，只使用本次快照。" } : {}) }),
            maxCompletionTokens: 8000 }, topicOpportunityV2AnswerSchema);
          try { validateTopicOpportunityV2Answer(response.data.value, state); }
          catch (error) { throw new LLMError("LLM_INVALID_RESPONSE", error instanceof Error ? error.message : "TOPIC_V2_EVIDENCE_INVALID", false); }
          return response;
        } catch (error) {
          if (!(error instanceof LLMError) || error.code !== "LLM_INVALID_RESPONSE") throw error;
          if (attempt === 1) throw new LLMError("LLM_INVALID_RESPONSE", "趋势选题研究未通过结构或依据核对；旧结果已保留。", false,
            { ...error.details, validationIssues: error.details.validationIssues?.slice(0, 8) ?? [{ path: "topicV2", code: error.message, receivedType: "model_output" }] });
          correction = error.details.validationIssues ?? { evidenceCheck: error.message };
        }
      }
      throw new LLMError("LLM_INVALID_RESPONSE", "趋势选题研究未通过核对。", false);
    },
  }, { runtime });
  const completed: TopicOpportunityV2State = { ...state, answer: validateTopicOpportunityV2Answer(result.output, state) };
  await db.researchRun.updateMany({ where: running, data: { coverage: json(topicOpportunityV2Coverage(completed)), blocks: json(renderTopicOpportunityV2Blocks(completed)),
    sourceRefs: json(topicOpportunityV2Sources(completed)), resultTitle: `${state.trend.title.slice(0, 120)} · 选题机会`, status: "COMPLETED", stage: "COMPLETED",
    finishedAt: new Date(), errorCode: null, errorMessage: null } });
}
