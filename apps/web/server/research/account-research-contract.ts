import { z } from "zod";

const ref = z.string().trim().min(1).max(100);
const text = z.string().trim().min(1).max(1600);
const short = z.string().trim().min(1).max(200);
export const accountCitationSchema = z.object({ ref, quote: z.string().trim().min(2).max(700) }).strict();
const citations = z.array(accountCitationSchema).min(1).max(12);
const optionalText = text.nullable().default(null);
export const accountWorkAnalysisSchema = z.object({
  ref, basis: z.enum(["TEXT", "TITLE"]), topic: z.string().trim().min(1).max(60),
  audienceTask: optionalText, promise: optionalText, titlePattern: short,
  opening: optionalText, progression: z.array(short).max(7), viewpoint: optionalText,
  conflict: optionalText, examples: optionalText, evidenceStyle: optionalText,
  turn: optionalText, ending: optionalText, cta: optionalText, density: optionalText,
  citations, limitation: text,
}).strict();
export const accountFindingSchema = z.object({
  id: ref, category: z.enum(["IDENTITY", "AUDIENCE", "PROMISE", "THEME", "STRUCTURE", "HOOK", "TITLE", "CTA", "EVIDENCE"]),
  title: short, statement: text, basis: z.enum(["TEXT", "TITLE", "METADATA", "MIXED"]),
  citations, counterRefs: z.array(ref).max(12), limitation: text,
}).strict();
export const accountComparisonSchema = z.object({
  basis: z.enum(["TEXT", "TITLE", "METADATA", "MIXED"]),
  dimension: z.enum(["TOPIC", "TITLE", "OPENING", "STRUCTURE", "EXAMPLES", "LENGTH", "CTA"]), observation: text, highRefs: z.array(ref).min(1).max(12),
  typicalRefs: z.array(ref).min(1).max(12), counterRefs: z.array(ref).max(12), citations, limitation: text,
}).strict();
export const accountTemplateSchema = z.object({
  name: short, basis: z.enum(["TEXT", "TITLE"]), whenToUse: text,
  steps: z.array(z.object({ slot: short, purpose: text }).strict()).min(2).max(7),
  requiredOwnEvidence: text, doNotCopy: text, citations, counterRefs: z.array(ref).max(12), limitation: text,
}).strict();
export const accountReviewSchema = z.object({
  status: z.enum(["NEW", "STRENGTHENED", "WEAKENED", "UNSUPPORTED", "UNCHANGED"]),
  previousFindingId: ref.nullable(), title: short, explanation: text,
  refs: z.array(ref).max(12),
}).strict();
export const accountResearchAnswerSchema = z.object({
  summary: text,
  workAnalyses: z.array(accountWorkAnalysisSchema).max(30),
  findings: z.array(accountFindingSchema).min(1).max(10),
  comparisons: z.array(accountComparisonSchema).max(5),
  recentChanges: z.array(z.object({ dimension: z.enum(["TOPIC", "TITLE", "OPENING", "STRUCTURE", "LENGTH", "SCHEDULE", "PERFORMANCE"]), basis: z.enum(["TEXT", "TITLE", "METADATA", "MIXED"]), title: short, observation: text, recentRefs: z.array(ref).min(1).max(10), previousRefs: z.array(ref).min(1).max(10), citations, limitation: text }).strict()).max(4),
  templates: z.array(accountTemplateSchema).max(4),
  takeaways: z.array(z.object({ kind: z.enum(["LEARN", "DO_NOT_COPY", "TEST", "INSUFFICIENT"]), basis: z.enum(["TEXT", "TITLE", "METADATA", "MIXED"]), title: short, statement: text, citations, limitation: text }).strict()).min(1).max(8),
  commentInsights: z.array(z.object({ kind: z.enum(["QUESTION", "NEED", "DISPUTE", "THEME"]), title: short, statement: text, citations, limitation: text }).strict()).max(6),
  reviews: z.array(accountReviewSchema).max(20),
  unchanged: z.boolean(),
  limitations: z.array(text).min(1).max(10),
}).strict();

const metric = z.number().finite().nonnegative().nullable();
export const accountEvidenceWorkSchema = z.object({
  id: ref, ref, sourceItemId: ref.nullable(), title: z.string().max(1000), url: z.string().max(4000).nullable(),
  publishedAt: z.string().nullable(), observedAt: z.string(), metadataHash: ref,
  metrics: z.object({ views: metric, likes: metric, comments: metric, favorites: metric, shares: metric }).strict(),
  durationMs: metric, bodyHash: ref.nullable(), bodyText: z.string().max(8000),
  bodyLength: z.number().int().nonnegative(), contentOrigin: z.enum(["ORIGINAL", "MACHINE_TRANSCRIPT", "AI_READING"]),
  contentVersion: z.string().max(500).nullable(), hasTimecodes: z.boolean(),
}).strict();
export const accountEvidenceSchema = z.object({
  schemaVersion: z.literal("account-evidence-v1"),
  account: z.object({ id: ref, name: z.string().max(500), platform: z.string().max(50) }).strict(),
  capturedAt: z.string(), fingerprint: ref,
  collectionRunId: ref.nullable(), from: z.string().nullable(), to: z.string().nullable(),
  totalWorks: z.number().int().nonnegative(), limited: z.boolean(),
  works: z.array(accountEvidenceWorkSchema).max(200),
  comments: z.array(z.object({ id: ref, ref, workRef: ref, text: z.string().max(1600), likes: metric, postedAt: z.string().nullable(), hash: ref }).strict()).max(40),
  totalComments: z.number().int().nonnegative(),
}).strict();
export const accountEvidenceDeltaSchema = z.object({
  added: z.array(ref), updatedText: z.array(ref), updatedMetadata: z.array(ref), removed: z.array(ref),
  addedComments: z.array(ref), changedComments: z.array(ref), removedComments: z.array(ref),
  previousTextCount: z.number().int().nonnegative(), currentTextCount: z.number().int().nonnegative(),
}).strict();
export const accountResearchStateSchema = z.object({
  schemaVersion: z.literal("account-research-v1"),
  evidence: accountEvidenceSchema,
  delta: accountEvidenceDeltaSchema,
  previousRunId: ref.nullable(),
  analyzedRefs: z.array(ref), reusedRefs: z.array(ref), pendingRefs: z.array(ref),
  workAnalyses: z.array(accountWorkAnalysisSchema).max(200),
  answer: accountResearchAnswerSchema.nullable(),
}).strict();
export type AccountEvidence = z.infer<typeof accountEvidenceSchema>;
export type AccountEvidenceWork = z.infer<typeof accountEvidenceWorkSchema>;
export type AccountWorkAnalysis = z.infer<typeof accountWorkAnalysisSchema>;
export type AccountResearchAnswer = z.infer<typeof accountResearchAnswerSchema>;
export type AccountResearchState = z.infer<typeof accountResearchStateSchema>;
export function parseAccountResearchState(coverage: unknown): AccountResearchState | null {
  const value = coverage && typeof coverage === "object" && "accountResearch" in coverage ? coverage.accountResearch : null;
  const parsed = accountResearchStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
