import "server-only";
import { z } from "zod";
import { db, type Prisma } from "@content-center/db";
import { LLMError } from "@content-center/providers";
import type { ResearchBlock, ResearchCoverage, ResearchSource } from "@content-center/core";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ModelRouter } from "../ai/control/model-router";
import type { LLMRuntime } from "../ai/llm-runtime";
import { ResearchError, type ResearchActor } from "./access";
import { validateResearchBlocks } from "./contracts";
import { WORK_DEEP_SYSTEM_PROMPT, WORK_DECISION_SYSTEM_PROMPT, legacyWorkAnswer, validateWorkDecisionPass, validateWorkDeepAnswer, workDecisionPrompt, workDeepPrompt } from "./work-research-analysis";
import { workDecisionPassSchema, workDeepAnswerSchema, parseWorkResearchState, type WorkDeepAnswer, type WorkEvidence, type WorkResearchState } from "./work-research-contract";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const WORK_DEEP_QUESTION = "逐段读懂这条作品：它怎样选题、推进、维持注意力、建立可信度与表达；提炼可迁移机制和需要验证的假设。";
export function workResearchSources(evidence: WorkEvidence): ResearchSource[] {
  return [
    { ref: "W1", kind: "BENCHMARK_WORK", objectId: evidence.workId, title: evidence.title.slice(0, 500),
      href: `/research/benchmarks/${evidence.accountId}/works/${evidence.workId}`, capturedAt: evidence.capturedAt, publishedAt: evidence.publishedAt, eventAt: null,
      contentOrigin: "ORIGINAL", locator: "研究时保存的作品标题和公开指标", excerpt: evidence.title, version: evidence.fingerprint },
    ...(evidence.sourceItemId && evidence.contentText ? [{ ref: "M1", kind: "MATERIAL" as const, objectId: evidence.sourceItemId,
      title: `${evidence.title.slice(0, 470)} · 可读内容`, href: `/library/${evidence.sourceItemId}`, capturedAt: evidence.capturedAt, publishedAt: evidence.publishedAt, eventAt: null,
      contentOrigin: evidence.contentOrigin === "TRANSCRIPT" ? "MACHINE_TRANSCRIPT" as const : evidence.contentOrigin === "SOURCE_UNDERSTANDING" ? "AI_READING" as const : "ORIGINAL" as const,
      locator: evidence.truncated ? "本版只读取了开头部分，可继续从原资料核对全文" : "本版实际读取的正文",
      excerpt: evidence.contentText, version: evidence.contentVersion ?? evidence.contentHash }] : []),
  ];
}
export function workResearchCoverage(state: WorkResearchState): ResearchCoverage & { workResearch: WorkResearchState } {
  const evidence = state.evidence;
  return { requested: 1, observed: 1, readable: evidence.contentText ? 1 : 0, timed: evidence.segments.length ? 1 : 0, visual: evidence.contentOrigin === "SOURCE_UNDERSTANDING" ? 1 : 0,
    aiSampleCount: state.answer ? 1 : 0, truncated: evidence.truncated, sampling: "SELECTED", timeRange: { from: evidence.publishedAt, to: evidence.publishedAt },
    gaps: ["只研究这条作品当前可读的内容。", ...(evidence.truncated ? ["正文或时间片段较长，本版本只读取了明确显示的部分。"] : []), ...(evidence.contentOrigin === "TRANSCRIPT" ? ["机器文字稿可能有识别错误，请对照原作品。"] : []), "没有实际观看留存或转化数据，注意力与效果仅是研究假设。"],
    workResearch: state };
}
const time = (value: number | null) => value === null ? "" : `${Math.floor(value / 60000)}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}`;
export function renderWorkResearchBlocks(state: WorkResearchState): ResearchBlock[] {
  if (!state.answer) return [];
  const { answer, evidence } = state; const sources = workResearchSources(evidence);
  const paragraph = (id: string, title: string, body: string, ref: string, limitation: string): ResearchBlock => ({ id, type: "text", title, text: body, sourceRefs: [ref], provenance: "AI_INTERPRETATION", limitation });
  const idea = answer.topicIdea;
  const blocks: ResearchBlock[] = [
    { id: "scope", type: "text", title: "本次研究范围", text: `${evidence.title}\n${evidence.contentOrigin === "TRANSCRIPT" ? "基于机器文字稿" : "基于当前可读正文"}${evidence.truncated ? "；只读取了部分内容" : ""}。`, sourceRefs: sources.map(source => source.ref), provenance: "REAL_DATA", limitation: "作品中的口述结果和案例未经第三方核实；没有真实留存或转化数据。" },
    paragraph("understanding", "这条内容究竟在讲什么", `${answer.understanding.about}\n${answer.summary}`, answer.understanding.citation.ref, answer.limitations.join("\n").slice(0, 2000)),
    paragraph("topic", "选题为什么成立", [idea.whyThisTopic, idea.audience && `对谁说：${idea.audience}`, idea.problem && `原问题：${idea.problem}`, idea.angle && `切入角度：${idea.angle}`, idea.promise && `内容承诺：${idea.promise}`].filter(Boolean).join("\n"), idea.citation.ref, "这里是选题机制的研究解释，不等于对其效果的因果验证。"),
  ];
  if (state.schemaVersion === "work-research-v2") {
    const decision = state.answer!.decision;
    blocks.splice(1, 0,
      paragraph("decision", "一句话看懂与核心打法", `${decision.executiveSummary.oneLine}\n为什么这个选题成立：${decision.executiveSummary.topicDecision}\n${decision.executiveSummary.corePlaybook.join(" → ")}`, decision.topicLogic.citation.ref, decision.researchLimits.join("；")),
      paragraph("proof-review", "主张和证明", decision.claims.length ? decision.claims.map(item => `${item.claim}\n作品提供：${item.offeredProof ?? "没有明确证据"}；形式：${item.proofKind}；外部核实：无`).join("\n\n") : "当前内容没有可区分的明确主张与证明。", decision.claims[0]?.citation.ref ?? decision.topicLogic.citation.ref, "作品中的口述并非外部核实事实。"),
      paragraph("creation-blueprint", "换成自己的选题和写法", `${decision.creationBlueprint.angle}\n${decision.creationBlueprint.flow.join(" → ")}\n需要自己的证明：${decision.creationBlueprint.proofNeeded}\n值得学：${decision.strengths.map(item => item.finding).join("；") || "未形成可靠判断"}\n需要改：${decision.weaknesses.map(item => item.finding).join("；") || "未形成可靠判断"}`, decision.topicLogic.citation.ref, "实际创作须结合自己的项目和资料，不能照搬原作品事实。"),
    );
  }
  answer.structureBlocks.forEach((block, index) => blocks.push(paragraph(`structure-${index}`, `${String(index + 1).padStart(2, "0")} · ${block.role}${block.startMs !== null ? ` · ${time(block.startMs)}–${time(block.endMs)}` : ""}`, `${block.content}\n\n这一段在做什么：${block.purpose}${block.expression ? `\n表达方式：${block.expression}` : ""}`, block.citation.ref, "时间码仅在文字稿提供对应片段时显示；结构是基于当前可读内容的判断。")));
  answer.mechanisms.forEach((mechanism, index) => blocks.push(paragraph(`mechanism-${index}`, `${({ ATTENTION: "注意力设计", PROOF: "可信度建立", EXPRESSION: "表达方式", OTHER: "内容机制" })[mechanism.kind]} · ${mechanism.name}`, `${mechanism.description}\n为何可能起作用：${mechanism.hypothesis}`, mechanism.citation.ref, mechanism.limitation)));
  answer.mechanisms.forEach((mechanism, index) => {
    if (mechanism.claim || mechanism.proof) blocks.push(paragraph(`detail-mechanism-${index}`, `${mechanism.name}的分析细节`,
      [mechanism.claim && `作品主张：${mechanism.claim}`, mechanism.proof && `作品提供的证明：${mechanism.proof}`].filter(Boolean).join("\n"), mechanism.citation.ref, mechanism.limitation));
  });
  // Agent context has a bounded budget. Keep the transferable mechanism near
  // the main finding so a long segment list cannot push it out of context.
  blocks.splice(3, 0, paragraph("transfer", "选择借鉴部分，写出自己的内容", `${answer.transferable.principle}\n为何这样设计：${answer.transferable.why}\n${answer.transferable.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n适用：${answer.transferable.applicability}\n需要自己的证据：${answer.transferable.ownEvidenceNeeded}\n不要照搬：${answer.transferable.surfaceElements.join("、") || "原作品的身份、案例与措辞"}\n本次可测试：${answer.transferable.testVariable}`, answer.transferable.citation.ref, answer.transferable.limitation));
  blocks.push({ id: "sources", type: "sources", title: "研究时的来源快照", sourceRefs: sources.map(source => source.ref), provenance: "REAL_DATA", limitation: "历史研究保留本次读取的摘录；打开原资料时可能看到后续修改。", refs: sources });
  return validateResearchBlocks(blocks, sources);
}

async function executeValidatedWorkPass<T>(input: { actor: ResearchActor; run: { id: string; sessionId: string }; evidence: WorkEvidence;
  runtime: LLMRuntime; running: { id: string; sessionId: string; workspaceId: string; requestedById: string; status: "RUNNING" };
  stage: string; promptVersion: number; schema: z.ZodType<T>; prompt: Record<string, unknown>; systemPrompt: string;
  maxCompletionTokens: number; validate: (value: unknown) => unknown }) {
  return executeStructuredAIRun<T>({ workspaceId: input.actor.workspaceId, userId: input.actor.userId,
    action: "ANALYZE_SOURCES", operation: "RESEARCH", promptVersion: input.promptVersion,
    inputSummary: { researchRunId: input.run.id, workId: input.evidence.workId, evidenceFingerprint: input.evidence.fingerprint, stage: input.stage },
    metadata: { researchSessionId: input.run.sessionId, researchRunId: input.run.id, workId: input.evidence.workId, evidenceFingerprint: input.evidence.fingerprint, stage: input.stage },
    contextTruncated: input.evidence.truncated,
    onRunCreated: async aiRunId => { await db.researchRun.updateMany({ where: input.running, data: { aiRunId } }); },
    generate: async provider => {
      let correction: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await provider.generateStructured({ systemPrompt: input.systemPrompt,
            prompt: JSON.stringify({ ...input.prompt, ...(correction ? { correction, instruction: "上次输出未通过结构或原文核对。只修正问题，重新给出完整 JSON。" } : {}) }),
            maxCompletionTokens: input.maxCompletionTokens }, input.schema);
          try { input.validate(result.data.value); }
          catch (error) { throw new LLMError("LLM_INVALID_RESPONSE", error instanceof Error ? error.message : "WORK_EVIDENCE_INVALID", false); }
          return result;
        } catch (error) {
          if (!(error instanceof LLMError) || error.code !== "LLM_INVALID_RESPONSE") throw error;
          if (attempt === 1) throw new LLMError("LLM_INVALID_RESPONSE", `${input.stage}未通过结构或原文核对；已有研究不受影响。`, false,
            { ...error.details, validationIssues: error.details.validationIssues?.slice(0, 8) ?? [{ path: input.stage, code: error.message.split(":")[0]!, receivedType: "model_output" }] });
          correction = error.details.validationIssues ?? { evidenceCheck: error.message };
        }
      }
      throw new LLMError("LLM_INVALID_RESPONSE", "作品研究未通过证据核对。", false);
    },
  }, { runtime: input.runtime });
}

export async function executeWorkResearchRun(actor: ResearchActor, run: { id: string; sessionId: string; coverage: unknown }, dependencies: { runtime?: LLMRuntime } = {}) {
  const state = parseWorkResearchState(run.coverage);
  if (!state || !state.evidence.contentText) throw new ResearchError("NO_READABLE_CONTENT", "这条作品目前没有可读正文，先到资料页完成读取。", 409);
  const running = { id: run.id, sessionId: run.sessionId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "RUNNING" as const };
  await db.researchRun.updateMany({ where: running, data: { stage: "ANALYZING", sourceRefs: json(workResearchSources(state.evidence)) } });
  const runtime = dependencies.runtime ?? (await new ModelRouter().route(actor.workspaceId, { taskType: "RESEARCH", structuredOutput: true, reasoningNeed: "MEDIUM" })).runtime;
  if (runtime.mode === "MOCK") throw new ResearchError("PROVIDER_UNAVAILABLE", "深度研究需要可用的真实模型，请先配置 AI 服务。", 503);
  let completed: WorkResearchState;
  if (state.schemaVersion === "work-research-v2") {
    const priorRuns = await db.researchRun.findMany({ where: { sessionId: run.sessionId, workspaceId: actor.workspaceId,
      requestedById: actor.userId, id: { not: run.id }, status: { in: ["COMPLETED", "FAILED"] } },
      orderBy: { version: "desc" }, take: 20, select: { coverage: true } });
    const reusable = priorRuns.map(item => parseWorkResearchState(item.coverage)).find(item =>
      item?.evidence.fingerprint === state.evidence.fingerprint && (item.answer || item.schemaVersion === "work-research-v2" && item.baseAnswer));
    let base: WorkDeepAnswer | null = state.baseAnswer ?? (reusable?.answer ? legacyWorkAnswer(reusable.answer) :
      reusable?.schemaVersion === "work-research-v2" ? reusable.baseAnswer : null);
    if (base) base = validateWorkDeepAnswer(base, state.evidence);
    if (!base) {
      const baseRun = await executeValidatedWorkPass({ actor, run, evidence: state.evidence, runtime, running,
        stage: "WORK_BASE", promptVersion: 8, schema: workDeepAnswerSchema, prompt: workDeepPrompt(state.evidence),
        systemPrompt: WORK_DEEP_SYSTEM_PROMPT, maxCompletionTokens: 7500,
        validate: value => validateWorkDeepAnswer(value, state.evidence) });
      base = validateWorkDeepAnswer(baseRun.output, state.evidence);
      await db.researchRun.updateMany({ where: running, data: { coverage: json(workResearchCoverage({ ...state, baseAnswer: base })) } });
    }
    const decisionRun = await executeValidatedWorkPass({ actor, run, evidence: state.evidence, runtime, running,
      stage: "WORK_DECISION", promptVersion: 9, schema: workDecisionPassSchema, prompt: workDecisionPrompt(state.evidence, base),
      systemPrompt: WORK_DECISION_SYSTEM_PROMPT, maxCompletionTokens: 12000,
      validate: value => validateWorkDecisionPass(value, base, state.evidence) });
    completed = { ...state, baseAnswer: base, answer: validateWorkDecisionPass(decisionRun.output, base, state.evidence) };
  } else {
    const baseRun = await executeValidatedWorkPass({ actor, run, evidence: state.evidence, runtime, running,
      stage: "WORK_BASE", promptVersion: 8, schema: workDeepAnswerSchema, prompt: workDeepPrompt(state.evidence),
      systemPrompt: WORK_DEEP_SYSTEM_PROMPT, maxCompletionTokens: 7500,
      validate: value => validateWorkDeepAnswer(value, state.evidence) });
    completed = { ...state, answer: validateWorkDeepAnswer(baseRun.output, state.evidence) };
  }
  await db.researchRun.updateMany({ where: running, data: { coverage: json(workResearchCoverage(completed)), blocks: json(renderWorkResearchBlocks(completed)), sourceRefs: json(workResearchSources(completed.evidence)), resultTitle: `${completed.evidence.title.slice(0, 150)} · 作品深度拆解`, status: "COMPLETED", stage: "COMPLETED", finishedAt: new Date(), errorCode: null, errorMessage: null } });
}
