import { z } from "zod";

const line = z.string().trim().min(1).max(1200);
const short = z.string().trim().min(1).max(200);
const ref = z.string().trim().min(1).max(100);
const cited = z.object({ ref, quote: z.string().trim().min(2).max(700) }).strict();
export const accountWorkDigestSchema = z.object({ ref, workId: ref, runId: ref, title: z.string().max(1000),
  publishedAt: z.string().nullable(), views: z.number().nullable(), likes: z.number().nullable(),
  topic: short.nullable(), angle: line, oneLine: line, playbook: z.array(short).max(6),
  structure: z.array(short).max(24), proofKinds: z.array(short).max(8), expression: z.array(short).max(8),
  cta: line.nullable(), strengths: z.array(short).max(6), weaknesses: z.array(short).max(6),
  citations: z.array(cited).min(1).max(24),
}).strict();
export const accountV2PatternSchema = z.object({ id: ref, name: short, kind: short, howUsed: line,
  topicContexts: z.array(short).max(8), continuation: line, proofPairing: line.nullable(),
  workRefs: z.array(ref).min(2).max(50), counterRefs: z.array(ref).max(30),
  performanceObservation: line.nullable(), recentChange: line.nullable(), transferable: line,
  limitation: line, citations: z.array(cited).min(2).max(12) }).strict();
export const accountV2AnswerSchema = z.object({
  inOneSentence: line, whatItDoes: line,
  contentMap: z.array(z.object({ direction: short, meaning: line, workRefs: z.array(ref).min(1).max(50) }).strict()).max(12),
  topicLogic: line, openingLogic: line, structureLogic: line, proofLogic: line, expressionDNA: line, ctaLogic: line,
  patterns: z.array(accountV2PatternSchema).max(18),
  counterExamples: z.array(z.object({ observation: line, workRefs: z.array(ref).min(1).max(30), whyItMatters: line }).strict()).max(8),
  highVsTypical: z.object({ observation: line, highRefs: z.array(ref).max(30), typicalRefs: z.array(ref).max(30),
    counterRefs: z.array(ref).max(30), limitation: line }).strict(),
  evolution: z.array(z.object({ dimension: short, earlier: line, later: line, earlierRefs: z.array(ref).min(1).max(30),
    laterRefs: z.array(ref).min(1).max(30), observation: line, limitation: line }).strict()).max(10),
  learn: z.array(line).max(8), doNotCopy: z.array(line).max(8),
  skillCandidates: z.array(z.object({ name: short, goal: line, whenToUse: line, inputs: z.array(short).min(1).max(10),
    steps: z.array(line).min(2).max(12), proofRequired: line, cautions: line, prohibited: line,
    testVariables: z.array(short).max(8), exampleFlow: z.array(short).min(2).max(12), patternIds: z.array(ref).min(1).max(8) }).strict()).max(6),
  researchLimits: z.array(line).min(1).max(10),
}).strict();
export const accountV2StateSchema = z.object({ schemaVersion: z.literal("account-research-v2"),
  account: z.object({ id: ref, name: z.string().max(500), platform: z.string().max(50) }).strict(),
  capturedAt: z.string(), fingerprint: z.string().length(64), collectionRunId: ref.nullable(),
  totalWorks: z.number().int().nonnegative(), readableWorks: z.number().int().nonnegative(),
  selected: z.array(accountWorkDigestSchema).max(200), deferredWorkIds: z.array(ref).max(200),
  answer: accountV2AnswerSchema.nullable(),
}).strict();
export type AccountWorkDigest = z.infer<typeof accountWorkDigestSchema>;
export type AccountV2State = z.infer<typeof accountV2StateSchema>;
export type AccountV2Answer = z.infer<typeof accountV2AnswerSchema>;
export function parseAccountV2State(coverage: unknown): AccountV2State | null {
  const value = coverage && typeof coverage === "object" && "accountV2" in coverage ? coverage.accountV2 : null;
  const parsed = accountV2StateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
