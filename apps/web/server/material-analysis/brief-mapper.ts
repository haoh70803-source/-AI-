import type { Prisma } from "@content-center/db";

type AnalysisForBrief = {
  id: string;
  version: number;
  suggestedTitle: string | null;
  summary: string | null;
  topic: string | null;
  tags: unknown;
  keywords: unknown;
  targetAudience: string | null;
  coreViewpoint: string | null;
  keyPoints: unknown;
  coreQuestion: string | null;
  understanding?: unknown;
};

type SourceForBrief = { id: string; title: string | null };
type ProjectForBrief = { title: string; audience: string | null };

export type MaterialAnalysisBriefMetadata = {
  handoff: "MATERIAL_ANALYSIS";
  initializedFromMaterialAnalysisId: string;
  materialAnalysisVersion: number;
  primarySourceItemId: string;
  sourceItemTitle: string | null;
  sourceTitleSuggestion: string | null;
  keywords: string[];
  referenceTags: string[];
};

export type MaterialAnalysisBriefDraft = {
  topic: string;
  angle: string;
  audience: string;
  coreMessage: string;
  coreQuestion: string;
  background: string;
  keyPoints: string[];
  structure: string[];
  tone: string;
  risks: string[];
  metadata: Prisma.InputJsonValue;
};

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

export class MaterialAnalysisToBriefMapper {
  static map(input: { analysis: AnalysisForBrief; source: SourceForBrief; project: ProjectForBrief }): MaterialAnalysisBriefDraft {
    const metadata: MaterialAnalysisBriefMetadata = {
      handoff: "MATERIAL_ANALYSIS",
      initializedFromMaterialAnalysisId: input.analysis.id,
      materialAnalysisVersion: input.analysis.version,
      primarySourceItemId: input.source.id,
      sourceItemTitle: input.source.title,
      sourceTitleSuggestion: text(input.analysis.suggestedTitle) || null,
      keywords: strings(input.analysis.keywords),
      referenceTags: strings(input.analysis.tags),
    };
    const hasNewUnderstanding = Boolean(input.analysis.understanding && typeof input.analysis.understanding === "object");
    return {
      topic: hasNewUnderstanding ? text(input.project.title) : text(input.analysis.topic),
      angle: "",
      audience: hasNewUnderstanding ? text(input.project.audience) : text(input.analysis.targetAudience) || text(input.project.audience),
      coreMessage: hasNewUnderstanding ? "" : text(input.analysis.coreViewpoint),
      coreQuestion: hasNewUnderstanding ? "" : text(input.analysis.coreQuestion),
      background: hasNewUnderstanding ? "" : text(input.analysis.summary),
      keyPoints: hasNewUnderstanding ? [] : strings(input.analysis.keyPoints),
      structure: [],
      tone: "",
      risks: [],
      metadata: metadata as unknown as Prisma.InputJsonValue,
    };
  }
}

export function readMaterialAnalysisBriefMetadata(value: unknown): MaterialAnalysisBriefMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  if (metadata.handoff !== "MATERIAL_ANALYSIS" || typeof metadata.initializedFromMaterialAnalysisId !== "string" || typeof metadata.materialAnalysisVersion !== "number" || typeof metadata.primarySourceItemId !== "string") return null;
  return {
    handoff: "MATERIAL_ANALYSIS",
    initializedFromMaterialAnalysisId: metadata.initializedFromMaterialAnalysisId,
    materialAnalysisVersion: metadata.materialAnalysisVersion,
    primarySourceItemId: metadata.primarySourceItemId,
    sourceItemTitle: typeof metadata.sourceItemTitle === "string" ? metadata.sourceItemTitle : null,
    sourceTitleSuggestion: typeof metadata.sourceTitleSuggestion === "string" ? metadata.sourceTitleSuggestion : null,
    keywords: strings(metadata.keywords),
    referenceTags: strings(metadata.referenceTags),
  };
}
