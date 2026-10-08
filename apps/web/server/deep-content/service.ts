import "server-only";

import { db, type Prisma } from "@content-center/db";
import type { LLMRuntime } from "../ai/llm-runtime";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { loadLLMRuntime } from "../ai/llm-runtime";
import { renderPrompt, selectPromptTemplate } from "../ai/prompt-service";
import { ProjectServiceError } from "../project-service";
import { DeepContentContextBuilder } from "./context";
import { deepContentPackageSchema, deepPackageOutputInstruction, type DeepContentPackageOutput } from "./schemas";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function counts(output: DeepContentPackageOutput) {
  return { candidateTopics: output.topicPackage.candidateTopics.length, evidence: output.evidencePackage.items.length, hooks: output.expressionPackage.hooks.length, structures: output.structurePackage.structures.length, risks: output.risks.length, needsConfirmation: output.needsConfirmation.length };
}

export function normalizeDeepPackageGrounding(output: unknown, validEvidenceIds: Set<string>, validSourceIds: Set<string>, groundedCreatorContribution: DeepContentPackageOutput["creatorContribution"]) {
  const parsed = deepContentPackageSchema.parse(output);
  return {
    ...parsed,
    evidencePackage: {
      items: parsed.evidencePackage.items.map((item) => {
        const evidenceValid = Boolean(item.evidenceId && validEvidenceIds.has(item.evidenceId));
        const sourceItemId = item.sourceItemId && validSourceIds.has(item.sourceItemId) ? item.sourceItemId : null;
        if (item.classification === "CONFIRMED" && !evidenceValid) return { ...item, evidenceId: null, sourceItemId, classification: "NEEDS_VERIFICATION" as const, needsVerification: true };
        if (item.classification === "AI_SUGGESTION") return { ...item, evidenceId: evidenceValid ? item.evidenceId : null, sourceItemId, needsVerification: true };
        return { ...item, evidenceId: evidenceValid ? item.evidenceId : null, sourceItemId };
      }),
    },
    creatorContribution: groundedCreatorContribution,
  } satisfies DeepContentPackageOutput;
}

function packageOutput(row: { topicPackage: unknown; viewpointPackage: unknown; evidencePackage: unknown; expressionPackage: unknown; structurePackage: unknown; creatorContribution: unknown; recommendedDirection: string; risks: unknown; needsConfirmation: unknown }) {
  return deepContentPackageSchema.parse({ topicPackage: row.topicPackage, viewpointPackage: row.viewpointPackage, evidencePackage: row.evidencePackage, expressionPackage: row.expressionPackage, structurePackage: row.structurePackage, creatorContribution: row.creatorContribution, recommendedDirection: row.recommendedDirection, risks: row.risks, needsConfirmation: row.needsConfirmation });
}

function packageView<T extends { id: string; version: number; status: string; creatorProfileId: string | null; createdAt: Date; updatedAt: Date; topicPackage: unknown; viewpointPackage: unknown; evidencePackage: unknown; expressionPackage: unknown; structurePackage: unknown; creatorContribution: unknown; recommendedDirection: string; risks: unknown; needsConfirmation: unknown }>(row: T) {
  return { id: row.id, version: row.version, status: row.status, creatorProfileId: row.creatorProfileId, createdAt: row.createdAt, updatedAt: row.updatedAt, ...packageOutput(row) };
}

async function scopedProject(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } }, select: { id: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  return project;
}

export async function getDeepContentPackage(input: { workspaceId: string; userId: string; projectId: string }) {
  await scopedProject(input);
  const row = await db.deepContentPackage.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, status: { not: "ARCHIVED" } }, orderBy: { version: "desc" } });
  return row ? packageView(row) : null;
}

export async function generateDeepContentPackagePreview(input: { workspaceId: string; userId: string; projectId: string }, dependencies: { runtime?: LLMRuntime; contextBuilder?: DeepContentContextBuilder } = {}) {
  const [built, template, runtime] = await Promise.all([
    (dependencies.contextBuilder ?? new DeepContentContextBuilder()).build(input),
    selectPromptTemplate(input.workspaceId, "GENERATE_DEEP_CONTENT_PACKAGE"),
    dependencies.runtime ?? loadLLMRuntime(input.workspaceId),
  ]);
  const prompt = `${renderPrompt(template.template, built.context)}${deepPackageOutputInstruction}`;
  const run = await executeStructuredAIRun({
    ...input,
    action: "GENERATE_DEEP_CONTENT_PACKAGE",
    operation: "GENERATE_DEEP_CONTENT_PACKAGE",
    promptTemplateId: template.id,
    promptVersion: template.version,
    inputSummary: built.inputSummary,
    metadata: { creatorProfileId: built.creatorProfileId, evidenceCount: built.validEvidenceIds.size },
    auditMetadata: { evidenceCount: built.validEvidenceIds.size, hasCreatorProfile: Boolean(built.creatorProfileId) },
    contextTruncated: built.contextTruncated,
    generate: async (provider) => {
      const result = await provider.generateStructured({ systemPrompt: template.systemPrompt, prompt }, deepContentPackageSchema);
      return { ...result, data: { ...result.data, value: normalizeDeepPackageGrounding(result.data.value, built.validEvidenceIds, built.validSourceIds, built.groundedCreatorContribution) } };
    },
  }, { runtime });
  return run;
}

export async function applyDeepContentPackagePreview(input: { workspaceId: string; userId: string; projectId: string; runId: string }) {
  await scopedProject(input);
  const [run, grounding] = await Promise.all([
    db.aIRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, action: "GENERATE_DEEP_CONTENT_PACKAGE", status: "SUCCEEDED" } }),
    new DeepContentContextBuilder().build(input),
  ]);
  if (!run?.outputJson || run.appliedAt || run.discardedAt) throw new DeepContentPackageError("DEEP_PACKAGE_RUN_INVALID", "创作包 Preview 不存在或已经处理。");
  const output = normalizeDeepPackageGrounding(run.outputJson, grounding.validEvidenceIds, grounding.validSourceIds, grounding.groundedCreatorContribution);
  const metadata = run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata) ? run.metadata as Record<string, unknown> : {};
  const creatorProfileId = typeof metadata.creatorProfileId === "string" ? metadata.creatorProfileId : null;
  const saved = await db.$transaction(async (tx) => {
    const latest = await tx.deepContentPackage.aggregate({ where: { projectId: input.projectId }, _max: { version: true } });
    const version = (latest._max.version ?? 0) + 1;
    await tx.deepContentPackage.updateMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } });
    const created = await tx.deepContentPackage.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, creatorProfileId, version, status: "READY", topicPackage: json(output.topicPackage), viewpointPackage: json(output.viewpointPackage), evidencePackage: json(output.evidencePackage), expressionPackage: json(output.expressionPackage), structurePackage: json(output.structurePackage), creatorContribution: json(output.creatorContribution), recommendedDirection: output.recommendedDirection, risks: json(output.risks), needsConfirmation: json(output.needsConfirmation), createdById: input.userId } });
    await tx.aIRun.update({ where: { id: run.id }, data: { appliedAt: new Date() } });
    await tx.auditLog.createMany({ data: [
      { workspaceId: input.workspaceId, userId: input.userId, action: "deep_package.generated", resourceType: "deep_content_package", resourceId: created.id, metadata: { projectId: input.projectId, packageId: created.id, version, ...counts(output) } },
      { workspaceId: input.workspaceId, userId: input.userId, action: "ai.result_applied", resourceType: "ai_run", resourceId: run.id, metadata: { projectId: input.projectId, target: "deep_content_package", packageId: created.id, version } },
    ] });
    return created;
  });
  return packageView(saved);
}

export async function updateDeepContentPackage(input: { workspaceId: string; userId: string; projectId: string; packageId: string; expectedUpdatedAt: string; data: { coreTopic: string; mainViewpoint: string; supportingViewpoints: string[]; personalViews: string[]; recommendedStructure: string; risks: string[] } }) {
  await scopedProject(input);
  const existing = await db.deepContentPackage.findFirst({ where: { id: input.packageId, workspaceId: input.workspaceId, projectId: input.projectId, status: { not: "ARCHIVED" } } });
  if (!existing) throw new DeepContentPackageError("DEEP_PACKAGE_NOT_FOUND", "创作包不存在。");
  const expected = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expected.valueOf())) throw new DeepContentPackageError("DEEP_PACKAGE_INVALID_INPUT", "创作包版本信息无效。");
  const output = packageOutput(existing);
  const updatedOutput: DeepContentPackageOutput = {
    ...output,
    topicPackage: { ...output.topicPackage, coreTopic: input.data.coreTopic.trim() },
    viewpointPackage: { ...output.viewpointPackage, mainViewpoint: input.data.mainViewpoint.trim(), supportingViewpoints: input.data.supportingViewpoints },
    creatorContribution: { ...output.creatorContribution, personalViews: input.data.personalViews },
    structurePackage: { ...output.structurePackage, recommendedStructure: input.data.recommendedStructure.trim() },
    risks: input.data.risks,
  };
  deepContentPackageSchema.parse(updatedOutput);
  const saved = await db.$transaction(async (tx) => {
    const result = await tx.deepContentPackage.updateMany({ where: { id: existing.id, updatedAt: expected }, data: { topicPackage: json(updatedOutput.topicPackage), viewpointPackage: json(updatedOutput.viewpointPackage), creatorContribution: json(updatedOutput.creatorContribution), structurePackage: json(updatedOutput.structurePackage), risks: json(updatedOutput.risks) } });
    if (result.count !== 1) throw new DeepContentPackageError("DEEP_PACKAGE_VERSION_CONFLICT", "创作包已经更新，请刷新后重试。");
    const row = await tx.deepContentPackage.findUniqueOrThrow({ where: { id: existing.id } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "deep_package.updated", resourceType: "deep_content_package", resourceId: row.id, metadata: { projectId: input.projectId, packageId: row.id, version: row.version, changedFields: ["coreTopic", "mainViewpoint", "supportingViewpoints", "personalViews", "recommendedStructure", "risks"] } } });
    return row;
  });
  return packageView(saved);
}

export class DeepContentPackageError extends Error {
  constructor(readonly code: "DEEP_PACKAGE_RUN_INVALID" | "DEEP_PACKAGE_NOT_FOUND" | "DEEP_PACKAGE_INVALID_INPUT" | "DEEP_PACKAGE_VERSION_CONFLICT", message: string) { super(message); this.name = "DeepContentPackageError"; }
}

export type DeepContentPackageView = Awaited<ReturnType<typeof getDeepContentPackage>>;
