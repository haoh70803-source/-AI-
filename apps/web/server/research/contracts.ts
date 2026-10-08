import { z } from "zod";
import type { ResearchBlock, ResearchSource } from "@content-center/core";

const id = z.string().trim().min(1).max(200);
export const researchScopeSchema = z.object({
  materialIds: z.array(id).max(10).default([]),
  benchmarkAccountIds: z.array(id).max(3).default([]),
  trendKeys: z.array(z.string().trim().min(1).max(2000)).max(5).default([]),
  useOwnArtifacts: z.boolean().default(false),
  notes: z.string().trim().max(20000).default(""),
  useCreatorProfile: z.boolean().default(false),
  researchProfile: z.enum(["ACCOUNT_DOSSIER", "ACCOUNT_V2", "WORK_DEEP", "TOPIC_OPPORTUNITY_V2", "FOCUS_V2"]).optional(),
  benchmarkWorkId: id.optional(),
  focusWorkIds: z.array(id).max(30).optional(),
  researchDepth: z.literal("DEEP").optional(),
  forceReanalysis: z.boolean().optional(),
  benchmarkCollectionRunId: id.optional(),
  researchDateRange: z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).strict().refine(value => !value.from || !value.to || value.from <= value.to, "Invalid date range").optional(),
}).strict();
export type ResearchScope = z.infer<typeof researchScopeSchema>;
export const sessionInputSchema = z.object({ title: z.string().trim().min(1).max(200), entryTemplate: z.enum(["DIRECT", "BREAKDOWN", "OPPORTUNITY", "BENCHMARK"]).default("DIRECT"), projectId: id.optional(), requestKey: z.string().uuid() }).strict();
export const runInputSchema = z.object({ question: z.string().trim().min(1).max(10000), requestKey: z.string().uuid(), scope: researchScopeSchema.optional() }).strict();
const refs = z.array(id).max(300);
const sourceSchema: z.ZodType<ResearchSource> = z.object({
  ref: id, kind: z.enum(["MATERIAL", "BENCHMARK_ACCOUNT", "BENCHMARK_WORK", "BENCHMARK_COMMENT", "TREND", "PROJECT_ARTIFACT", "USER_INPUT", "CREATOR_PROFILE"]), objectId: id,
  title: z.string().max(500), href: z.string().max(2000).nullable(), capturedAt: z.string().nullable(), publishedAt: z.string().nullable(), eventAt: z.string().nullable(),
  contentOrigin: z.enum(["ORIGINAL", "MACHINE_TRANSCRIPT", "AI_READING", "USER_PROVIDED"]), locator: z.string().nullable(), excerpt: z.string().max(20000), version: z.string().nullable(),
}).strict();
const base = { id, title: z.string().max(300), provenance: z.enum(["REAL_DATA", "COMPUTED", "AI_INTERPRETATION"]), sourceRefs: refs, limitation: z.string().max(2000).nullable() };
export const researchBlockSchema: z.ZodType<ResearchBlock> = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text"), text: z.string().max(30000) }).strict(),
  z.object({ ...base, type: z.literal("metrics"), items: z.array(z.object({ label: z.string().max(200), value: z.number().finite().nullable(), unit: z.string().max(100), validCount: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), method: z.string().max(1000) }).strict()).max(12) }).strict(),
  z.object({ ...base, type: z.literal("table"), columns: z.array(z.string().max(200)).min(1).max(20), rows: z.array(z.object({ cells: z.array(z.union([z.string().max(5000), z.number().finite(), z.null()])).max(20), sourceRefs: refs }).strict()).max(500) }).strict(),
  ...(["bar_chart", "line_chart"] as const).map(type => z.object({ ...base, type: z.literal(type), unit: z.string().max(100), method: z.string().max(1000), points: z.array(z.object({ label: z.string().max(200), value: z.number().finite().nullable(), sourceRefs: refs }).strict()).max(500), lowerIsBetter: z.boolean() }).strict()),
  z.object({ ...base, type: z.literal("sources"), refs: z.array(sourceSchema).max(300) }).strict(),
]);
export const researchBlocksSchema = z.array(researchBlockSchema).max(60);
export const researchAnswerSchema = z.object({ sections: z.array(z.object({ title: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(8000), sourceRefs: refs.min(1), limitation: z.string().trim().min(1).max(1500) }).strict()).min(1).max(10) }).strict();

export function validateResearchAnswer(value: unknown, sources: ResearchSource[], evidenceByRef: Record<string, string>) {
  const answer = researchAnswerSchema.parse(value);
  const allowed = new Set(sources.map(source => source.ref));
  const numbers = (text: string) => text.match(/[-+]?\d+(?:[.,]\d+)*(?:[%％])?/g) ?? [];
  const normalizedNumber = (value: string) => value.replaceAll(",", "").replace("％", "%");
  for (const section of answer.sections) {
    if (section.sourceRefs.some(ref => !allowed.has(ref))) throw new Error("RESEARCH_UNKNOWN_SOURCE");
    const text = `${section.title}\n${section.text}\n${section.limitation}`;
    const cited = new Set(section.sourceRefs);
    const citedEvidence = sources.filter(source => cited.has(source.ref)).map(source => `${source.excerpt}\n${evidenceByRef[source.ref] ?? ""}`).join("\n");
    const knownNumbers = new Set(numbers(citedEvidence).map(normalizedNumber));
    if (numbers(text).some(number => !knownNumbers.has(normalizedNumber(number)))) throw new Error("RESEARCH_UNSUPPORTED_NUMBER");
    if (/(?:爆款概率|成功率|成交概率)\s*[:：是为约]?\s*\d/.test(text)) throw new Error("RESEARCH_UNSUPPORTED_PREDICTION");
  }
  return answer;
}

export function validateResearchBlocks(value: unknown, sources: ResearchSource[]) {
  const blocks = researchBlocksSchema.parse(value);
  const allowed = new Set(sources.map(source => source.ref));
  for (const block of blocks) {
    const used = [...block.sourceRefs, ...(block.type === "table" ? block.rows.flatMap(row => row.sourceRefs) : block.type === "bar_chart" || block.type === "line_chart" ? block.points.flatMap(point => point.sourceRefs) : block.type === "sources" ? block.refs.map(source => source.ref) : [])];
    if (used.some(ref => !allowed.has(ref))) throw new Error("RESEARCH_UNKNOWN_SOURCE");
    if (block.type === "table" && block.rows.some(row => row.cells.length !== block.columns.length)) throw new Error("RESEARCH_INVALID_TABLE");
    if (block.type === "metrics" && block.items.some(item => item.validCount > item.denominator || (item.validCount === 0 && item.value !== null))) throw new Error("RESEARCH_INVALID_COVERAGE");
    if ((block.type === "metrics" || block.type === "bar_chart" || block.type === "line_chart") && block.provenance === "AI_INTERPRETATION") throw new Error("RESEARCH_AI_NUMERIC_BLOCK");
    if (block.provenance === "AI_INTERPRETATION" && !block.limitation) throw new Error("RESEARCH_MISSING_LIMITATION");
  }
  return blocks;
}

export const researchSelectionSchema = z.object({ kind: z.enum(["run", "study"]), version: z.number().int().positive(), items: z.array(z.object({ id: z.string().min(1).max(200), text: z.string().trim().min(1).max(12000) }).strict()).min(1).max(30) }).strict().refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, "不能重复选择结论").refine(value => value.items.reduce((sum,item) => sum + item.text.length,0) <= 30000, "本次结论过长，请缩小范围");
