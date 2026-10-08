import { z } from "zod";

const line = z.string().trim().min(1).max(1200);
const short = z.string().trim().min(1).max(200);
const maybe = line.nullable().default(null);
export const workResearchCitationSchema = z.object({ ref: z.enum(["W1", "M1"]), quote: z.string().trim().min(2).max(700) }).strict();

export const workEvidenceSchema = z.object({
  schemaVersion: z.literal("work-evidence-v1"), fingerprint: z.string().length(64), capturedAt: z.string(),
  accountId: z.string(), workId: z.string(), sourceItemId: z.string().nullable(), mediaAssetId: z.string().nullable(),
  title: z.string(), url: z.string().nullable(), publishedAt: z.string().nullable(), observedAt: z.string(),
  metrics: z.object({ views: z.number().nullable(), likes: z.number().nullable(), comments: z.number().nullable(), favorites: z.number().nullable(), shares: z.number().nullable() }).strict(),
  durationMs: z.number().nullable(), contentText: z.string(), contentLength: z.number().int().nonnegative(), contentHash: z.string().length(64).nullable(),
  contentVersion: z.string().nullable(), contentOrigin: z.enum(["TRANSCRIPT", "EXTRACTED_TEXT", "SOURCE_UNDERSTANDING"]).nullable(),
  segments: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(), text: z.string().min(1) }).strict()),
  truncated: z.boolean(),
}).strict();

export const workDeepAnswerSchema = z.object({
  understanding: z.object({ about: line, audience: maybe, situation: maybe, problem: maybe, beliefChange: maybe, promise: maybe, coreClaim: maybe, desiredOutcome: maybe, citation: workResearchCitationSchema }).strict(),
  topicIdea: z.object({ domain: maybe, theme: maybe, audience: maybe, problem: maybe, situation: maybe, angle: maybe, promise: maybe, informationGap: maybe, intent: maybe, whyThisTopic: line, citation: workResearchCitationSchema }).strict(),
  structureBlocks: z.array(z.object({ order: z.number().int().nonnegative(), startMs: z.number().int().nonnegative().nullable(), endMs: z.number().int().nonnegative().nullable(), role: short, content: line, purpose: line, expression: maybe, citation: workResearchCitationSchema }).strict()).min(1).max(24),
  mechanisms: z.array(z.object({ kind: z.enum(["ATTENTION", "PROOF", "EXPRESSION", "OTHER"]), name: short, description: line, claim: maybe, proof: maybe, hypothesis: line, limitation: line, citation: workResearchCitationSchema }).strict()).max(18),
  transferable: z.object({ principle: line, why: line, surfaceElements: z.array(short).max(8), applicability: line, ownEvidenceNeeded: line, steps: z.array(line).min(2).max(10), testVariable: line, limitation: line, citation: workResearchCitationSchema }).strict(),
  summary: line, limitations: z.array(line).min(1).max(8),
}).strict();

const citedFinding = z.object({ finding: line, whyItMatters: line, citation: workResearchCitationSchema }).strict();
/** A decision layer, kept beside the detailed V1 reading for old consumers. */
export const workDecisionSchema = z.object({
  executiveSummary: z.object({ oneLine: line, topicDecision: line, corePlaybook: z.array(short).min(1).max(6) }).strict(),
  topicLogic: z.object({ surfaceProblem: maybe, deeperStakes: maybe, angle: line, whyThisAngle: line, reframe: maybe,
    contentIntent: maybe, businessIntent: maybe, citation: workResearchCitationSchema }).strict(),
  audienceRoles: z.array(z.object({ role: short, relation: z.enum(["VIEWER", "DECIDER", "EXECUTOR", "AFFECTED", "OTHER"]), need: line, citation: workResearchCitationSchema }).strict()).max(8),
  painLadder: z.array(z.object({ step: line, consequence: maybe, citation: workResearchCitationSchema }).strict()).max(8),
  packaging: z.object({ titlePromise: maybe, opening: maybe, clickReason: maybe, coverOrVisual: maybe, citation: workResearchCitationSchema }).strict(),
  promisePayoff: z.object({ promised: maybe, delivered: maybe, gap: maybe, assessment: z.enum(["FULFILLED", "PARTIAL", "UNFULFILLED", "UNKNOWN"]), citation: workResearchCitationSchema }).strict(),
  audienceJourney: z.array(z.object({ afterBlock: z.number().int().positive(), before: line, trigger: line, after: line, citation: workResearchCitationSchema }).strict()).max(16),
  informationRelease: z.array(z.object({ atBlock: z.number().int().positive(), move: z.enum(["QUESTION", "ANSWER", "DEFER", "REPEAT", "NEW_INFORMATION"]), effect: line, citation: workResearchCitationSchema }).strict()).max(20),
  claims: z.array(z.object({ claim: line, proofKind: z.enum(["NONE", "ORAL", "DEMO", "DATA", "CASE", "FEEDBACK", "VISUAL", "OTHER"]),
    offeredProof: maybe, verifiedExternally: z.boolean(), citation: workResearchCitationSchema }).strict()).max(12),
  expressionPatterns: z.array(citedFinding).max(8),
  ctaAnalysis: z.object({ action: maybe, preparation: maybe, readiness: z.enum(["BUILT", "ABRUPT", "ABSENT", "UNCLEAR"]), friction: maybe, citation: workResearchCitationSchema }).strict(),
  strengths: z.array(citedFinding).max(6), weaknesses: z.array(citedFinding).max(6),
  testVariables: z.array(z.object({ variable: short, alternative: line, reason: line }).strict()).max(8),
  creationBlueprint: z.object({ audience: maybe, pain: maybe, stakes: maybe, angle: line, promise: maybe, reframe: maybe,
    objection: maybe, proofNeeded: line, flow: z.array(short).min(2).max(12), expression: maybe, cta: maybe }).strict(),
  displayCorrections: z.array(z.object({ original: short, display: short, reason: line, citation: workResearchCitationSchema }).strict()).max(8),
  researchLimits: z.array(line).max(8),
}).strict();

export const workDeepAnswerV2Schema = workDeepAnswerSchema.extend({
  structureBlocks: z.array(workDeepAnswerSchema.shape.structureBlocks.element.extend({
    contentDecision: line, audienceState: maybe, nextQuestion: maybe,
    valueContribution: z.enum(["NEW_INFORMATION", "NEW_VIEW", "NEW_PROOF", "NEW_SCENE", "NEW_ACTION", "EMPHASIS", "REPETITION"]),
  }).strict()).min(1).max(24),
  decision: workDecisionSchema,
}).strict();
export const workDecisionPassSchema = workDecisionSchema;
export const workResearchStateSchema = z.discriminatedUnion("schemaVersion", [
  z.object({ schemaVersion: z.literal("work-research-v1"), depth: z.literal("DEEP"), evidence: workEvidenceSchema, answer: workDeepAnswerSchema.nullable() }).strict(),
  z.object({ schemaVersion: z.literal("work-research-v2"), depth: z.literal("DEEP"), evidence: workEvidenceSchema,
    baseAnswer: workDeepAnswerSchema.nullable().default(null), answer: workDeepAnswerV2Schema.nullable() }).strict(),
]);

export type WorkEvidence = z.infer<typeof workEvidenceSchema>;
export type WorkDeepAnswer = z.infer<typeof workDeepAnswerSchema>;
export type WorkDeepAnswerV2 = z.infer<typeof workDeepAnswerV2Schema>;
export type WorkResearchState = z.infer<typeof workResearchStateSchema>;
export function parseWorkResearchState(coverage: unknown): WorkResearchState | null {
  const value = coverage && typeof coverage === "object" && "workResearch" in coverage ? coverage.workResearch : null;
  const parsed = workResearchStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
