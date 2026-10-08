import { MaterialAnalysisToBriefMapper, readMaterialAnalysisBriefMetadata } from "../material-analysis/brief-mapper";
import { unifiedCreativeAnalysisOutputSchema, type UnifiedCreativeAnalysisOutput } from "../unified-analysis/schemas";

export type CreativePlan = {
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
  version: number;
  initializedFromMaterialAnalysis: boolean;
  analysisUpdateAvailable: boolean;
};

type ExistingBrief = Omit<CreativePlan, "initializedFromMaterialAnalysis" | "analysisUpdateAvailable"> & { metadata?: unknown };
type MaterialAnalysis = {
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
type Source = { sourceItem: { id: string; title: string | null; materialAnalyses: MaterialAnalysis[] } };

const emptyPlan = (): CreativePlan => ({ topic: "", angle: "", audience: "", coreMessage: "", coreQuestion: "", background: "", keyPoints: [], structure: [], tone: "", risks: [], version: 0, initializedFromMaterialAnalysis: false, analysisUpdateAvailable: false });
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const firstText = (...values: Array<string | null | undefined>) => values.find((value) => value?.trim())?.trim() ?? "";
const firstList = (...values: string[][]) => values.find((value) => value.length) ?? [];

function parseUnified(value: unknown): UnifiedCreativeAnalysisOutput | null {
  const parsed = unifiedCreativeAnalysisOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class CreativeBriefPrefillService {
  static build(input: {
    project: { title: string; audience: string | null; status: string };
    sources: Source[];
    existingBrief: ExistingBrief | null;
    unifiedAnalysisOutput?: unknown;
    hasMotherContent: boolean;
  }) {
    const metadata = readMaterialAnalysisBriefMetadata(input.existingBrief?.metadata);
    const primarySource = (metadata ? input.sources.find(({ sourceItem }) => sourceItem.id === metadata.primarySourceItemId) : null)
      ?? input.sources.find(({ sourceItem }) => sourceItem.materialAnalyses.length > 0);
    const analysis = primarySource?.sourceItem.materialAnalyses[0] ?? null;
    const materialDraft = analysis && primarySource ? MaterialAnalysisToBriefMapper.map({ analysis, source: primarySource.sourceItem, project: input.project }) : null;
    const stored: CreativePlan = input.existingBrief ? {
      topic: input.existingBrief.topic,
      angle: input.existingBrief.angle,
      audience: input.existingBrief.audience,
      coreMessage: input.existingBrief.coreMessage,
      coreQuestion: input.existingBrief.coreQuestion,
      background: input.existingBrief.background,
      keyPoints: strings(input.existingBrief.keyPoints),
      structure: strings(input.existingBrief.structure),
      tone: input.existingBrief.tone,
      risks: strings(input.existingBrief.risks),
      version: input.existingBrief.version,
      initializedFromMaterialAnalysis: Boolean(metadata),
      analysisUpdateAvailable: Boolean(analysis && metadata && analysis.version > metadata.materialAnalysisVersion),
    } : emptyPlan();
    const unified = parseUnified(input.unifiedAnalysisOutput);
    const suggestedStructure = unified ? [unified.structure.overallApproach, ...unified.structure.sections.map((section) => `${section.title}：${section.keyMessage}`)] : [];
    const plan: CreativePlan = {
      ...stored,
      topic: firstText(stored.topic, materialDraft?.topic),
      audience: firstText(stored.audience, materialDraft?.audience, input.project.audience),
      coreQuestion: firstText(stored.coreQuestion, materialDraft?.coreQuestion, unified?.coreQuestion.text),
      background: firstText(stored.background, materialDraft?.background, unified?.summary.text),
      coreMessage: firstText(stored.coreMessage, materialDraft?.coreMessage, unified?.coreViewpoint.text),
      keyPoints: firstList(stored.keyPoints, materialDraft?.keyPoints ?? [], unified?.keyPoints.map(({ text }) => text) ?? []),
      angle: firstText(stored.angle, unified?.angles[0]?.angle),
      structure: firstList(stored.structure, suggestedStructure),
      tone: firstText(stored.tone, unified?.expressionDirection.description),
      risks: firstList(stored.risks, unified?.riskNotes.map(({ text }) => text) ?? []),
    };
    const serializedStored = JSON.stringify({ ...stored, initializedFromMaterialAnalysis: undefined, analysisUpdateAvailable: undefined });
    const serializedPlan = JSON.stringify({ ...plan, initializedFromMaterialAnalysis: undefined, analysisUpdateAvailable: undefined });
    const origins = [
      input.existingBrief ? "User Brief" : null,
      materialDraft ? "MaterialAnalysis" : null,
      unified ? "UnifiedCreativeAnalysis" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      plan,
      storedPlan: stored,
      origins,
      autoPrefilled: serializedStored !== serializedPlan,
      titleReferences: unified?.titleReferences.map(({ title }) => title) ?? [],
      stage: input.hasMotherContent || ["WRITING", "IN_REVIEW", "APPROVED"].includes(input.project.status) ? "WRITING" as const : "PREPARING" as const,
    };
  }
}
