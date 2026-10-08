import { db, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import {
  LLMError,
  OpenAICompatibleLLMProvider,
  benchmarkAnalysisGenerationSchema,
  benchmarkAnalysisOutputInstruction,
  benchmarkAnalysisSystemBoundary,
  materialAnalysisOutputSchema,
  openAICompatibleConfigSchema,
  type BenchmarkAnalysisGeneration,
  type BenchmarkFinding,
  type BenchmarkCommonMethod,
  type LLMProvider,
} from "@content-center/providers";
import { UnrecoverableError, type Job } from "bullmq";
import type { BenchmarkStudyPayload } from "./queue";

export type BenchmarkRuntime = {
  provider: LLMProvider;
  providerName: string;
  model: string;
  requestedModel?: string;
  mode?: string;
};

type StudySampleInput = { sampleId: string; understanding: unknown };
type EvidenceIndex = Map<string, Set<string>>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function list(value: string | string[]): string[] {
  return typeof value === "string" ? [value] : strings(value);
}

function collectQuotes(value: unknown, quotes: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectQuotes(item, quotes);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence" && Array.isArray(child)) {
      for (const item of child) {
        const quote = object(item).quote;
        if (typeof quote === "string" && Boolean(quote.trim())) quotes.add(quote.trim());
      }
    }
    collectQuotes(child, quotes);
  }
}

export function evidenceIndex(samples: StudySampleInput[]): EvidenceIndex {
  return new Map(samples.map((sample): [string, Set<string>] => {
    const quotes = new Set<string>();
    collectQuotes(sample.understanding, quotes);
    return [sample.sampleId, quotes];
  }));
}

function normalizeEvidence(items: BenchmarkAnalysisGeneration["commonMethods"][number]["evidence"], valid: Set<string>, quotes: EvidenceIndex) {
  return items.flatMap((item) => {
    const sampleId = item.sampleId.trim();
    const quote = item.quote.trim();
    return valid.has(sampleId) && quotes.get(sampleId)?.has(quote) ? [{ sampleId, quote }] : [];
  });
}

function normalizedIds(ids: string[], valid: Set<string>) {
  return ids.map((id) => id.trim()).filter((id, index, all) => valid.has(id) && all.indexOf(id) === index);
}

function normalizeFinding(item: BenchmarkFinding, valid: Set<string>, quotes: EvidenceIndex): BenchmarkFinding | null {
  const grounded = normalizeEvidence(item.evidence, valid, quotes);
  if (!grounded.length) return null;
  const evidenceSampleIds = grounded.map(({ sampleId }) => sampleId);
  return {
    name: item.name.trim(),
    summary: item.summary.trim(),
    occurrenceSampleIds: normalizedIds([...item.occurrenceSampleIds, ...evidenceSampleIds], valid),
    exceptionSampleIds: normalizedIds(item.exceptionSampleIds, valid),
    evidence: grounded,
  };
}

function normalizeMethod(item: BenchmarkCommonMethod, valid: Set<string>, quotes: EvidenceIndex): BenchmarkCommonMethod | null {
  const grounded = normalizeEvidence(item.evidence, valid, quotes);
  if (!grounded.length) return null;
  const evidenceSampleIds = grounded.map(({ sampleId }) => sampleId);
  return {
    title: item.title.trim(),
    howTo: list(item.howTo),
    applicable: list(item.applicable),
    boundaries: list(item.boundaries),
    occurrenceSampleIds: normalizedIds([...item.occurrenceSampleIds, ...evidenceSampleIds], valid),
    exceptionSampleIds: normalizedIds(item.exceptionSampleIds, valid),
    evidence: grounded,
  };
}

function normalizeFindingList(items: BenchmarkFinding[], valid: Set<string>, quotes: EvidenceIndex) {
  return items.flatMap((item) => {
    const normalized = normalizeFinding(item, valid, quotes);
    return normalized ? [normalized] : [];
  });
}

/** Keep only findings that can be checked against the locked M1 evidence. */
export function normalizeBenchmarkAnalysisOutput(input: BenchmarkAnalysisGeneration, samples: StudySampleInput[]) {
  const valid = new Set(samples.map((sample) => sample.sampleId));
  const quotes = evidenceIndex(samples);
  const findings = (items: BenchmarkFinding[]) => normalizeFindingList(items, valid, quotes);
  const commonMethods = input.stableMethodsFound
    ? input.commonMethods.flatMap((item) => {
      const normalized = normalizeMethod(item, valid, quotes);
      return normalized ? [normalized] : [];
    })
    : [];
  const exceptions = findings(input.exceptions);
  const repeatedCaseNotes = input.repeatedCaseNotes.flatMap((item) => {
    const grounded = normalizeEvidence(item.evidence, valid, quotes);
    if (!grounded.length) return [];
    return [{ summary: item.summary.trim(), sampleIds: normalizedIds([...item.sampleIds, ...grounded.map(({ sampleId }) => sampleId)], valid), evidence: grounded }];
  });
  return benchmarkAnalysisGenerationSchema.parse({
    topicDirections: findings(input.topicDirections),
    openingPatterns: findings(input.openingPatterns),
    structures: findings(input.structures),
    persuasionMethods: findings(input.persuasionMethods),
    expressionHabits: findings(input.expressionHabits),
    endings: findings(input.endings),
    commonMethods,
    exceptions,
    repeatedCaseNotes,
    stableMethodsFound: input.stableMethodsFound && commonMethods.length > 0,
    message: input.message.trim(),
  });
}

export function applyBenchmarkSampleBoundary(output: BenchmarkAnalysisGeneration, sampleCount: number) {
  if (sampleCount >= 5) return output;
  return {
    ...output,
    commonMethods: [],
    stableMethodsFound: false,
    message: `本次只有 ${sampleCount} 条样本，可以先查看共同点和不同做法；增加到至少 5 条代表内容后再形成账号方法集。`,
  };
}

function renderPrompt(template: string, context: unknown) {
  return template.replaceAll("{{context}}", JSON.stringify(context, null, 2)).replaceAll("{{input}}", "{}");
}

export function buildBenchmarkAnalysisPrompt(template: string, context: unknown) {
  return `${renderPrompt(template, context)}\n${benchmarkAnalysisOutputInstruction}`;
}

export async function loadBenchmarkRuntime(workspaceId: string): Promise<BenchmarkRuntime> {
  const integrations = new IntegrationService();
  const status = await integrations.getIntegrationStatus(workspaceId, "LLM");
  if (status.status === "DISABLED") throw new LLMError("LLM_DISABLED", "AI 模型已禁用。", false);
  if (status.status !== "CONFIGURED") throw new LLMError("LLM_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员完成设置。", false);
  const config = await integrations.getDecryptedIntegrationConfig(workspaceId, "LLM");
  const parsed = openAICompatibleConfigSchema.safeParse(config);
  if (!parsed.success) throw new LLMError("LLM_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员完成设置。", false);
  const metadata = object(config);
  return {
    provider: new OpenAICompatibleLLMProvider(parsed.data),
    providerName: metadata.mode === "FIXTURE" ? parsed.data.provider : parsed.data.provider.toUpperCase(),
    model: parsed.data.model,
    requestedModel: typeof metadata.requestedModel === "string" ? metadata.requestedModel : parsed.data.model,
    mode: typeof metadata.mode === "string" ? metadata.mode : "REAL",
  };
}

async function promptTemplate(workspaceId: string) {
  return db.promptTemplate.findFirst({ where: { workspaceId, type: "ANALYZE_BENCHMARK", isActive: true }, orderBy: { version: "desc" } })
    .then((workspaceTemplate) => workspaceTemplate ?? db.promptTemplate.findFirst({ where: { workspaceId: null, type: "ANALYZE_BENCHMARK", isActive: true }, orderBy: { version: "desc" } }))
    .then((template) => template ?? { id: null, version: 1, systemPrompt: benchmarkAnalysisSystemBoundary, template: "Action: ANALYZE_BENCHMARK\nContext:\n{{context}}" });
}

function failure(error: unknown) {
  if (error instanceof LLMError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "BENCHMARK_ANALYSIS_FAILED", message: "这次账号研究没有完成，请重试。", retryable: false };
}

type BenchmarkJobDependencies = { runtime?: BenchmarkRuntime };

export async function processBenchmarkStudyJob(job: Job<BenchmarkStudyPayload>, dependencies: BenchmarkJobDependencies = {}) {
  const startedAt = new Date();
  const record = await db.benchmarkStudy.findFirst({
    where: { id: job.data.studyId, workspaceId: job.data.workspaceId, createdById: job.data.requestedById },
    include: {
      benchmarkAccount: { select: { id: true, workspaceId: true, name: true, platform: true } },
      samples: {
        orderBy: { createdAt: "asc" },
        include: {
          sourceItem: { select: { id: true, title: true, sourcePlatform: true, externalId: true } },
          materialAnalysis: { select: { id: true, version: true, status: true, understanding: true } },
        },
      },
    },
  });
  if (!record || record.benchmarkAccount.workspaceId !== record.workspaceId) throw new UnrecoverableError("Benchmark study scope mismatch");
  if (record.status === "COMPLETED") return { status: "already-completed" as const, studyId: record.id };
  if (!record.samples.length || record.samples.length > 10) throw new UnrecoverableError("Benchmark study sample count is invalid");
  if (record.samples.some((sample) => {
    if (!sample.materialAnalysis || sample.materialAnalysis.status !== "COMPLETED") return true;
    const parsed = materialAnalysisOutputSchema.safeParse(sample.materialAnalysis.understanding);
    return !parsed.success || !("expression" in parsed.data);
  })) throw new UnrecoverableError("Benchmark sample analysis is not completed");

  const samples: StudySampleInput[] = record.samples.map((sample) => ({ sampleId: sample.id, understanding: sample.materialAnalysis!.understanding }));
  const context = {
    benchmarkAccount: { name: record.benchmarkAccount.name, platform: record.benchmarkAccount.platform },
    samples: record.samples.map((sample) => ({
      sampleId: sample.id,
      content: { title: sample.sourceItem.title, platform: sample.sourceItem.sourcePlatform, externalId: sample.sourceItem.externalId },
      materialAnalysis: { version: sample.materialAnalysis!.version, understanding: sample.materialAnalysis!.understanding },
    })),
    cautions: [benchmarkAnalysisSystemBoundary, "The number of samples is not an independent fact count.", "Only structured M1 understanding and its evidence are available; transcript, visual and audio data are not supplied."],
  };
  const contextTruncated = JSON.stringify(context).length > 200_000;
  const summary = { benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: samples.length, insufficientSamples: record.insufficientSamples };
  let runId: string | undefined;
  let templateVersion = 0;
  let runProvider: string | undefined;
  let requestedModel: string | undefined;
  try {
    const template = await promptTemplate(record.workspaceId);
    templateVersion = template.version;
    const runtime = dependencies.runtime ?? await loadBenchmarkRuntime(record.workspaceId);
    runProvider = runtime.providerName;
    requestedModel = runtime.requestedModel ?? runtime.model;
    const runtimeAudit = { provider: runtime.providerName, requestedModel, providerMode: runtime.mode ?? "REAL" };
    const systemPrompt = `${template.systemPrompt}\n\n${benchmarkAnalysisSystemBoundary}\nReturn only comparative findings grounded in supplied sample ids and exact M1 evidence quotes. Do not return scores, independent fact counts, or a single-source method disguised as a common method.`;
    const prompt = buildBenchmarkAnalysisPrompt(template.template, context);
    const run = await db.$transaction(async (tx) => {
      const created = await tx.aIRun.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "ANALYZE_BENCHMARK", provider: runtime.providerName, model: runtime.model, promptTemplateId: template.id, promptVersion: template.version, status: "RUNNING", inputSummary: json(summary), metadata: json({ benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: samples.length, schemaVersion: "benchmark-study-v1", ...runtimeAudit }), contextTruncated } });
      await tx.benchmarkStudy.update({ where: { id: record.id }, data: { status: "PROCESSING", aiRunId: created.id, errorCode: null, errorMessage: null } });
      await tx.auditLog.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "benchmark_study.started", resourceType: "benchmark_study", resourceId: record.id, metadata: json({ aiRunId: created.id, sampleCount: samples.length, promptVersion: template.version }) } });
      return created;
    });
    runId = run.id;
    const result = await runtime.provider.generateStructured({ systemPrompt, prompt }, benchmarkAnalysisGenerationSchema);
    const normalized = normalizeBenchmarkAnalysisOutput(result.data.value, samples);
    const output = applyBenchmarkSampleBoundary(normalized, samples.length);
    const latencyMs = Date.now() - startedAt.getTime();
    await db.$transaction([
      db.aIRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", outputJson: json(output), metadata: json({ benchmarkStudyId: record.id, benchmarkAccountId: record.benchmarkAccountId, sampleCount: samples.length, schemaVersion: "benchmark-study-v1", ...runtimeAudit, actualModel: result.data.model }), providerRequestId: result.data.providerRequestId, inputTokens: result.data.usage?.inputTokens, outputTokens: result.data.usage?.outputTokens, finishedAt: new Date() } }),
      db.benchmarkStudy.update({ where: { id: record.id }, data: { status: "COMPLETED", output: json(output), errorCode: null, errorMessage: null } }),
      db.apiUsage.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, provider: runtime.providerName, operation: "ANALYZE_BENCHMARK", requestId: run.id, providerRequestId: result.data.providerRequestId, success: true, units: 1, cost: null, inputTokens: result.data.usage?.inputTokens, outputTokens: result.data.usage?.outputTokens, metadata: json({ airRunId: run.id, benchmarkStudyId: record.id, sampleCount: samples.length, promptVersion: template.version, contextTruncated, latencyMs, ...runtimeAudit, actualModel: result.data.model }) } }),
      db.auditLog.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "benchmark_study.succeeded", resourceType: "benchmark_study", resourceId: record.id, metadata: json({ aiRunId: run.id, sampleCount: samples.length, commonMethodCount: output.commonMethods.length }) } }),
    ]);
    return { status: "ok" as const, studyId: record.id, sampleCount: samples.length };
  } catch (error) {
    const failed = failure(error);
    if (runId) {
      await db.aIRun.update({ where: { id: runId }, data: { status: "FAILED", errorCode: failed.code, errorMessage: "账号研究未完成。", finishedAt: new Date() } }).catch(() => undefined);
      await db.apiUsage.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, provider: runProvider ?? "LLM", operation: "ANALYZE_BENCHMARK", requestId: runId, success: false, units: 1, cost: null, metadata: json({ airRunId: runId, benchmarkStudyId: record.id, sampleCount: samples.length, promptVersion: templateVersion, contextTruncated, errorCode: failed.code, requestedModel: requestedModel ?? null }) } }).catch(() => undefined);
    }
    const attempt = job.attemptsMade + 1;
    const willRetry = failed.retryable && attempt < 3;
    await db.benchmarkStudy.update({ where: { id: record.id }, data: { status: willRetry ? "PROCESSING" : "FAILED", errorCode: failed.code, errorMessage: willRetry ? null : failed.message } }).catch(() => undefined);
    await db.auditLog.create({ data: { workspaceId: record.workspaceId, userId: record.createdById, action: "benchmark_study.failed", resourceType: "benchmark_study", resourceId: record.id, metadata: json({ sampleCount: samples.length, attempt, retrying: willRetry, errorCode: failed.code }) } }).catch(() => undefined);
    if (!failed.retryable) throw new UnrecoverableError(`${failed.code}: ${failed.message}`);
    throw error;
  }
}

export const processBenchmarkAnalysisJob = processBenchmarkStudyJob;

export { benchmarkAnalysisGenerationSchema, benchmarkAnalysisOutputInstruction, benchmarkAnalysisSystemBoundary };
