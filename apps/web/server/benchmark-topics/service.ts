import "server-only";

import { db, type Prisma } from "@content-center/db";
import { LLMError } from "@content-center/providers";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ProjectContextBuilder } from "../ai/project-context";
import type { LLMRuntime } from "../ai/llm-runtime";
import { getBenchmarkCreatorDetail, type BenchmarkCreatorDetailDTO } from "../discovery/benchmark-creator-read-model";
import { getMaterialAnalysis } from "../material-analysis/service";
import { getMaterialDistillation } from "../material-distillation/service";
import { createProject } from "../project-service";
import { recordGenerationMethodUsages } from "../project-methods/service";
import { downgradeStudioFactText, inspectStudioFactText } from "../studio/fact-safety";
import { benchmarkTopicsOutputSchema, benchmarkTopicsProviderSchema, type BenchmarkTopicInput, type BenchmarkTopicsOutput } from "./schemas";

export class BenchmarkTopicError extends Error {
  constructor(readonly code: "SOURCE_NOT_FOUND" | "SOURCE_NOT_READY" | "CREATOR_PROFILE_NOT_READY" | "TOPICS_NOT_FOUND" | "TOPIC_NOT_FOUND", message: string) { super(message); this.name = "BenchmarkTopicError"; }
}

type ExternalInput = {
  type: "VIDEO" | "CREATOR_PROFILE";
  id: string;
  label: string;
  basis: "M1" | "M7" | "M9";
  content: string;
  materialAnalysisId?: string;
  materialDistillationId?: string;
  creatorProfileStudyId?: string;
};

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, ""); }
function bigrams(value: string) { const text = normalize(value); return new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2))); }
function similarity(left: string, right: string) { const a = bigrams(left); const b = bigrams(right); if (!a.size || !b.size) return 0; const overlap = [...a].filter((item) => b.has(item)).length; return overlap / (a.size + b.size - overlap); }

async function loadVideoInput(workspaceId: string, sourceId: string): Promise<ExternalInput> {
  const source = await db.sourceItem.findFirst({ where: { id: sourceId, workspaceId, sourceType: "VIDEO" }, select: { id: true, title: true, transcript: { select: { fullText: true } } } });
  if (!source) throw new BenchmarkTopicError("SOURCE_NOT_FOUND", "这条视频不存在。");
  if (!source.transcript?.fullText.trim()) throw new BenchmarkTopicError("SOURCE_NOT_READY", "请先完成视频文字稿和内容整理。");
  const [distillation, analysis] = await Promise.all([getMaterialDistillation({ workspaceId, sourceItemId: source.id }), getMaterialAnalysis({ workspaceId, sourceItemId: source.id })]);
  if (distillation.current?.output && !distillation.current.stale) return { type: "VIDEO", id: source.id, label: source.title || "未命名视频", basis: "M7", materialDistillationId: distillation.current.id, content: JSON.stringify({ title: source.title, highlights: distillation.current.output.highlights, copywriting: distillation.current.output.copywriting }) };
  if (analysis.current && !analysis.current.stale && (analysis.current.understanding || analysis.current.summary)) return { type: "VIDEO", id: source.id, label: source.title || "未命名视频", basis: "M1", materialAnalysisId: analysis.current.id, content: JSON.stringify({ title: source.title, summary: analysis.current.summary, understanding: analysis.current.understanding, coreViewpoint: analysis.current.coreViewpoint, keyPoints: analysis.current.keyPoints }) };
  throw new BenchmarkTopicError("SOURCE_NOT_READY", "这条视频还没有足够的内容拆解或精华提炼结果。");
}

async function loadCreatorInput(workspaceId: string, userId: string, accountId: string, loader = getBenchmarkCreatorDetail): Promise<ExternalInput> {
  const detail = await loader({ workspaceId, benchmarkAccountId: accountId, ownerUserId: userId });
  if (!detail) throw new BenchmarkTopicError("SOURCE_NOT_FOUND", "这个对标博主不存在。");
  if (!detail.creatorProfile || detail.creatorProfile.schemaVersion !== "benchmark-creator-profile-v4") throw new BenchmarkTopicError("CREATOR_PROFILE_NOT_READY", "当前还没有足够的博主研究结果。");
  return { type: "CREATOR_PROFILE", id: detail.account.id, label: detail.account.name, basis: "M9", creatorProfileStudyId: detail.creatorProfile.studyId, content: JSON.stringify({ account: { name: detail.account.name, bio: detail.account.bio }, profile: { message: detail.creatorProfile.message, sections: detail.creatorProfile.sections.map(({ code, status, text }) => ({ code, status, text })) } }) };
}

function generalizeTopicText(text: string, ownFacts: string[]) {
  let value = downgradeStudioFactText(text, ownFacts)
    .replace(/(?:我|我们)(?:研究过|看过|分析过|观察过|服务过|验证过)[^，。！？!?]{0,30}(?=后|，|,|。|！|!|？|\?|$)/gu, "看过不少相关内容")
    .replace(/(?:我们|我们的|我的)(客户|学员|学校|项目|案例)/gu, "一家机构的$1");
  let inspected = inspectStudioFactText(value, ownFacts);
  if (inspected.blocked && !inspected.reasons.includes("包含经营结果承诺")) {
    value = `假设一种常见情况：${value.replace(/(?:我|我们)(?=(?:以前|曾经|做过|负责|带过|服务过|验证过|研究过|看过|分析过))/gu, "一家机构")}`;
    inspected = inspectStudioFactText(value, ownFacts);
  }
  return inspected.blocked ? null : { text: value, state: inspected.state };
}

const m9OwnClaim = /(?:我(?!方)|我们|我的|我们的)[^。！？\n]{0,40}(?:客户|案例|成绩|研究|观察|梳理|验证|服务|经历|以前做|做过|负责过|帮助过|数据|转化率|成交率|收入|项目)/u;
function externalizeM9Topic<T extends { title: string; angle: string; why: string; ourTake: string; evidenceNeed: "NONE" | "OPTIONAL" | "REQUIRED"; evidenceHint: string | null }>(topic: T, ownFacts: string[]) {
  const unsupported = (text: string | null) => Boolean(text && m9OwnClaim.test(text) && inspectStudioFactText(text, ownFacts).state !== "CONFIRMED_OWN_FACT");
  const angle = unsupported(topic.angle) ? "经营判断" : topic.angle;
  const unsafe = { title: unsupported(topic.title), angle: unsupported(topic.angle), why: unsupported(topic.why), ourTake: unsupported(topic.ourTake), evidenceHint: unsupported(topic.evidenceHint) };
  const changed = Object.values(unsafe).some(Boolean);
  if (!changed) return { topic, changed: false };
  return { topic: {
    ...topic,
    title: unsafe.title ? `${angle}：一个值得验证的经营问题` : topic.title,
    angle,
    why: unsafe.why ? "这个角度来自外部画像，值得结合我们的真实业务情况重新判断。" : topic.why,
    ourTake: unsafe.ourTake ? `可以先把“${angle}”作为观点或假设展开；如果要写成我方客户、研究观察、经历或具体数据，需要补充对应的真实依据。` : topic.ourTake,
    evidenceNeed: "REQUIRED" as const,
    evidenceHint: unsafe.evidenceHint || !topic.evidenceHint ? "如需使用我方客户、研究观察、经历或具体数据，请补充真实依据。" : topic.evidenceHint,
  }, changed: true };
}

function evidenceStatus(input: { state: string; evidenceNeed: "NONE" | "OPTIONAL" | "REQUIRED"; evidenceHint: string | null; changed: boolean; hasOwnCaseOrData: boolean }) {
  if (input.state === "HYPOTHETICAL") return "HYPOTHETICAL" as const;
  if (input.evidenceNeed === "NONE" && !input.changed) return "DIRECT" as const;
  if (input.evidenceNeed === "OPTIONAL" && input.hasOwnCaseOrData) return "DIRECT" as const;
  return /数据|数字|比例|金额|百分比/u.test(input.evidenceHint ?? "") ? "NEEDS_DATA" as const : "NEEDS_CASE" as const;
}

function processTopics(value: typeof benchmarkTopicsProviderSchema._output, ownFacts: string[], hasOwnCaseOrData: boolean, source: ExternalInput): BenchmarkTopicsOutput {
  const safe = value.topics.flatMap((topic) => {
    if (source.type === "VIDEO" && (normalize(topic.title) === normalize(source.label) || similarity(topic.title, source.label) >= 0.86)) return [];
    const inherited = source.type === "CREATOR_PROFILE" ? externalizeM9Topic(topic, ownFacts) : { topic, changed: false };
    const title = generalizeTopicText(inherited.topic.title, ownFacts);
    const angle = generalizeTopicText(inherited.topic.angle, ownFacts);
    const why = generalizeTopicText(inherited.topic.why, ownFacts);
    const ourTake = generalizeTopicText(inherited.topic.ourTake, ownFacts);
    const hint = inherited.topic.evidenceHint ? generalizeTopicText(inherited.topic.evidenceHint, ownFacts) : null;
    if (!title || !angle || !why || !ourTake || (inherited.topic.evidenceHint && !hint)) return [];
    const state = [title.state, angle.state, why.state, ourTake.state, hint?.state].includes("HYPOTHETICAL") ? "HYPOTHETICAL" : [title.state, angle.state, why.state, ourTake.state, hint?.state].includes("CONFIRMED_OWN_FACT") ? "CONFIRMED_OWN_FACT" : "CREATIVE_EXPRESSION";
    const changed = inherited.changed || title.text !== topic.title || angle.text !== topic.angle || why.text !== topic.why || ourTake.text !== topic.ourTake || (hint?.text ?? null) !== topic.evidenceHint;
    const evidenceNeed = changed && inherited.topic.evidenceNeed === "NONE" ? "REQUIRED" as const : inherited.topic.evidenceNeed;
    return [{ ...inherited.topic, title: title.text, angle: angle.text, why: why.text, ourTake: ourTake.text, evidenceHint: hint?.text ?? null, evidenceNeed, factState: state, sourceOwnership: "EXTERNAL" as const, evidenceStatus: evidenceStatus({ state, evidenceNeed, evidenceHint: hint?.text ?? null, changed, hasOwnCaseOrData }) }];
  });
  const topics = safe.filter((topic, index, all) => all.findIndex((candidate) => normalize(candidate.angle) === normalize(topic.angle) || (similarity(`${candidate.title}${candidate.ourTake}`, `${topic.title}${topic.ourTake}`) >= 0.72 && (source.type === "VIDEO" || similarity(candidate.angle, topic.angle) >= 0.5))) === index).slice(0, 8);
  if (topics.length < 4) throw new LLMError("LLM_INVALID_RESPONSE", "AI 没有形成足够多的不同选题。", false, { rawCandidateCount: value.topics.length, validCandidateCount: topics.length, droppedCandidateCount: value.topics.length - topics.length });
  return benchmarkTopicsOutputSchema.parse({ schemaVersion: "benchmark-inspired-topics-v1", summary: value.summary, source: { type: source.type, id: source.id, label: source.label, basis: source.basis, sourceOwnership: "EXTERNAL", ...(source.materialAnalysisId ? { materialAnalysisId: source.materialAnalysisId } : {}), ...(source.materialDistillationId ? { materialDistillationId: source.materialDistillationId } : {}), ...(source.creatorProfileStudyId ? { creatorProfileStudyId: source.creatorProfileStudyId } : {}) }, topics, metrics: { candidateCount: value.topics.length, validCount: topics.length, filteredCount: value.topics.length - topics.length } });
}

export async function generateBenchmarkTopics(input: { workspaceId: string; userId: string; source: BenchmarkTopicInput }, dependencies: { runtime?: LLMRuntime; creatorLoader?: (input: { workspaceId: string; benchmarkAccountId: string; ownerUserId: string }) => Promise<BenchmarkCreatorDetailDTO | null> } = {}) {
  const external = input.source.sourceType === "VIDEO" ? await loadVideoInput(input.workspaceId, input.source.sourceId) : await loadCreatorInput(input.workspaceId, input.userId, input.source.sourceId, dependencies.creatorLoader);
  const project = await createProject({ workspaceId: input.workspaceId, userId: input.userId, title: `${external.label}｜我方选题`.slice(0, 200), description: `从${external.label}的外部内容中寻找适合我们的选题。` });
  const built = await new ProjectContextBuilder().build({ workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, action: "REWRITE_SELECTION", studioAction: "TOPIC_IDEAS", externalReferences: [{ id: external.creatorProfileStudyId ?? external.materialDistillationId ?? external.materialAnalysisId ?? external.id, title: external.label, content: external.content }] });
  if (!built.defaultMethod) throw new BenchmarkTopicError("SOURCE_NOT_READY", "公司默认创作方法尚未发布。");
  const runMetadata: Record<string, string | number | boolean> = { kind: "M11_BENCHMARK_TOPICS", contextVersion: "creation-context-v1", inputSourceType: external.type, inputSourceId: external.id, inputBasis: external.basis };
  const usageMetadata: Record<string, string | number | boolean> = { contextVersion: "creation-context-v1", inputSourceType: external.type, inputSourceId: external.id, inputBasis: external.basis };
  const m9Ownership = external.type === "CREATOR_PROFILE" ? "M9 中的 CLEAR、稳定模式、客户、案例、数字、经历和研究观察仍全部属于外部博主。除非 confirmedFacts 另有同一事实，否则不得写成‘我们客户’‘我们研究过’‘我们观察到’‘我做过’或我方数字；请改成观点、泛化场景、明确假设或待补证据。" : "";
  const prompt = `【统一 Creation Context】\n${JSON.stringify(built.context)}\n\n基于外部启发生成 4–8 个真正不同视角的我方选题。不要总结外部内容，不要改写对标标题。事实只能来自 confirmedFacts；外部内容只提供角度。${m9Ownership}没有我方案例时仍要给观点型、明确假设型或待补证据型方向。不同候选的核心切入角度必须不同。不要生成完整稿件。\nReturn exactly {"summary":string,"topics":[{"title":string,"angle":string,"why":string,"ourTake":string,"evidenceNeed":"NONE|OPTIONAL|REQUIRED","evidenceHint":string|null}]}.`;
  const run = await executeStructuredAIRun({
    workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, action: "GENERATE_TOPIC_CANDIDATES", operation: "M11_TOPIC_CANDIDATES", promptVersion: 1,
    inputSummary: { contextVersion: "creation-context-v1", inputSourceType: external.type, inputSourceId: external.id, inputBasis: external.basis, ...built.inputSummary },
    metadata: runMetadata, auditMetadata: usageMetadata, contextTruncated: built.contextTruncated,
    onRunCreated: (aiRunId) => recordGenerationMethodUsages({ workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, aiRunId, selectedMethodVersionIds: built.selectedMethods.map(({ methodVersionId }) => methodVersionId), defaultMethodVersionId: built.defaultMethod?.versionId }).then(() => undefined),
    generate: async (provider) => {
      const generated = await provider.generateStructured({ systemPrompt: "你是鑫世界的选题助手。外部参考永远不是我方事实；方法永远不是事实。允许有冲突、反常识、场景和观点差异，但禁止虚构我方经历、客户、数字、结果或经营承诺。", prompt }, benchmarkTopicsProviderSchema);
      const value = processTopics(generated.data.value, built.ownFacts.map(({ text }) => text), built.hasOwnCaseOrData, external);
      Object.assign(runMetadata, value.metrics);
      Object.assign(usageMetadata, value.metrics);
      return { ...generated, data: { ...generated.data, value } };
    },
  }, { runtime: dependencies.runtime });
  return { ...run, projectId: project.id, output: benchmarkTopicsOutputSchema.parse(run.output) };
}

export async function selectBenchmarkTopic(input: { workspaceId: string; userId: string; runId: string; topicIndex: number }) {
  const run = await db.aIRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId, userId: input.userId, status: "SUCCEEDED", projectId: { not: null } }, select: { id: true, projectId: true, outputJson: true, metadata: true } });
  if (!run?.projectId) throw new BenchmarkTopicError("TOPICS_NOT_FOUND", "这组选题不存在。");
  const metadata = run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata) ? run.metadata as Record<string, unknown> : {};
  if (metadata.kind !== "M11_BENCHMARK_TOPICS") throw new BenchmarkTopicError("TOPICS_NOT_FOUND", "这组选题不存在。");
  const output = benchmarkTopicsOutputSchema.parse(run.outputJson);
  const topic = output.topics[input.topicIndex];
  if (!topic) throw new BenchmarkTopicError("TOPIC_NOT_FOUND", "这个选题不存在。");
  const briefMetadata = { handoff: "BENCHMARK_TOPIC", aiRunId: run.id, topicIndex: input.topicIndex, source: output.source, evidenceStatus: topic.evidenceStatus };
  await db.$transaction(async (tx) => {
    await tx.contentProject.update({ where: { id: run.projectId! }, data: { title: topic.title } });
    await tx.creativeBrief.upsert({
      where: { projectId: run.projectId! },
      create: { workspaceId: input.workspaceId, projectId: run.projectId!, createdById: input.userId, topic: topic.title, angle: topic.ourTake, audience: "", coreMessage: topic.ourTake, coreQuestion: topic.angle, background: null, keyPoints: [topic.why], structure: [], tone: "", risks: topic.evidenceHint ? [topic.evidenceHint] : [], metadata: json(briefMetadata) },
      update: { topic: topic.title, angle: topic.ourTake, coreMessage: topic.ourTake, coreQuestion: topic.angle, keyPoints: [topic.why], risks: topic.evidenceHint ? [topic.evidenceHint] : [], metadata: json(briefMetadata), version: { increment: 1 } },
    });
    if (output.source.type === "VIDEO") await tx.projectSource.upsert({ where: { projectId_sourceItemId: { projectId: run.projectId!, sourceItemId: output.source.id } }, create: { projectId: run.projectId!, sourceItemId: output.source.id, role: "INSPIRATION" }, update: { role: "INSPIRATION" } });
    await tx.aIRun.update({ where: { id: run.id }, data: { appliedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "benchmark_topic.selected", resourceType: "ai_run", resourceId: run.id, metadata: json({ projectId: run.projectId, topicIndex: input.topicIndex, sourceType: output.source.type, sourceId: output.source.id }) } });
  });
  return { projectId: run.projectId, topic, studioPath: `/projects/${run.projectId}/studio` };
}
