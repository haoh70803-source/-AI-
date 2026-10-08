import { z } from "zod";

const line = z.string().trim().min(1).max(1200);
const short = z.string().trim().min(1).max(200);
const ref = z.string().trim().min(1).max(100);
const refs = z.array(ref).max(30);
export const topicOpportunityV2AnswerSchema = z.object({
  trendMeaning: line, whyNow: line, whyNowLimit: line,
  speakers: z.array(z.object({ author: short, contentRefs: refs.min(1), observation: line }).strict()).max(12),
  angleClusters: z.array(z.object({ angle: short, howItIsTold: line, contentRefs: refs.min(1) }).strict()).max(12),
  crowded: z.array(z.object({ direction: line, contentRefs: refs.min(2), limitation: line }).strict()).max(8),
  underused: z.array(z.object({ possibleAngle: line, comparedWith: refs, whyUnderused: line, limitation: line }).strict()).max(8),
  businessFit: z.object({ audience: line, canSpeak: z.enum(["YES", "PARTIAL", "NO"]), reason: line,
    ownEvidenceRefs: refs, missingEvidence: z.array(line).max(8) }).strict(),
  opportunities: z.array(z.object({ topic: short, angle: line, audience: line, whyNow: line, difference: line,
    mechanism: line, ownProof: line, flow: z.array(short).min(2).max(10), testVariable: line,
    trendContentRefs: refs, ownEvidenceRefs: refs, limitation: line }).strict()).max(8),
  researchLimits: z.array(line).min(1).max(10),
}).strict();
export const topicOpportunityV2StateSchema = z.object({ schemaVersion: z.literal("topic-opportunity-v2"),
  fingerprint: z.string().length(64), capturedAt: z.string(),
  trend: z.object({ stableKey: z.string(), snapshotId: ref, title: z.string(), platform: z.string(), observedAt: z.string(),
    rank: z.number().nullable(), keyword: z.string().nullable(), observedCount: z.number().int().positive().default(1) }).strict(),
  project: z.object({ id: ref, title: z.string(), goal: z.string().nullable(), audience: z.string().nullable() }).strict(),
  related: z.array(z.object({ ref, externalId: ref, platform: z.string(), title: z.string(), authorName: z.string().nullable(),
    publishedAt: z.string().nullable(), url: z.string().nullable(), bodyExcerpt: z.string().max(2000).nullable(),
    bodyOrigin: z.enum(["TRANSCRIPT", "EXTRACTED_TEXT", "SOURCE_UNDERSTANDING"]).nullable() }).strict()).max(20),
  ownMaterials: z.array(z.object({ ref, id: ref, title: z.string(), version: z.string().nullable(), excerpt: z.string().min(1).max(4500) }).strict()).min(1).max(8),
  workMethods: z.array(z.object({ ref, workId: ref, runId: ref, title: z.string(), oneLine: line, mechanism: line, citation: line }).strict()).max(12),
  answer: topicOpportunityV2AnswerSchema.nullable(),
}).strict();
export type TopicOpportunityV2State = z.infer<typeof topicOpportunityV2StateSchema>;
export type TopicOpportunityV2Answer = z.infer<typeof topicOpportunityV2AnswerSchema>;
export function parseTopicOpportunityV2State(coverage: unknown): TopicOpportunityV2State | null {
  const value = coverage && typeof coverage === "object" && "topicOpportunityV2" in coverage ? coverage.topicOpportunityV2 : null;
  const parsed = topicOpportunityV2StateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
