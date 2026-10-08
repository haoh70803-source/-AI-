import { z } from "zod";
const iso = z.string().datetime({ offset: true });
const text = z.string().max(30000);
export const newsItemSchema = z.object({
  id: z.string().min(1).max(200), title: text, originalTitle: text.nullable().optional(),
  summary: text.nullable().optional(), source: z.object({ name: z.string().max(500) }),
  links: z.object({ aihot: z.string().url(), original: z.string().url().nullable() }),
  publishedAt: iso.nullable(), discoveredAt: iso,
  category: z.string().min(1).max(100).nullable(),
  attribution: z.object({ name: z.string().max(500), url: z.string().url() }),
}).passthrough();
export type NewsItem = z.infer<typeof newsItemSchema>;
export const snapshotSchema = z.object({ schemaVersion: z.literal(1), asOf: iso, cursor: z.string().min(1).max(8192), count: z.number().int().nonnegative(), hasMore: z.boolean(), nextPage: z.string().max(8192).nullable(), items: z.array(newsItemSchema).max(1000) });
export const changesSchema = z.object({ schemaVersion: z.literal(1), cursor: z.string().min(1).max(8192), count: z.number().int().nonnegative(), hasMore: z.boolean(), changes: z.array(z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove"), changedAt: iso, id: z.string().max(200) }),
  z.object({ op: z.literal("upsert"), changedAt: iso, item: newsItemSchema }),
])).max(100) });
export const dailyIndexSchema = z.object({ schemaVersion: z.literal(1), count: z.number().int().nonnegative(), items: z.array(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), generatedAt: iso, leadTitle: text.nullable(), leadParagraph: text.nullable(),
  links: z.object({ aihot: z.string().url() }), attribution: z.object({ name: text, url: z.string().url() }),
})).max(180) });
const dailyItem = z.object({ title: text, summary: text.nullable().optional(), source: z.object({ name: text }), links: z.object({ aihot: z.string().url().nullable(), original: z.string().url().nullable() }), attribution: z.object({ name: text, url: z.string().url() }), publishedAt: iso.nullable().optional() }).passthrough();
export const dailySchema = z.object({ schemaVersion: z.literal(1), report: z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), generatedAt: iso, windowStart: iso, windowEnd: iso,
  links: z.object({ aihot: z.string().url() }), attribution: z.object({ name: text, url: z.string().url() }),
  lead: z.object({ title: text, leadParagraph: text }).nullable(),
  sections: z.array(z.object({ label: text, items: z.array(dailyItem).max(200) })).max(30),
  flashes: z.array(dailyItem).max(200),
}) });
export type DailyReport = z.infer<typeof dailySchema>["report"];
export type DailyIndex = z.infer<typeof dailyIndexSchema>["items"];
export const NEWS_CATEGORIES = { "ai-models": "模型", "ai-products": "产品", industry: "行业", paper: "论文", tip: "技巧" } as const;
export const DEFAULT_CATEGORIES: NewsItem["category"][] = ["ai-models", "ai-products", "industry"];
export function singaporeDay(value: string | number | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function safePublicLink(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
