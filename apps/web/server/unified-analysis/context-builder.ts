import "server-only";

import { createHash } from "node:crypto";
import { resolveSourceContent } from "@content-center/core";
import { db } from "@content-center/db";
import { ProjectServiceError } from "../project-service";
import { readMaterialAnalysisBriefMetadata } from "../material-analysis/brief-mapper";
import { UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION } from "./schemas";

export type UnifiedContextLimits = { perSourceChars: number; totalSourceChars: number; totalEvidenceChars: number };
const defaults: UnifiedContextLimits = { perSourceChars: 8_000, totalSourceChars: 24_000, totalEvidenceChars: 12_000 };

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function take(value: string, maximum: number) { return value.length <= maximum ? { value, truncated: false } : { value: value.slice(0, maximum), truncated: true }; }

export class UnifiedCreativeAnalysisContextBuilder {
  constructor(private readonly limits: UnifiedContextLimits = defaults) {}

  async build(input: { workspaceId: string; userId: string; projectId: string }) {
    const project = await db.contentProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
      include: {
        creatorProfile: true,
        creativeBrief: true,
        sources: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { sourceItem: { include: { transcript: true, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1 } } } } },
        evidenceItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
    const briefMetadata = readMaterialAnalysisBriefMetadata(project.creativeBrief?.metadata);
    const primary = (briefMetadata ? project.sources.find(({ sourceItemId }) => sourceItemId === briefMetadata.primarySourceItemId) : null)
      ?? project.sources.find(({ sourceItem }) => Boolean(sourceItem.materialAnalyses[0]));
    const primaryAnalysis = primary?.sourceItem.materialAnalyses[0];
    const sourceClassification = primaryAnalysis ? "SOURCE_FACT" as const : "USER_INPUT" as const;
    const sourceItemIds = primaryAnalysis && primary ? [primary.sourceItemId] : [];
    const brief = project.creativeBrief;
    const sourceUnderstanding = {
      summary: { text: primaryAnalysis?.summary?.trim() || brief?.background?.trim() || "", classification: sourceClassification, sourceItemIds },
      coreQuestion: { text: primaryAnalysis?.coreQuestion?.trim() || brief?.coreQuestion?.trim() || "", classification: sourceClassification, sourceItemIds },
      coreViewpoint: { text: primaryAnalysis?.coreViewpoint?.trim() || brief?.coreMessage.trim() || "", classification: sourceClassification, sourceItemIds },
      keyPoints: (primaryAnalysis ? strings(primaryAnalysis.keyPoints) : strings(brief?.keyPoints)).map((text) => ({ text, classification: sourceClassification, sourceItemIds })),
    };
    let contextTruncated = false;
    let sourceBudget = this.limits.totalSourceChars;
    const sources = project.sources.flatMap(({ role, sourceItem }) => {
      if (sourceBudget <= 0) { contextTruncated = true; return []; }
      const readable = resolveSourceContent({ sourceType: sourceItem.sourceType, rawText: sourceItem.rawText, sourceUpdatedAt: sourceItem.updatedAt, transcript: sourceItem.transcript });
      const raw = readable?.contentText || "";
      const selected = take(raw, Math.min(this.limits.perSourceChars, sourceBudget));
      sourceBudget -= selected.value.length;
      contextTruncated ||= selected.truncated || raw.length > selected.value.length;
      const analysis = sourceItem.materialAnalyses[0];
      return [{ id: sourceItem.id, role, title: sourceItem.title, platform: sourceItem.sourcePlatform, text: selected.value, sourceUpdatedAt: sourceItem.updatedAt.toISOString(), transcriptUpdatedAt: readable?.contentSource === "TRANSCRIPT" ? readable.updatedAt.toISOString() : null, materialAnalysis: analysis ? { id: analysis.id, version: analysis.version, summary: analysis.summary, topic: analysis.topic, targetAudience: analysis.targetAudience, coreViewpoint: analysis.coreViewpoint, keyPoints: strings(analysis.keyPoints), coreQuestion: analysis.coreQuestion, updatedAt: analysis.updatedAt.toISOString() } : null }];
    });
    let evidenceBudget = this.limits.totalEvidenceChars;
    const evidence = project.evidenceItems.flatMap((item) => {
      if (evidenceBudget <= 0) { contextTruncated = true; return []; }
      const raw = JSON.stringify({ excerpt: item.excerpt, claim: item.claim, note: item.note });
      const selected = take(raw, evidenceBudget);
      evidenceBudget -= selected.value.length;
      contextTruncated ||= selected.truncated;
      return [{ id: item.id, type: item.type, sourceItemId: item.sourceItemId, content: selected.value, updatedAt: item.updatedAt.toISOString() }];
    });
    const profile = project.creatorProfile ? { displayName: project.creatorProfile.displayName, positioning: project.creatorProfile.positioning, targetAudience: project.creatorProfile.targetAudience, tone: project.creatorProfile.tone, preferredStyle: project.creatorProfile.preferredStyle, forbiddenStyle: project.creatorProfile.forbiddenStyle, coreTopics: strings(project.creatorProfile.coreTopics), personalViews: strings(project.creatorProfile.personalViews), brandTerms: strings(project.creatorProfile.brandTerms), forbiddenTerms: strings(project.creatorProfile.forbiddenTerms), structurePreferences: strings(project.creatorProfile.structurePreferences) } : null;
    const context = {
      schemaVersion: UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION,
      project: { id: project.id, title: project.title, description: project.description, goal: project.goal, audience: project.audience, updatedAt: project.updatedAt.toISOString() },
      creativeBrief: brief ? { version: brief.version, topic: brief.topic, angle: brief.angle, audience: brief.audience, coreMessage: brief.coreMessage, coreQuestion: brief.coreQuestion, background: brief.background, keyPoints: strings(brief.keyPoints), structure: strings(brief.structure), tone: brief.tone, risks: strings(brief.risks), updatedAt: brief.updatedAt.toISOString() } : null,
      sourceUnderstanding,
      sources,
      evidence,
      creatorProfile: profile,
      allowedSourceItemIds: sources.map(({ id }) => id),
    };
    const provenance = { schemaVersion: UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION, creativeBriefId: brief?.id ?? null, creativeBriefVersion: brief?.version ?? 0, primarySourceItemId: briefMetadata?.primarySourceItemId ?? null, materialAnalyses: sources.flatMap(({ id, materialAnalysis }) => materialAnalysis ? [{ sourceItemId: id, materialAnalysisId: materialAnalysis.id, version: materialAnalysis.version }] : []), evidenceIds: evidence.map(({ id }) => id) };
    return { context, sourceUnderstanding, provenance, contextTruncated, sourceDirectory: sources.map(({ id, title, role }) => ({ sourceItemId: id, title, role })), inputSummary: { sourceCount: sources.length, evidenceCount: evidence.length, creativeBriefVersion: brief?.version ?? 0, materialAnalysisVersions: provenance.materialAnalyses, contextChars: JSON.stringify(context).length, contextTruncated } };
  }
}

export function unifiedAnalysisFingerprint(input: { promptTemplateId: string; promptVersion: number; context: unknown }) {
  return createHash("sha256").update(JSON.stringify({ schemaVersion: UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION, promptTemplateId: input.promptTemplateId, promptVersion: input.promptVersion, context: input.context })).digest("hex");
}
