import { db, type Prisma } from "@content-center/db";
import { isAIProvider, selectAIModel } from "@content-center/integrations";
import {
  LLMError,
  OpenAICompatibleLLMProvider,
  benchmarkPlaybookGenerationSchema,
  benchmarkPlaybookInputSchema,
  benchmarkPlaybookOutputInstruction,
  benchmarkPlaybookOutputSchema,
  benchmarkPlaybookSystemBoundary,
  buildTranscriptSourceIndex,
  generationQualityContract,
  materialDistillationGenerationSchema,
  type BenchmarkPlaybookGeneration,
  type BenchmarkPlaybookInput,
  type BenchmarkPlaybookOutput,
  type MaterialDistillationOutput,
  type TranscriptSourceIndex,
} from "@content-center/providers";
import { UnrecoverableError, type Job } from "bullmq";
import { loadBenchmarkRuntime, type BenchmarkRuntime } from "./benchmark-analysis";
import type { BenchmarkStudyPayload } from "./queue";

type PlaybookAtom = {
  ref: string;
  sampleId: string;
  sourceItemId: string;
  materialDistillationId: string;
  materialDistillationVersion: number;
  itemKind: "HIGHLIGHT" | "COPYWRITING";
  itemKey: string;
  title: string;
  essence: string;
  sourceRefs: string[];
  type?: string;
  quality?: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function unique(items: string[]) {
  return items.filter((item, index) => items.indexOf(item) === index);
}

const universalPlaybookTexts = new Set([
  "吸引注意提供价值引导行动", "吸引注意提供价值行动号召", "吸引注意提供价值cta",
  "痛点解决方案引导行动", "痛点解决方案行动号召", "痛点解决方案cta",
  "提出问题分析问题解决问题", "建立信任提高转化",
  "attractattentionprovidevaluecalltoaction", "attractattentionprovidevaluecta",
  "painpointsolutioncalltoaction", "painpointsolutioncta", "buildtrustimproveconversion",
]);

function isUniversalPlaybookText(text: string) {
  return universalPlaybookTexts.has(text.toLowerCase().replace(/[\s，。；、,:：\-_=→>]+/gu, ""));
}

type Environment = Record<string, string | undefined>;

const environmentValue = (environment: Environment, name: string) => environment[name]?.trim() || undefined;

export function resolveBenchmarkPlaybookTaskConfig(environment: Environment = process.env) {
  const provider = environmentValue(environment, "M8_AI_PROVIDER");
  if (!provider) return null;
  const modelId = environmentValue(environment, "M8_AI_MODEL_ID");
  if (!isAIProvider(provider) || !modelId) throw new LLMError("LLM_NOT_CONFIGURED", "M8 任务模型配置不完整。", false);
  const model = selectAIModel({ provider, modelId, requires: ["text", "reasoning", "structuredOutput", "jsonObject"] });
  if (!model) throw new LLMError("LLM_NOT_CONFIGURED", "M8 任务模型不在已批准目录中或能力不足。", false);
  const apiKey = environmentValue(environment, provider === "KIMI" ? "KIMI_API_KEY" : "DEEPSEEK_API_KEY");
  if (!apiKey) throw new LLMError("LLM_NOT_CONFIGURED", "M8 任务模型凭据未配置。", false);
  return {
    provider,
    model: model.modelId,
    requestedModel: model.modelId,
    baseUrl: environmentValue(environment, "M8_AI_BASE_URL") ?? environmentValue(environment, provider === "KIMI" ? "KIMI_BASE_URL" : "DEEPSEEK_BASE_URL") ?? model.defaultBaseUrl,
    apiKey,
    capabilities: model.capabilities,
    chatStructuredOutput: model.chatStructuredOutput,
  };
}

export async function loadBenchmarkPlaybookRuntime(workspaceId: string): Promise<BenchmarkRuntime> {
  const taskConfig = resolveBenchmarkPlaybookTaskConfig();
  if (!taskConfig) return loadBenchmarkRuntime(workspaceId);
  return { provider: new OpenAICompatibleLLMProvider(taskConfig), providerName: taskConfig.provider, model: taskConfig.model, requestedModel: taskConfig.requestedModel, mode: "REAL" };
}

function sourceRefs(output: MaterialDistillationOutput) {
  const evidence = output.copywriting?.evidence ?? output.highlights.flatMap((highlight) => highlight.evidence);
  return unique(evidence.flatMap(({ sourceRef }) => sourceRef ? [sourceRef] : []));
}

const EVIDENCE_CONTEXT_MAX_CHARS = 1_500;

export function buildPlaybookEvidenceContext(output: MaterialDistillationOutput, sourceIndex: TranscriptSourceIndex) {
  const selected = new Set(sourceRefs(output));
  let usedChars = 0;
  return sourceIndex.refs.flatMap(({ ref, text }) => {
    if (!selected.has(ref) || usedChars + text.length > EVIDENCE_CONTEXT_MAX_CHARS) return [];
    usedChars += text.length;
    return [{ ref, text }];
  });
}

function copywritingAtoms(output: MaterialDistillationOutput, base: Omit<PlaybookAtom, "ref" | "itemKind" | "itemKey" | "title" | "essence" | "sourceRefs" | "type">, prefix: string): PlaybookAtom[] {
  if (!output.copywriting) return [];
  const refs = sourceRefs(output);
  if (!refs.length) return [];
  const copywriting = output.copywriting;
  const fields: Array<[string, string | string[]]> = [
    ["CORE", copywriting.coreProposition], ["ANGLE", copywriting.angle], ["OPENING", copywriting.openingLogic], ["FLOW", copywriting.progression], ["SKELETON", copywriting.skeleton],
    ["EVIDENCE", copywriting.evidenceFunction], ["REUSE", copywriting.reusableStrategies], ["AVOID", copywriting.doNotCopy], ["REWORK", copywriting.secondEditDirections], ["NEW_SKELETON", copywriting.rewriteSkeleton],
  ];
  return fields.flatMap(([key, value]) => {
    const text = (Array.isArray(value) ? value.join("；") : value).trim();
    return text ? [{ ...base, ref: `${prefix}-C${key}`, itemKind: "COPYWRITING", itemKey: key, title: key, essence: text, sourceRefs: refs }] : [];
  });
}

export function buildPlaybookAtoms(samples: Array<{ sampleId: string; sourceItemId: string; materialDistillationId: string; materialDistillationVersion: number; output: MaterialDistillationOutput }>) {
  return samples.flatMap((sample, sampleIndex) => {
    const prefix = `V${String(sampleIndex + 1).padStart(3, "0")}`;
    const base = { sampleId: sample.sampleId, sourceItemId: sample.sourceItemId, materialDistillationId: sample.materialDistillationId, materialDistillationVersion: sample.materialDistillationVersion };
    const highlights = sample.output.highlights.flatMap((highlight, index): PlaybookAtom[] => {
      const refs = unique(highlight.evidence.flatMap(({ sourceRef }) => sourceRef ? [sourceRef] : []));
      return refs.length ? [{ ...base, ref: `${prefix}-H${String(index + 1).padStart(2, "0")}`, itemKind: "HIGHLIGHT", itemKey: String(index), title: highlight.title, essence: highlight.essence, sourceRefs: refs, type: highlight.type, quality: highlight.quality }] : [];
    });
    return [...highlights, ...copywritingAtoms(sample.output, base, prefix)];
  });
}

export function normalizeBenchmarkPlaybookOutput(input: BenchmarkPlaybookGeneration, atoms: PlaybookAtom[], inputs: BenchmarkPlaybookInput["distillations"]): BenchmarkPlaybookOutput {
  const selectedSampleIds = inputs.map(({ sampleId }) => sampleId);
  const atomMap = new Map(atoms.map((atom) => [atom.ref, atom]));
  const validSamples = new Set(selectedSampleIds);
  const playbooks = input.playbooks.flatMap((candidate) => {
    if (candidate.sections.some(({ code, text }) => (code === "ELEMENT" || code === "FLOW") && isUniversalPlaybookText(text))) return [];
    const declaredSupport = unique(candidate.supportSampleIds).filter((id) => validSamples.has(id));
    const declaredExceptions = unique(candidate.exceptionSampleIds).filter((id) => validSamples.has(id) && !declaredSupport.includes(id));
    const allowed = new Set([...declaredSupport, ...declaredExceptions]);
    const sections = candidate.sections.map((section) => ({
      ...section,
      evidenceRefs: unique(section.evidenceRefs).filter((ref) => {
        const atom = atomMap.get(ref);
        return Boolean(atom && allowed.has(atom.sampleId));
      }),
    }));
    if (sections.some(({ evidenceRefs }) => evidenceRefs.length === 0)) return [];
    const repeatedSections = sections.filter(({ code }) => code === "ELEMENT" || code === "FLOW");
    const verifiedSupport = declaredSupport.filter((sampleId) => repeatedSections.every(({ evidenceRefs }) => evidenceRefs.some((ref) => atomMap.get(ref)?.sampleId === sampleId)));
    if (verifiedSupport.length < 2) return [];
    const reparsed = benchmarkPlaybookGenerationSchema.safeParse({ playbooks: [{ ...candidate, supportSampleIds: verifiedSupport, exceptionSampleIds: declaredExceptions, sections }] });
    if (!reparsed.success) return [];
    const normalized = reparsed.data.playbooks[0]!;
    const section = (code: "FLOW" | "USE_CASE" | "EXCEPTION" | "AVOID") => normalized.sections.find((item) => item.code === code)!.text;
    const evidence = unique(normalized.sections.flatMap(({ evidenceRefs }) => evidenceRefs)).map((ref) => atomMap.get(ref)!).filter(Boolean).map((atom) => ({
      evidenceRef: atom.ref,
      sampleId: atom.sampleId,
      sourceItemId: atom.sourceItemId,
      materialDistillationId: atom.materialDistillationId,
      materialDistillationVersion: atom.materialDistillationVersion,
      itemKind: atom.itemKind,
      itemKey: atom.itemKey,
      sourceRefs: atom.sourceRefs,
    }));
    return [{
      name: normalized.name,
      maturity: normalized.maturity === "STABLE" && selectedSampleIds.length >= 5 && verifiedSupport.length >= 3 ? "STABLE" as const : "OBSERVE" as const,
      elements: normalized.sections.filter(({ code }) => code === "ELEMENT").map(({ text }) => text),
      flow: section("FLOW"),
      useCase: section("USE_CASE"),
      exceptions: section("EXCEPTION"),
      doNotCopy: section("AVOID"),
      supportSampleIds: verifiedSupport,
      exceptionSampleIds: declaredExceptions,
      evidence,
    }];
  });
  return benchmarkPlaybookOutputSchema.parse({
    kind: "PLAYBOOKS",
    schemaVersion: "benchmark-playbook-v1",
    message: playbooks.length ? `在本次选择的 ${selectedSampleIds.length} 条内容中，找到了 ${playbooks.length} 套重复出现的内容搭配。` : "目前还没有发现至少两条内容共同支持的具体组合打法。",
    inputs,
    playbooks,
  });
}

export function benchmarkPlaybookFailure(error: unknown) {
  if (error instanceof LLMError) return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    providerRequestId: error.details.providerRequestId,
    actualModel: error.details.actualModel,
    finishReason: error.details.finishReason,
    validationIssues: error.details.validationIssues,
    returnedRootKeys: error.details.returnedRootKeys,
    returnedFirstLevelObjectKeys: error.details.returnedFirstLevelObjectKeys,
  };
  return { code: "BENCHMARK_PLAYBOOK_FAILED", message: "这次组合打法研究没有完成，请重试。", retryable: false };
}

type PlaybookJobDependencies = { runtime?: BenchmarkRuntime };

export async function processBenchmarkPlaybookJob(job: Job<BenchmarkStudyPayload>, dependencies: PlaybookJobDependencies = {}) {
  const startedAt = new Date();
  const record = await db.benchmarkStudy.findFirst({
    where: { id: job.data.studyId, workspaceId: job.data.workspaceId, createdById: job.data.requestedById },
    include: { benchmarkAccount: { select: { id: true, workspaceId: true, name: true, platform: true } }, samples: { orderBy: { createdAt: "asc" }, include: { sourceItem: { select: { id: true, title: true, transcript: { select: { id: true, updatedAt: true, fullText: true, segments: true } } } } } } },
  });
  if (!record || record.benchmarkAccount.workspaceId !== record.workspaceId) throw new UnrecoverableError("Benchmark playbook study scope mismatch");
  if (record.status === "COMPLETED") return { status: "already-completed" as const, studyId: record.id };
  const manifest = benchmarkPlaybookInputSchema.safeParse(record.output);
  if (!manifest.success) throw new UnrecoverableError("Benchmark playbook input is missing");
  const distillations = await db.materialDistillation.findMany({ where: { workspaceId: record.workspaceId, id: { in: manifest.data.distillations.map(({ materialDistillationId }) => materialDistillationId) }, status: "COMPLETED" } });
  const rows = manifest.data.distillations.flatMap((locked) => {
    const distillation = distillations.find((item) => item.id === locked.materialDistillationId && item.sourceItemId === locked.sourceItemId && item.version === locked.materialDistillationVersion);
    const sample = record.samples.find((item) => item.id === locked.sampleId && item.sourceItemId === locked.sourceItemId);
    const output = distillation ? materialDistillationGenerationSchema.safeParse(distillation.output) : null;
    const transcript = sample?.sourceItem.transcript;
    return sample && distillation && output?.success && transcript && distillation.transcriptUpdatedAtAtDistillation.getTime() === transcript.updatedAt.getTime()
      ? [{ ...locked, title: sample.sourceItem.title || "未命名内容", output: output.data, sourceIndex: buildTranscriptSourceIndex({ id: transcript.id, updatedAt: transcript.updatedAt, fullText: transcript.fullText, segments: transcript.segments }) }]
      : [];
  });
  if (rows.length !== manifest.data.distillations.length) throw new UnrecoverableError("Locked M7 evidence is unavailable");
  const atoms = buildPlaybookAtoms(rows);
  const context = {
    action: "IDENTIFY_BENCHMARK_PLAYBOOKS",
    benchmarkAccount: { name: record.benchmarkAccount.name, platform: record.benchmarkAccount.platform },
    samples: rows.map((sample) => ({ sampleId: sample.sampleId, content: { title: sample.title }, materialDistillation: { id: sample.materialDistillationId, version: sample.materialDistillationVersion, items: atoms.filter(({ sampleId }) => sampleId === sample.sampleId).map(({ ref, itemKind, itemKey, title, essence, sourceRefs, type, quality }) => ({ ref, itemKind, itemKey, title, essence, sourceRefs, ...(type ? { type } : {}), ...(quality ? { quality } : {}) })), evidence: buildPlaybookEvidenceContext(sample.output, sample.sourceIndex) } })),
    cautions: [benchmarkPlaybookSystemBoundary, "M7 outputs are candidates, not absolute facts. Recheck repetition, exceptions, and boundaries across videos."],
  };
  const prompt = `Action: IDENTIFY_BENCHMARK_PLAYBOOKS\nContext:\n${JSON.stringify(context, null, 2)}\n${benchmarkPlaybookOutputInstruction}`;
  const summary = { benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: rows.length, materialDistillationIds: rows.map(({ materialDistillationId }) => materialDistillationId), schemaVersion: "benchmark-playbook-v1" };
  let runId: string | undefined;
  let runProvider: string | undefined;
  let requestedModel: string | undefined;
  let runMode: string | undefined;
  try {
    const runtime = dependencies.runtime ?? await loadBenchmarkPlaybookRuntime(record.workspaceId);
    runProvider = runtime.providerName;
    requestedModel = runtime.requestedModel ?? runtime.model;
    runMode = runtime.mode ?? "REAL";
    const runtimeAudit = { provider: runtime.providerName, requestedModel, providerMode: runtime.mode ?? "REAL" };
    const run = await db.$transaction(async (tx) => {
      const created = await tx.aIRun.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "ANALYZE_BENCHMARK", provider: runtime.providerName, model: runtime.model, promptVersion: 1, status: "RUNNING", inputSummary: json(summary), metadata: json({ benchmarkAction: "IDENTIFY_PLAYBOOKS", benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: rows.length, schemaVersion: "benchmark-playbook-v1", structuredOutput: "JSON_OBJECT", ...runtimeAudit }) } });
      await tx.benchmarkStudy.update({ where: { id: record.id }, data: { aiRunId: created.id, errorCode: null, errorMessage: null } });
      await tx.auditLog.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "benchmark_playbook.started", resourceType: "benchmark_study", resourceId: record.id, metadata: json({ aiRunId: created.id, sampleCount: rows.length }) } });
      return created;
    });
    runId = run.id;
    const result = await runtime.provider.generateStructured({ systemPrompt: `${benchmarkPlaybookSystemBoundary}\n\n${generationQualityContract}`, prompt, maxCompletionTokens: 3_000, structuredOutput: { strategy: "JSON_OBJECT" } }, benchmarkPlaybookGenerationSchema);
    const output = normalizeBenchmarkPlaybookOutput(result.data.value, atoms, manifest.data.distillations);
    const latencyMs = Date.now() - startedAt.getTime();
    await db.$transaction([
      db.aIRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", outputJson: json(output), metadata: json({ benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: rows.length, schemaVersion: "benchmark-playbook-v1", structuredOutput: "JSON_OBJECT", ...runtimeAudit, actualModel: result.data.model, finishReason: result.data.finishReason ?? null }), providerRequestId: result.data.providerRequestId, inputTokens: result.data.usage?.inputTokens, outputTokens: result.data.usage?.outputTokens, finishedAt: new Date() } }),
      db.benchmarkStudy.update({ where: { id: record.id }, data: { status: "COMPLETED", output: json(output), errorCode: null, errorMessage: null } }),
      db.apiUsage.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, provider: runtime.providerName, operation: "IDENTIFY_BENCHMARK_PLAYBOOKS", requestId: run.id, providerRequestId: result.data.providerRequestId, success: true, units: 1, cost: null, inputTokens: result.data.usage?.inputTokens, outputTokens: result.data.usage?.outputTokens, metadata: json({ airRunId: run.id, benchmarkStudyId: record.id, sampleCount: rows.length, promptVersion: 1, latencyMs, ...runtimeAudit, actualModel: result.data.model, finishReason: result.data.finishReason ?? null }) } }),
      db.auditLog.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "benchmark_playbook.succeeded", resourceType: "benchmark_study", resourceId: record.id, metadata: json({ sampleCount: rows.length, playbookCount: output.playbooks.length }) } }),
    ]);
    return { status: "ok" as const, studyId: record.id, sampleCount: rows.length };
  } catch (error) {
    const failed = benchmarkPlaybookFailure(error);
    const diagnostics = { structuredOutput: "JSON_OBJECT", requestedModel: requestedModel ?? null, actualModel: failed.actualModel ?? null, finishReason: failed.finishReason ?? null, validationIssues: failed.validationIssues ?? [], returnedRootKeys: failed.returnedRootKeys ?? [], returnedFirstLevelObjectKeys: failed.returnedFirstLevelObjectKeys ?? {} };
    if (runId) {
      await db.aIRun.update({ where: { id: runId }, data: { status: "FAILED", errorCode: failed.code, errorMessage: "组合打法研究未完成。", providerRequestId: failed.providerRequestId, metadata: json({ benchmarkAction: "IDENTIFY_PLAYBOOKS", benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: rows.length, schemaVersion: "benchmark-playbook-v1", provider: runProvider ?? "LLM", providerMode: runMode ?? "REAL", ...diagnostics }), finishedAt: new Date() } }).catch(() => undefined);
      await db.apiUsage.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, provider: runProvider ?? "LLM", operation: "IDENTIFY_BENCHMARK_PLAYBOOKS", requestId: runId, providerRequestId: failed.providerRequestId, success: false, units: 1, cost: null, metadata: json({ airRunId: runId, benchmarkStudyId: record.id, errorCode: failed.code, ...diagnostics }) } }).catch(() => undefined);
    }
    const attempt = job.attemptsMade + 1;
    const willRetry = failed.retryable && attempt < 3;
    await db.benchmarkStudy.update({ where: { id: record.id }, data: { status: willRetry ? "PROCESSING" : "FAILED", errorCode: failed.code, errorMessage: willRetry ? null : failed.message } }).catch(() => undefined);
    await db.auditLog.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "benchmark_playbook.failed", resourceType: "benchmark_study", resourceId: record.id, metadata: json({ sampleCount: rows.length, attempt, retrying: willRetry, errorCode: failed.code, ...diagnostics }) } }).catch(() => undefined);
    if (!failed.retryable) throw new UnrecoverableError(`${failed.code}: ${failed.message}`);
    throw error;
  }
}
