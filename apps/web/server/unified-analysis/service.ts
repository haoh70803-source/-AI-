import "server-only";

import { db, type Prisma } from "@content-center/db";
import type { LLMRuntime } from "../ai/llm-runtime";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { renderPrompt, selectPromptTemplate } from "../ai/prompt-service";
import { UnifiedCreativeAnalysisContextBuilder, unifiedAnalysisFingerprint } from "./context-builder";
import { UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION, unifiedCreativeAnalysisProviderSchema, unifiedCreativeAnalysisOutputInstruction, unifiedCreativeAnalysisOutputSchema, type UnifiedCreativeAnalysisAdvisory, type UnifiedCreativeAnalysisOutput } from "./schemas";

export class UnifiedCreativeAnalysisError extends Error {
  constructor(readonly code: "UNIFIED_ANALYSIS_IN_PROGRESS" | "UNIFIED_ANALYSIS_INVALID_OUTPUT", message: string) { super(message); this.name = "UnifiedCreativeAnalysisError"; }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function code(error: unknown) { return error && typeof error === "object" && "code" in error ? String(error.code) : "UNIFIED_ANALYSIS_FAILED"; }

function normalizeAdvisory(advisory: UnifiedCreativeAnalysisAdvisory, allowedIds: Set<string>) {
  let hasGap = false;
  const refs = (items: string[]) => {
    const valid = [...new Set(items.filter((id) => allowedIds.has(id)))];
    if (valid.length !== items.length || valid.length === 0) hasGap = true;
    return valid;
  };
  const normalized: UnifiedCreativeAnalysisAdvisory = {
    creativeInterpretation: { ...advisory.creativeInterpretation, sourceItemIds: refs(advisory.creativeInterpretation.sourceItemIds) },
    angles: advisory.angles.map((item) => ({ ...item, sourceItemIds: refs(item.sourceItemIds) })),
    structure: { ...advisory.structure, sourceItemIds: refs(advisory.structure.sourceItemIds), sections: advisory.structure.sections.map((section) => ({ ...section, sourceItemIds: refs(section.sourceItemIds) })) },
    expressionDirection: { ...advisory.expressionDirection, sourceItemIds: refs(advisory.expressionDirection.sourceItemIds) },
    riskNotes: advisory.riskNotes.map((item) => ({ ...item, sourceItemIds: refs(item.sourceItemIds) })),
    titleReferences: advisory.titleReferences.map((item) => ({ ...item, sourceItemIds: refs(item.sourceItemIds) })),
  };
  return { normalized, hasGap };
}

function composeOutput(input: { advisory: UnifiedCreativeAnalysisAdvisory; sourceUnderstanding: Pick<UnifiedCreativeAnalysisOutput, "summary" | "coreQuestion" | "coreViewpoint" | "keyPoints">; sourceDirectory: Array<{ sourceItemId: string; title: string | null; role: string }> }): UnifiedCreativeAnalysisOutput {
  const allowedIds = new Set(input.sourceDirectory.map(({ sourceItemId }) => sourceItemId));
  const { normalized, hasGap } = normalizeAdvisory(input.advisory, allowedIds);
  const referencedIds = new Set([input.sourceUnderstanding.summary, input.sourceUnderstanding.coreQuestion, input.sourceUnderstanding.coreViewpoint, ...input.sourceUnderstanding.keyPoints].flatMap(({ sourceItemIds }) => sourceItemIds));
  const collect = (ids: string[]) => ids.forEach((id) => referencedIds.add(id));
  collect(normalized.creativeInterpretation.sourceItemIds); normalized.angles.forEach((item) => collect(item.sourceItemIds)); collect(normalized.structure.sourceItemIds); normalized.structure.sections.forEach((item) => collect(item.sourceItemIds)); collect(normalized.expressionDirection.sourceItemIds); normalized.riskNotes.forEach((item) => collect(item.sourceItemIds)); normalized.titleReferences.forEach((item) => collect(item.sourceItemIds));
  return unifiedCreativeAnalysisOutputSchema.parse({ schemaVersion: UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION, ...input.sourceUnderstanding, ...normalized, sourceReferences: input.sourceDirectory.filter(({ sourceItemId }) => referencedIds.has(sourceItemId)), groundingGaps: hasGap || !allowedIds.size ? ["SOURCE_REFERENCE_GAP"] : [] });
}

async function buildCurrentInput(input: { workspaceId: string; userId: string; projectId: string }, builder = new UnifiedCreativeAnalysisContextBuilder()) {
  const [built, template] = await Promise.all([builder.build(input), selectPromptTemplate(input.workspaceId, "UNIFIED_CREATIVE_ANALYSIS")]);
  const inputFingerprint = unifiedAnalysisFingerprint({ promptTemplateId: template.id, promptVersion: template.version, context: built.context });
  return { built, template, inputFingerprint };
}

async function reserve(input: { workspaceId: string; userId: string; projectId: string; inputFingerprint: string; provenance: unknown }) {
  const existing = await db.unifiedCreativeAnalysis.findUnique({ where: { projectId_inputFingerprint: { projectId: input.projectId, inputFingerprint: input.inputFingerprint } } });
  if (existing?.status === "COMPLETED") return { record: existing, cached: true };
  if (existing?.status === "PROCESSING") throw new UnifiedCreativeAnalysisError("UNIFIED_ANALYSIS_IN_PROGRESS", "AI 分析正在生成，请稍候。");
  if (existing) {
    const claimed = await db.unifiedCreativeAnalysis.updateMany({ where: { id: existing.id, workspaceId: input.workspaceId, status: "FAILED" }, data: { status: "PROCESSING", aiRunId: null, errorCode: null, errorMessage: null, provenance: json(input.provenance) } });
    if (!claimed.count) throw new UnifiedCreativeAnalysisError("UNIFIED_ANALYSIS_IN_PROGRESS", "AI 分析正在生成，请稍候。");
    return { record: await db.unifiedCreativeAnalysis.findUniqueOrThrow({ where: { id: existing.id } }), cached: false };
  }
  try {
    const record = await db.$transaction(async (tx) => {
      const latest = await tx.unifiedCreativeAnalysis.findFirst({ where: { projectId: input.projectId }, orderBy: { version: "desc" }, select: { version: true } });
      return tx.unifiedCreativeAnalysis.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, createdById: input.userId, version: (latest?.version ?? 0) + 1, inputFingerprint: input.inputFingerprint, provenance: json(input.provenance) } });
    }, { isolationLevel: "Serializable" });
    return { record, cached: false };
  } catch (error) {
    if (code(error) === "P2002" || code(error) === "P2034") return reserve(input);
    throw error;
  }
}

function dto(record: { id: string; version: number; status: string; inputFingerprint: string; output: Prisma.JsonValue | null; errorCode: string | null; errorMessage: string | null; createdAt: Date; updatedAt: Date }, options: { cached: boolean; isStale: boolean }) {
  return { id: record.id, version: record.version, schemaVersion: UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION, status: record.status, inputFingerprint: record.inputFingerprint, output: record.output ? unifiedCreativeAnalysisOutputSchema.parse(record.output) : null, errorCode: record.errorCode, errorMessage: record.errorMessage, cached: options.cached, isStale: options.isStale, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

export async function runUnifiedCreativeAnalysis(input: { workspaceId: string; userId: string; projectId: string }, dependencies: { runtime?: LLMRuntime; contextBuilder?: UnifiedCreativeAnalysisContextBuilder } = {}) {
  const current = await buildCurrentInput(input, dependencies.contextBuilder);
  const reserved = await reserve({ ...input, inputFingerprint: current.inputFingerprint, provenance: { ...current.built.provenance, promptTemplateId: current.template.id, promptVersion: current.template.version } });
  if (reserved.cached) return dto(reserved.record, { cached: true, isStale: false });
  try {
    const prompt = `${renderPrompt(current.template.template, current.built.context)}${unifiedCreativeAnalysisOutputInstruction}`;
    const run = await executeStructuredAIRun<UnifiedCreativeAnalysisAdvisory>({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, action: "UNIFIED_CREATIVE_ANALYSIS", operation: "UNIFIED_CREATIVE_ANALYSIS", promptTemplateId: current.template.id, promptVersion: current.template.version, inputSummary: { ...current.built.inputSummary, inputFingerprint: current.inputFingerprint }, metadata: { schemaVersion: UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION, inputFingerprint: current.inputFingerprint }, auditMetadata: { unifiedCreativeAnalysisId: reserved.record.id, unifiedCreativeAnalysisVersion: reserved.record.version }, contextTruncated: current.built.contextTruncated, onRunCreated: (aiRunId) => db.unifiedCreativeAnalysis.update({ where: { id: reserved.record.id }, data: { aiRunId } }).then(() => undefined), generate: (provider) => provider.generateStructured({ systemPrompt: current.template.systemPrompt, prompt }, unifiedCreativeAnalysisProviderSchema) }, { runtime: dependencies.runtime });
    const output = composeOutput({ advisory: run.output, sourceUnderstanding: current.built.sourceUnderstanding, sourceDirectory: current.built.sourceDirectory });
    const completed = await db.unifiedCreativeAnalysis.update({ where: { id: reserved.record.id }, data: { status: "COMPLETED", output: json(output), errorCode: null, errorMessage: null } });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "unified_creative_analysis.completed", resourceType: "unified_creative_analysis", resourceId: completed.id, metadata: { projectId: input.projectId, version: completed.version, inputFingerprint: current.inputFingerprint } } });
    return dto(completed, { cached: false, isStale: false });
  } catch (error) {
    await db.unifiedCreativeAnalysis.update({ where: { id: reserved.record.id }, data: { status: "FAILED", errorCode: code(error), errorMessage: error instanceof Error ? error.message : "AI 分析暂时失败。" } });
    throw error;
  }
}

export async function getUnifiedCreativeAnalysisState(input: { workspaceId: string; userId: string; projectId: string }) {
  const current = await buildCurrentInput(input);
  const [latestCompleted, latest] = await Promise.all([
    db.unifiedCreativeAnalysis.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, status: "COMPLETED" }, orderBy: { version: "desc" } }),
    db.unifiedCreativeAnalysis.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId }, orderBy: { version: "desc" } }),
  ]);
  return { analysis: latestCompleted ? dto(latestCompleted, { cached: true, isStale: latestCompleted.inputFingerprint !== current.inputFingerprint }) : null, currentInputFingerprint: current.inputFingerprint, latestStatus: latest?.status ?? null, latestErrorCode: latest?.status === "FAILED" ? latest.errorCode : null };
}
