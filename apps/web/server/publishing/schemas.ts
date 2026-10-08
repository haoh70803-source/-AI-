import { z } from "zod";
import { SUPPORTED_PLATFORMS } from "../../lib/platforms";

export const publishStatuses = ["DRAFT", "SCHEDULED", "READY_TO_PUBLISH", "PUBLISHED", "FAILED", "CANCELLED"] as const;
export const publishStatusSchema = z.enum(publishStatuses);

export const publishSnapshotSchema = z.object({
  variantVersion: z.number().int().positive(),
  motherVersion: z.number().int().nonnegative(),
  title: z.string().nullable(),
  hook: z.string().nullable(),
  body: z.string(),
  summary: z.string().nullable(),
  hashtags: z.array(z.string()),
  metadata: z.unknown(),
  mediaPlan: z.unknown(),
  platform: z.enum(SUPPORTED_PLATFORMS),
  createdAt: z.string().datetime(),
});

export type PublishSnapshot = z.infer<typeof publishSnapshotSchema>;

export const createPublishTaskSchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(SUPPORTED_PLATFORMS),
  scheduledAt: z.string().datetime().nullable().optional(),
}).strict();

export const schedulePublishTaskSchema = z.object({ scheduledAt: z.string().datetime() }).strict();
export const updatePublishTaskSchema = z.object({ note: z.string().max(2_000).nullable().optional(), externalPostId: z.string().max(500).nullable().optional() }).strict();
const externalUrlSchema = z.string().url().max(2_000).refine((value) => value.startsWith("https://") || value.startsWith("http://"), "只允许 HTTP(S) 链接");
export const markPublishedSchema = z.object({
  publishedAt: z.string().datetime().optional(),
  externalUrl: externalUrlSchema.nullable().optional(),
  externalPostId: z.string().max(500).nullable().optional(),
  note: z.string().max(2_000).nullable().optional(),
}).strict();
export const taskNoteSchema = z.object({ note: z.string().max(2_000).nullable().optional() }).strict();
export const failTaskSchema = z.object({ note: z.string().trim().min(2).max(2_000) }).strict();
