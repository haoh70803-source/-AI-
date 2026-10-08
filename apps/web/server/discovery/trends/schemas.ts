import { z } from "zod";
import { externalContentSchema } from "../schemas";

export const trendWindowSchema = z.enum(["TODAY", "SEVEN_DAYS"]);
export const trendPlatformFilterSchema = z.enum(["ALL", "DOUYIN", "XIAOHONGSHU", "GLOBAL"]);
export const trendTypeFilterSchema = z.enum(["HOT", "SURGING", "DARK_HORSE"]);

export const trendQuerySchema = z.object({
  window: trendWindowSchema.default("TODAY"),
  platform: trendPlatformFilterSchema.default("ALL"),
  type: trendTypeFilterSchema.default("HOT"),
}).strict();

export const refreshTrendsSchema = trendQuerySchema.extend({
  force: z.boolean().default(false),
  keyword: z.string().trim().min(1).max(200).optional(),
}).strict();

export const candidateTopicSchema = z.object({
  title: z.string().trim().min(1).max(300),
  angle: z.string().trim().min(1).max(2_000),
  targetAudience: z.string().trim().min(1).max(1_000),
  coreConflict: z.string().trim().min(1).max(2_000),
  whyNow: z.string().trim().min(1).max(2_000),
  differenceFromSources: z.string().trim().min(1).max(2_000),
  supportingReferences: z.array(z.string().trim().min(1).max(300)).max(5),
  riskNotes: z.array(z.string().trim().min(1).max(1_000)).max(20),
  recommendedFormat: z.string().trim().max(300).nullable(),
}).strict();

export const candidateTopicsOutputSchema = z.object({
  candidates: z.array(candidateTopicSchema).min(3).max(5),
}).strict();

export const generateTopicCandidatesSchema = z.object({
  supportingContents: z.array(externalContentSchema).max(5).default([]),
}).strict();

export const saveTrendIdeaSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("MANUAL"), title: z.string().trim().min(1).max(300) }).strict(),
  z.object({ mode: z.literal("CANDIDATE"), runId: z.string().trim().min(1).max(200), selectedIndex: z.number().int().min(0).max(4) }).strict(),
]);

export type TrendWindowInput = z.infer<typeof trendWindowSchema>;
export type TrendPlatformFilter = z.infer<typeof trendPlatformFilterSchema>;
export type TrendTypeFilter = z.infer<typeof trendTypeFilterSchema>;
export type CandidateTopic = z.infer<typeof candidateTopicSchema>;
