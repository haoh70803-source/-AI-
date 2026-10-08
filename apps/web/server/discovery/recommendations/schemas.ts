import { z } from "zod";

export const recommendationOutputItemSchema = z.object({
  candidateId: z.string().min(1),
  title: z.string().min(1).max(300),
  coreQuestion: z.string().min(1).max(500),
  angle: z.string().min(1).max(1_000),
  whyRecommended: z.string().min(1).max(1_000),
  whyNow: z.string().min(1).max(1_000),
  creatorFit: z.string().max(1_000),
  evidenceRefs: z.array(z.string().min(1)).max(10),
  differenceFromRecentContent: z.string().max(1_000),
  suggestedNextStep: z.string().min(1).max(500),
  riskNotes: z.array(z.string().min(1).max(500)).max(10),
  recommendedFormat: z.string().min(1).max(100).nullable(),
});

export const recommendationOutputSchema = z.object({ recommendations: z.array(recommendationOutputItemSchema).min(1).max(5) });
export type RecommendationOutputItem = z.infer<typeof recommendationOutputItemSchema>;

export const recommendationActionSchema = z.object({
  action: z.enum(["DISMISS", "SAVE_IDEA", "START_RESEARCH", "START_CREATION"]),
  collectMissing: z.boolean().optional().default(false),
});
