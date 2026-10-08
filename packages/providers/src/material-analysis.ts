import { z } from "zod";

export const MATERIAL_ANALYSIS_SCHEMA_VERSION = "content-breakdown-v1" as const;

const concise = (maximum: number) => z.string().trim().min(1).max(maximum);
const looseText = (maximum: number) => z.string().trim().max(maximum);

const reusableItemSchema = z.object({ content: concise(500), whyUseful: concise(500) }).strict();
const cautionItemSchema = z.object({ content: concise(500), reason: concise(500) }).strict();

export const materialAnalysisEvidenceInputSchema = z.object({
  segmentIndex: z.number().int().nonnegative().optional(),
  quote: looseText(500).optional(),
}).strict().refine((value) => value.segmentIndex !== undefined || Boolean(value.quote), "Evidence needs a segment index or exact quote.");

const materialAnalysisEvidenceSchema = z.object({
  quote: concise(500),
  segmentIndex: z.number().int().nonnegative().optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, context) => {
  if (value.startMs !== undefined && value.endMs !== undefined && value.endMs < value.startMs) {
    context.addIssue({ code: "custom", path: ["endMs"], message: "End time must not precede start time." });
  }
});

const expressionSectionInputSchema = z.object({ summary: concise(800), evidence: z.array(materialAnalysisEvidenceInputSchema).min(1).max(8) }).strict();
const progressionInputSchema = z.object({ summary: concise(800), steps: z.array(concise(300)).max(12), evidence: z.array(materialAnalysisEvidenceInputSchema).min(1).max(8) }).strict();
const expressionInputSchema = z.object({
  audience: expressionSectionInputSchema,
  opening: expressionSectionInputSchema,
  progression: progressionInputSchema,
  support: expressionSectionInputSchema,
  emotionalOrRhetoricalShift: expressionSectionInputSchema,
  ending: expressionSectionInputSchema,
}).strict();

const methodItemInputSchema = z.object({
  title: concise(200),
  howTo: z.array(concise(500)).min(1).max(8),
  applicable: z.array(concise(300)).min(1).max(8),
  boundaries: z.array(concise(300)).min(1).max(8),
  evidence: z.array(materialAnalysisEvidenceInputSchema).min(1).max(8),
}).strict();
const methodsInputSchema = z.object({
  evidenceStatus: z.enum(["SINGLE_SOURCE_DRAFT", "INSUFFICIENT"]),
  reason: concise(500),
  items: z.array(methodItemInputSchema).max(8),
}).strict().superRefine((value, context) => {
  if (value.evidenceStatus === "INSUFFICIENT" && value.items.length > 0) {
    context.addIssue({ code: "custom", path: ["items"], message: "Insufficient evidence cannot produce method items." });
  }
  if (value.evidenceStatus === "SINGLE_SOURCE_DRAFT" && value.items.length === 0) {
    context.addIssue({ code: "custom", path: ["items"], message: "A single-source draft needs at least one method item." });
  }
});

const legacyMaterialAnalysisOutputSchema = z.object({
  whatItSays: z.object({ summary: concise(800), keyPoints: z.array(concise(500)).max(12) }).strict(),
  reusable: z.array(reusableItemSchema).max(12),
  doNotCopy: z.array(cautionItemSchema).max(12),
  uncertain: z.array(cautionItemSchema).max(12),
}).strict();

const currentMaterialAnalysisOutputSchema = z.object({
  whatItSays: z.object({ summary: concise(800), keyPoints: z.array(concise(500)).max(12), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
  expression: expressionInputSchema.extend({
    audience: z.object({ summary: concise(800), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
    opening: z.object({ summary: concise(800), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
    progression: z.object({ summary: concise(800), steps: z.array(concise(300)).max(12), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
    support: z.object({ summary: concise(800), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
    emotionalOrRhetoricalShift: z.object({ summary: concise(800), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
    ending: z.object({ summary: concise(800), evidence: z.array(materialAnalysisEvidenceSchema).max(8) }).strict(),
  }).strict(),
  methods: z.object({
    evidenceStatus: z.enum(["SINGLE_SOURCE_DRAFT", "INSUFFICIENT"]),
    reason: looseText(500),
    items: z.array(z.object({
      title: looseText(200),
      howTo: z.array(looseText(500)).max(8),
      applicable: z.array(looseText(300)).max(8),
      boundaries: z.array(looseText(300)).max(8),
      evidence: z.array(materialAnalysisEvidenceSchema).max(8),
    }).strict()).max(8),
  }).strict(),
  reusable: z.array(reusableItemSchema).max(12),
  doNotCopy: z.array(cautionItemSchema).max(12),
  uncertain: z.array(cautionItemSchema).max(12),
}).strict();

export { currentMaterialAnalysisOutputSchema };

export const materialAnalysisOutputSchema = z.union([currentMaterialAnalysisOutputSchema, legacyMaterialAnalysisOutputSchema]);
export const materialAnalysisGenerationSchema = z.object({
  whatItSays: z.object({ summary: concise(800), keyPoints: z.array(concise(500)).max(12), evidence: z.array(materialAnalysisEvidenceInputSchema).min(1).max(8) }).strict(),
  expression: expressionInputSchema,
  methods: methodsInputSchema,
  reusable: z.array(reusableItemSchema).max(12),
  doNotCopy: z.array(cautionItemSchema).max(12),
  uncertain: z.array(cautionItemSchema).max(12),
}).strict();

export type MaterialAnalysisEvidenceInput = z.infer<typeof materialAnalysisEvidenceInputSchema>;
export type MaterialAnalysisGeneration = z.infer<typeof materialAnalysisGenerationSchema>;
export type MaterialAnalysisOutput = z.infer<typeof materialAnalysisOutputSchema>;
export type CurrentMaterialAnalysisOutput = z.infer<typeof currentMaterialAnalysisOutputSchema>;

export const materialAnalysisOutputInstruction = `
Return exactly one JSON object with these fields and no additional fields:
{
  "whatItSays": { "summary": "string", "keyPoints": ["string"], "evidence": [{ "segmentIndex": 0 }] },
  "expression": {
    "audience": { "summary": "string", "evidence": [{ "segmentIndex": 0 }] },
    "opening": { "summary": "string", "evidence": [{ "segmentIndex": 0 }] },
    "progression": { "summary": "string", "steps": ["string"], "evidence": [{ "segmentIndex": 0 }] },
    "support": { "summary": "string", "evidence": [{ "segmentIndex": 0 }] },
    "emotionalOrRhetoricalShift": { "summary": "string", "evidence": [{ "segmentIndex": 0 }] },
    "ending": { "summary": "string", "evidence": [{ "segmentIndex": 0 }] }
  },
  "methods": { "evidenceStatus": "SINGLE_SOURCE_DRAFT", "reason": "string", "items": [{ "title": "string", "howTo": ["string"], "applicable": ["string"], "boundaries": ["string"], "evidence": [{ "segmentIndex": 0 }] }] },
  "reusable": [{ "content": "string", "whyUseful": "string" }],
  "doNotCopy": [{ "content": "string", "reason": "string" }],
  "uncertain": [{ "content": "string", "reason": "string" }]
}
Use segmentIndex references or exact contiguous quote text only. Never return timestamps. If evidence is insufficient for a transferable method, use INSUFFICIENT with an empty items array, while still returning expression analysis.`;
