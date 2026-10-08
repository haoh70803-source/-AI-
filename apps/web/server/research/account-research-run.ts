import "server-only";
import { LLMError } from "@content-center/providers";
import { db, type Prisma } from "@content-center/db";
import type { ResearchBlock, ResearchCoverage, ResearchSource } from "@content-center/core";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ModelRouter } from "../ai/control/model-router";
import type { LLMRuntime } from "../ai/llm-runtime";
import { ResearchError, type ResearchActor } from "./access";
import { accountResearchAnswerSchema, parseAccountResearchState, type AccountResearchState } from "./account-research-contract";
import { ACCOUNT_RESEARCH_SYSTEM_PROMPT, accountResearchFacts, accountResearchPrompt, validateAccountResearchAnswer, workMetadataText } from "./account-research-analysis";
import { validateResearchBlocks } from "./contracts";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const ACCOUNT_RESEARCH_QUESTION = "基于当前真实证据，研究账号的选题、内容结构、表达方式与可复用模板；对照高表现和普通样本、最近和之前的样本，寻找支持与反例，并复核历史判断。";
const dimensions: Record<string, string> = { TOPIC: "主题", TITLE: "标题", OPENING: "开头", STRUCTURE: "内容结构", EXAMPLES: "案例使用", LENGTH: "长度", CTA: "结尾行动", SCHEDULE: "发布节奏", PERFORMANCE: "互动表现" };
const takeawayLabels = { LEARN: "值得学习", DO_NOT_COPY: "不能直接照搬", TEST: "值得测试", INSUFFICIENT: "证据不足" };
const reviewLabels = { NEW: "新增发现", STRENGTHENED: "判断得到加强", WEAKENED: "判断被削弱", UNSUPPORTED: "当前不再支持", UNCHANGED: "判断保持" };
export function accountEvidenceSources(state: AccountResearchState): ResearchSource[] {
  const { evidence } = state;
  return [
    { ref: "B1", kind: "BENCHMARK_ACCOUNT", objectId: evidence.account.id, title: evidence.account.name.slice(0, 500), href: `/research/benchmarks/${evidence.account.id}`, capturedAt: evidence.capturedAt, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: "本研究版本固定的账号证据范围", excerpt: `${evidence.account.name} · ${evidence.account.platform}`, version: evidence.fingerprint },
    ...evidence.works.map(work => ({ ref: work.ref, kind: "BENCHMARK_WORK" as const, objectId: work.id, title: work.title.slice(0, 500), href: work.sourceItemId ? `/library/${work.sourceItemId}` : work.url && work.url.length <= 2000 ? work.url : null,
      capturedAt: work.observedAt, publishedAt: work.publishedAt, eventAt: null, contentOrigin: work.contentOrigin,
      locator: work.bodyHash ? `本版本保存的正文片段${work.bodyLength > work.bodyText.length ? "（已截断）" : ""}` : "只有作品基础信息和标题，不代表已读正文",
      excerpt: `${workMetadataText(work)}${work.bodyText ? `\n\n正文：\n${work.bodyText}` : ""}`, version: work.contentVersion ?? work.metadataHash })),
    ...evidence.comments.map(comment => ({ ref: comment.ref, kind: "BENCHMARK_COMMENT" as const, objectId: comment.id, title: `评论样本 · ${evidence.works.find(work => work.ref === comment.workRef)?.title.slice(0, 100) ?? "关联作品"}`, href: evidence.works.find(work => work.ref === comment.workRef)?.url ?? null, capturedAt: evidence.capturedAt, publishedAt: comment.postedAt, eventAt: null, contentOrigin: "ORIGINAL" as const, locator: "本版本保存的原始评论片段；按点赞选样，不能代表全部受众", excerpt: comment.text, version: comment.hash })),
  ];
}
export function accountResearchCoverage(state: AccountResearchState): ResearchCoverage & { accountResearch: AccountResearchState } {
  const facts = accountResearchFacts(state.evidence, state.workAnalyses);
  return { requested: state.evidence.totalWorks, observed: state.evidence.works.length, readable: facts.textCount,
    timed: state.evidence.works.filter(work => work.hasTimecodes).length, visual: 0,
    aiSampleCount: state.workAnalyses.length, truncated: state.evidence.limited || state.pendingRefs.length > 0 || state.evidence.works.some(work => work.bodyLength > work.bodyText.length),
    sampling: state.evidence.collectionRunId ? "WINDOW" : "SELECTED", timeRange: { from: state.evidence.from, to: state.evidence.to },
    gaps: ["本次未直接读取原始画面。", ...(state.pendingRefs.length ? [`还有 ${state.pendingRefs.length} 条证据未进入本轮逐条分析，可在下一次更新中继续处理。`] : []), ...(state.evidence.limited ? ["作品数量超出本次读取上限，仅使用快照中明确列出的记录。"] : [])], accountResearch: state };
}
export function renderAccountResearchBlocks(state: AccountResearchState): ResearchBlock[] {
  const answer = state.answer; if (!answer) return [];
  const facts = accountResearchFacts(state.evidence, state.workAnalyses); const sources = accountEvidenceSources(state);
  const citeRefs = (citations: Array<{ ref: string }>) => [...new Set(citations.map(item => item.ref))];
  const quoted = (citations: Array<{ ref: string; quote: string }>) => citations.map(item => `「${item.quote}」〔${item.ref}〕`).join("\n");
  const textBlock = (id: string, title: string, text: string, refs: string[], limitation: string): ResearchBlock => ({ id, type: "text", title, text, sourceRefs: [...new Set(refs)], provenance: "AI_INTERPRETATION", limitation });
  const blocks: ResearchBlock[] = [
    textBlock("account-summary", "当前研究判断", answer.summary, citeRefs(answer.findings.flatMap(item => item.citations)), answer.limitations.join("\n").slice(0, 2000)),
    { id: "account-scope", type: "text", title: "本版本实际证据", text: `基础统计使用 ${facts.workCount} 条作品；当前有 ${facts.textCount} 条正文。本版本已形成 ${facts.analyzedTextCount} 条正文分析、${facts.analyzedTitleCount} 条标题级分析，评论样本 ${facts.commentCount} 条。本次新分析 ${state.analyzedRefs.length} 条，复用未变化样本 ${state.reusedRefs.length} 条。`, provenance: "REAL_DATA", sourceRefs: ["B1"], limitation: "各部分分别使用对应证据；没有正文的作品不参与正文结构判断。" },
    { id: "account-statistics", type: "metrics", title: "作品基础数据", provenance: "COMPUTED", sourceRefs: ["B1"], limitation: "平均值只计算已知数据；缺失不作零。作品的指标累积时长可能不同，不能推断因果。", items: facts.metrics.filter(item => item.known > 0).map(item => ({ label: `平均${({ views: "播放", likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享" })[item.key]}`, value: item.mean, unit: "次", validCount: item.known, denominator: item.total, method: "本研究版本作品快照中有效观察值求平均" })) },
  ];
  for (const finding of answer.findings) blocks.push(textBlock(`finding-${finding.id}`, `${finding.basis === "TITLE" ? "标题级观察 · " : ""}${finding.title}`, `${finding.statement}\n\n依据摘录：\n${quoted(finding.citations)}${finding.counterRefs.length ? `\n\n需要一起核对的反例：${finding.counterRefs.join("、")}` : "\n\n当前尚无充分反例验证，此观察仍需后续核对。"}`, [...citeRefs(finding.citations), ...finding.counterRefs], finding.limitation));
  answer.comparisons.forEach((item, index) => blocks.push(textBlock(`comparison-${index}`, `高表现与普通样本 · ${dimensions[item.dimension]}`, `${item.observation}\n\n依据：\n${quoted(item.citations)}\n\n反例：${item.counterRefs.length ? item.counterRefs.join("、") : "暂未找到充分反例，不能据此宣称必然有效。"}`, [...citeRefs(item.citations), ...item.counterRefs], `${item.limitation}\n系统按本次有效点赞中位数分组，属于样本内比较。`)));
  answer.recentChanges.forEach((item, index) => blocks.push(textBlock(`recent-${index}`, `最近与之前 · ${item.title}`, `${item.observation}\n\n${quoted(item.citations)}`, citeRefs(item.citations), item.limitation)));
  answer.templates.forEach((item, index) => blocks.push(textBlock(`template-${index}`, `可复用${item.basis === "TITLE" ? "标题" : "内容"}模板 · ${item.name}`, `适用场景：${item.whenToUse}\n\n${item.steps.map((step, order) => `${order + 1}. 【${step.slot}】${step.purpose}`).join("\n")}\n\n需要补自己的证据：${item.requiredOwnEvidence}\n不能照搬：${item.doNotCopy}\n\n模板依据：\n${quoted(item.citations)}`, [...citeRefs(item.citations), ...item.counterRefs], item.limitation)));
  answer.takeaways.forEach((item, index) => blocks.push(textBlock(`takeaway-${index}`, `${takeawayLabels[item.kind]} · ${item.title}`, `${item.statement}\n\n${quoted(item.citations)}`, citeRefs(item.citations), item.limitation)));
  answer.commentInsights.forEach((item, index) => blocks.push(textBlock(`comment-${index}`, `评论观察 · ${item.title}`, `${item.statement}\n\n原始评论：\n${quoted(item.citations)}`, citeRefs(item.citations), item.limitation)));
  if (state.previousRunId) blocks.push(textBlock("account-update-review", "这次更新改变了什么", `正文证据：${state.delta.previousTextCount} → ${state.delta.currentTextCount} 条。\n${answer.unchanged ? "新增样本没有明显改变当前主要判断。\n" : ""}${answer.reviews.map(item => `${reviewLabels[item.status]}｜${item.title}\n${item.explanation.slice(0, 1000)}`).join("\n\n")}`, [...new Set(["B1", ...answer.reviews.flatMap(item => item.refs)])], "历史版本与原证据快照保留；本版复核不改写旧结果。"));
  blocks.push({ id: "sources", type: "sources", title: "本版本的证据快照", provenance: "REAL_DATA", sourceRefs: sources.map(source => source.ref), limitation: "这里保留研究时读取的记录和摘录；打开原资料可能看到后来更新的内容。", refs: sources });
  return validateResearchBlocks(blocks.filter(block => block.type !== "metrics" || block.items.length > 0), sources);
}

export async function executeAccountResearchRun(actor: ResearchActor, run: { id: string; sessionId: string; question: string; coverage: unknown }, dependencies: { runtime?: LLMRuntime } = {}) {
  const state = parseAccountResearchState(run.coverage);
  if (!state) throw new ResearchError("INVALID_EVIDENCE_SNAPSHOT", "本次研究的证据快照不可用，请重新开始。", 409);
  const previousRun = state.previousRunId ? await db.researchRun.findFirst({ where: { id: state.previousRunId, sessionId: run.sessionId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", session: { createdById: actor.userId, workspaceId: actor.workspaceId } }, select: { coverage: true } }) : null;
  const previous = previousRun ? parseAccountResearchState(previousRun.coverage) : null;
  const running = { id: run.id, sessionId: run.sessionId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "RUNNING" as const };
  await db.researchRun.updateMany({ where: running, data: { stage: "ANALYZING", sourceRefs: json(accountEvidenceSources(state)) } });
  const runtime = dependencies.runtime ?? (await new ModelRouter().route(actor.workspaceId, { taskType: "RESEARCH", structuredOutput: true, reasoningNeed: "MEDIUM" })).runtime;
  if (runtime.mode === "MOCK") throw new ResearchError("PROVIDER_UNAVAILABLE", "账号研究需要可用的真实模型，请先配置 AI 服务。", 503);
  const answer = await executeStructuredAIRun({ workspaceId: actor.workspaceId, userId: actor.userId, action: "ANALYZE_SOURCES", operation: "RESEARCH", promptVersion: 2,
    inputSummary: { researchRunId: run.id, evidenceWorks: state.evidence.works.length, readableWorks: state.delta.currentTextCount, newAnalysisCount: state.analyzedRefs.length, reusedCount: state.reusedRefs.length, previousRunId: state.previousRunId },
    metadata: { researchSessionId: run.sessionId, researchRunId: run.id, accountId: state.evidence.account.id, evidenceFingerprint: state.evidence.fingerprint }, contextTruncated: state.evidence.limited || state.pendingRefs.length > 0,
    onRunCreated: async aiRunId => { await db.researchRun.updateMany({ where: running, data: { aiRunId } }); },
    generate: async provider => {
      const prompt = accountResearchPrompt(state, previous, run.question);
      let correction: unknown = null;
      let candidate: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await provider.generateStructured({ systemPrompt: ACCOUNT_RESEARCH_SYSTEM_PROMPT, prompt: JSON.stringify({ ...prompt, ...(correction ? { correction, previousCandidate: candidate, instruction: "上次输出未通过校验。依据相同真实证据重新生成完整 JSON，逐项遵守 responseSchema；不要编造引用。" } : {}) }), maxCompletionTokens: 14000 }, accountResearchAnswerSchema);
          candidate = result.data.value;
          try { validateAccountResearchAnswer(result.data.value, state, previous); }
          catch (error) { throw new LLMError("LLM_INVALID_RESPONSE", error instanceof Error ? error.message : "ACCOUNT_EVIDENCE_INVALID", false); }
          return result;
        } catch (error) {
          if (!(error instanceof LLMError) || error.code !== "LLM_INVALID_RESPONSE") throw error;
          if (attempt === 1) {
            if (error.message.startsWith("ACCOUNT_")) throw new LLMError("LLM_INVALID_RESPONSE", "研究结论未通过引用与数据核对，请重试；已有成果不受影响。", false, { validationIssues: [{ path: "evidence", code: error.message.split(":")[0]!, receivedType: "model_output" }] });
            throw error;
          }
          correction = error.details.validationIssues ?? { evidenceCheck: error.message };
        }
      }
      throw new LLMError("LLM_INVALID_RESPONSE", "研究结果未通过校验，未覆盖已有研究。", false);
    },
  }, { runtime });
  const validated = validateAccountResearchAnswer(answer.output, state, previous);
  const completed: AccountResearchState = { ...state, answer: validated.answer, workAnalyses: validated.workAnalyses };
  await db.researchRun.updateMany({ where: running, data: { blocks: json(renderAccountResearchBlocks(completed)), coverage: json(accountResearchCoverage(completed)), sourceRefs: json(accountEvidenceSources(completed)), resultTitle: `${state.evidence.account.name} · 账号研究`, status: "COMPLETED", stage: "COMPLETED", finishedAt: new Date(), errorCode: null, errorMessage: null } });
}
