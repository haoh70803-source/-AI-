import { z } from "zod";
import { STUDIO_FACT_STATES } from "../ai/schemas";

export const benchmarkTopicInputSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("VIDEO"), sourceId: z.string().trim().min(1) }).strict(),
  z.object({ sourceType: z.literal("CREATOR_PROFILE"), sourceId: z.string().trim().min(1) }).strict(),
]);

const providerTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  angle: z.string().trim().min(1).max(500),
  why: z.string().trim().min(1).max(1_000),
  ourTake: z.string().trim().min(1).max(1_000),
  evidenceNeed: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
  evidenceHint: z.string().trim().min(1).max(500).nullable(),
}).strict();

export const benchmarkTopicsProviderSchema = z.object({
  summary: z.string().trim().min(1).max(2_000),
  topics: z.array(providerTopicSchema).min(4).max(8),
}).strict();

export const benchmarkTopicsOutputSchema = z.object({
  schemaVersion: z.literal("benchmark-inspired-topics-v1"),
  summary: z.string().trim().min(1),
  source: z.object({
    type: z.enum(["VIDEO", "CREATOR_PROFILE"]),
    id: z.string().min(1),
    label: z.string().min(1),
    basis: z.enum(["M1", "M7", "M9"]),
    sourceOwnership: z.literal("EXTERNAL"),
    materialAnalysisId: z.string().optional(),
    materialDistillationId: z.string().optional(),
    creatorProfileStudyId: z.string().optional(),
  }).strict(),
  topics: z.array(providerTopicSchema.extend({
    factState: z.enum(STUDIO_FACT_STATES),
    sourceOwnership: z.literal("EXTERNAL"),
    evidenceStatus: z.enum(["DIRECT", "HYPOTHETICAL", "NEEDS_CASE", "NEEDS_DATA"]),
  }).strict()).min(4).max(8),
  metrics: z.object({ candidateCount: z.number().int().min(4).max(8), validCount: z.number().int().min(4).max(8), filteredCount: z.number().int().nonnegative() }).strict(),
}).strict();

export type BenchmarkTopicInput = z.infer<typeof benchmarkTopicInputSchema>;
export type BenchmarkTopicsOutput = z.infer<typeof benchmarkTopicsOutputSchema>;
