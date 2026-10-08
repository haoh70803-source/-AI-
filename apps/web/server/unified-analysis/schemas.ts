import { z } from "zod";

export const UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION = "unified-creative-analysis-v1" as const;

const sourceIds = z.array(z.string().min(1)).max(100).default([]);
const aiInterpretation = z.object({ text: z.string().min(1).max(10_000), classification: z.literal("AI_INTERPRETATION"), sourceItemIds: sourceIds }).strict();
const suggestion = z.object({ title: z.string().min(1).max(2_000), angle: z.string().min(1).max(5_000), rationale: z.string().max(5_000), classification: z.literal("AI_SUGGESTION"), sourceItemIds: sourceIds }).strict();
const structure = z.object({
  overallApproach: z.string().max(5_000),
  classification: z.literal("AI_SUGGESTION"),
  sourceItemIds: sourceIds,
  sections: z.array(z.object({ title: z.string().min(1).max(2_000), purpose: z.string().max(5_000), keyMessage: z.string().max(10_000), supportingPoints: z.array(z.string().min(1).max(5_000)).max(20), sourceItemIds: sourceIds }).strict()).max(12),
}).strict();
const expressionDirection = z.object({ description: z.string().max(5_000), rationale: z.string().max(5_000), classification: z.literal("AI_SUGGESTION"), sourceItemIds: sourceIds }).strict();
const titleReference = z.object({ title: z.string().min(1).max(2_000), rationale: z.string().max(5_000), classification: z.literal("AI_SUGGESTION"), sourceItemIds: sourceIds }).strict();

export const unifiedCreativeAnalysisAdvisorySchema = z.object({
  creativeInterpretation: aiInterpretation,
  angles: z.array(suggestion).min(1).max(6),
  structure,
  expressionDirection,
  riskNotes: z.array(aiInterpretation).max(20),
  titleReferences: z.array(titleReference).max(10),
}).strict();

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function records(value: unknown) { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : []; }

export function normalizeUnifiedCreativeAnalysisAdvisory(value: unknown): unknown {
  const input = record(value);
  const rawInterpretation = input.creativeInterpretation ?? input.creativeUnderstanding;
  const interpretation = typeof rawInterpretation === "string" ? { text: rawInterpretation } : record(rawInterpretation);
  const rawAngles = Array.isArray(input.angles) ? input.angles : Array.isArray(input.recommendations) ? input.recommendations : [];
  const angles = rawAngles.flatMap((value, index) => {
    const item = typeof value === "string" ? { angle: value } : record(value);
    const angle = text(item.angle ?? item.recommendation ?? item.description ?? item.text);
    const title = text(item.title) || (angle ? `建议方向 ${index + 1}` : "");
    if (!angle || !title) return [];
    return [{ title, angle, rationale: text(item.rationale ?? item.reason), classification: "AI_SUGGESTION", sourceItemIds: strings(item.sourceItemIds) }];
  });
  const rawStructure = input.structure;
  const structureInput = typeof rawStructure === "string" ? { overallApproach: rawStructure } : record(rawStructure);
  const sections = records(structureInput.sections).flatMap((section) => {
    const title = text(section.title);
    if (!title) return [];
    return [{ title, purpose: text(section.purpose), keyMessage: text(section.keyMessage ?? section.message), supportingPoints: strings(section.supportingPoints), sourceItemIds: strings(section.sourceItemIds) }];
  });
  const rawExpression = input.expressionDirection;
  const expression = typeof rawExpression === "string" ? { description: rawExpression } : record(rawExpression);
  const rawRisks = input.riskNotes ?? input.risks;
  const riskNotes = (Array.isArray(rawRisks) ? rawRisks : typeof rawRisks === "string" ? [rawRisks] : []).flatMap((value) => {
    const item = typeof value === "string" ? { text: value } : record(value);
    const note = text(item.text ?? item.message);
    return note ? [{ text: note, classification: "AI_INTERPRETATION", sourceItemIds: strings(item.sourceItemIds) }] : [];
  });
  const titleReferences = (Array.isArray(input.titleReferences) ? input.titleReferences : []).flatMap((value) => {
    const item = typeof value === "string" ? { title: value } : record(value);
    const title = text(item.title);
    return title ? [{ title, rationale: text(item.rationale ?? item.reason), classification: "AI_SUGGESTION", sourceItemIds: strings(item.sourceItemIds) }] : [];
  });
  return {
    creativeInterpretation: { text: text(interpretation.text ?? interpretation.summary ?? interpretation.description), classification: "AI_INTERPRETATION", sourceItemIds: strings(interpretation.sourceItemIds) },
    angles,
    structure: { overallApproach: text(structureInput.overallApproach ?? structureInput.description), classification: "AI_SUGGESTION", sourceItemIds: strings(structureInput.sourceItemIds), sections },
    expressionDirection: { description: text(expression.description ?? expression.direction), rationale: text(expression.rationale ?? expression.reason), classification: "AI_SUGGESTION", sourceItemIds: strings(expression.sourceItemIds) },
    riskNotes,
    titleReferences,
  };
}

export const unifiedCreativeAnalysisProviderSchema = z.preprocess(normalizeUnifiedCreativeAnalysisAdvisory, unifiedCreativeAnalysisAdvisorySchema);

const sourceUnderstanding = z.object({ text: z.string().max(10_000), classification: z.enum(["SOURCE_FACT", "USER_INPUT"]), sourceItemIds: sourceIds }).strict();

export const unifiedCreativeAnalysisOutputSchema = z.object({
  schemaVersion: z.literal(UNIFIED_CREATIVE_ANALYSIS_SCHEMA_VERSION),
  summary: sourceUnderstanding,
  coreQuestion: sourceUnderstanding,
  coreViewpoint: sourceUnderstanding,
  keyPoints: z.array(sourceUnderstanding).max(100),
  creativeInterpretation: aiInterpretation,
  angles: unifiedCreativeAnalysisAdvisorySchema.shape.angles,
  structure,
  expressionDirection,
  riskNotes: z.array(aiInterpretation).max(20),
  titleReferences: z.array(titleReference).max(10),
  sourceReferences: z.array(z.object({ sourceItemId: z.string().min(1), title: z.string().nullable(), role: z.string().min(1) }).strict()).max(100),
  groundingGaps: z.array(z.literal("SOURCE_REFERENCE_GAP")).max(1),
}).strict();

export type UnifiedCreativeAnalysisAdvisory = z.infer<typeof unifiedCreativeAnalysisAdvisorySchema>;
export type UnifiedCreativeAnalysisOutput = z.infer<typeof unifiedCreativeAnalysisOutputSchema>;

export const unifiedCreativeAnalysisOutputInstruction = `
Return one concise JSON object without markdown fences.
Required:
{"creativeInterpretation":{"text":string,"sourceItemIds":string[]},"angles":[{"title":string,"angle":string,"rationale":string,"sourceItemIds":string[]}]}
Optional when useful:
{"structure":{"overallApproach":string,"sourceItemIds":string[],"sections":[{"title":string,"purpose":string,"keyMessage":string,"supportingPoints":string[],"sourceItemIds":string[]}]},"expressionDirection":{"description":string,"rationale":string,"sourceItemIds":string[]},"riskNotes":[{"text":string,"sourceItemIds":string[]}],"titleReferences":[{"title":string,"rationale":string,"sourceItemIds":string[]}]}
Keep the answer compact: 1-3 angles, up to 5 sections, up to 3 risks, and up to 5 title references. Use only sourceItemIds supplied in the context. Classification fields may be omitted; the application assigns them deterministically.`;
