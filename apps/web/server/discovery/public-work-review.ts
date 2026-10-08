import { z } from "zod";
export const publicWorkReviewSchema = z.object({
  kind: z.literal("LOCAL_ASR_REVIEW"),
  opening: z.string().max(1500), progression: z.array(z.string().max(800)).max(12),
  proof: z.string().max(1500), closing: z.string().max(1000), risk: z.string().max(1500),
  comments: z.array(z.object({ excerpt: z.string().max(500), observation: z.string().max(500) })).max(30),
  limitations: z.string().max(1500),
}).strict();
export type PublicWorkReview = z.infer<typeof publicWorkReviewSchema> & { workId: string; title: string; url: string };
