import { z } from "zod";

export const discoveryPlatformSchema = z.enum(["DOUYIN", "XIAOHONGSHU"]);
export const discoverySortSchema = z.enum(["RECOMMENDED", "LATEST", "POPULAR"]);

const nullableNumber = z.number().finite().nullable();
const nullableUrl = z.string().url().max(2_000).nullable();

export const externalContentSchema = z.object({
  externalId: z.string().trim().min(1).max(300),
  platform: discoveryPlatformSchema,
  contentType: z.enum(["VIDEO", "IMAGE", "ARTICLE", "UNKNOWN"]),
  title: z.string().trim().max(500).nullable(),
  description: z.string().trim().max(5_000).nullable(),
  authorId: z.string().trim().max(300).nullable(),
  authorName: z.string().trim().max(300).nullable(),
  authorAvatarUrl: nullableUrl,
  coverUrl: nullableUrl,
  originalUrl: z.string().url().max(2_000),
  publishedAt: z.string().datetime().nullable(),
  metrics: z.object({ views: nullableNumber, likes: nullableNumber, comments: nullableNumber, shares: nullableNumber, favorites: nullableNumber }),
  durationMs: nullableNumber,
  sourceProvider: z.literal("REDFOX"),
}).strict();

export const externalAccountSchema = z.object({
  externalId: z.string().trim().min(1).max(300),
  platform: discoveryPlatformSchema,
  name: z.string().trim().min(1).max(300),
  avatarUrl: nullableUrl,
  bio: z.string().trim().max(2_000).nullable(),
  followers: nullableNumber,
  likes: nullableNumber,
  originalUrl: nullableUrl,
  sourceProvider: z.literal("REDFOX"),
}).strict();

export const searchDiscoverySchema = z.object({
  query: z.string().trim().min(1).max(300),
  platform: z.enum(["ALL", "DOUYIN", "XIAOHONGSHU"]).default("ALL"),
  sort: discoverySortSchema.default("RECOMMENDED"),
  kind: z.enum(["AUTO", "CONTENT", "ACCOUNT"]).default("AUTO"),
}).strict();

export const collectExternalContentSchema = z.object({ content: externalContentSchema }).strict();
export const createProjectFromContentSchema = z.object({ content: externalContentSchema }).strict();
export const addBenchmarkSchema = z.object({ account: z.union([externalAccountSchema, externalAccountSchema.extend({ sourceProvider: z.literal("MANUAL"), originalUrl: z.string().url().max(2000).refine(url => url.startsWith("https://"), "原主页请填写 HTTPS 地址。").nullable() })]), purpose: z.string().trim().max(2000).optional() }).strict();
export const createIdeaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2_000).optional(),
  reference: externalContentSchema.optional(),
  sourceItemId: z.string().trim().min(1).optional(),
}).strict();
export const addIdeaReferenceSchema = z.object({ reference: externalContentSchema }).strict();
export const updateIdeaSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  status: z.enum(["INBOX", "READY", "IN_PROGRESS", "DONE", "ARCHIVED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
export const startIdeaSchema = z.object({ collectMissing: z.boolean().default(false) }).strict();

export type ExternalContentInput = z.infer<typeof externalContentSchema>;
export type ExternalAccountInput = z.infer<typeof externalAccountSchema>;
