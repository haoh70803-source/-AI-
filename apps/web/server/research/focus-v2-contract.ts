import { z } from "zod";
import { accountWorkDigestSchema } from "./account-v2-contract";

const line = z.string().trim().min(1).max(1600);
const short = z.string().trim().min(1).max(240);
const ref = z.string().trim().min(1).max(100);
const refs = z.array(ref).max(60);
const quote = z.object({ ref, quote: z.string().trim().min(2).max(700) }).strict();

export const focusWorkSchema = accountWorkDigestSchema.extend({ accountId: ref, accountName: z.string().max(500) }).strict();
export const focusPatternSchema = z.object({ accountId: ref, id: ref, name: short, howUsed: line,
  workRefs: refs, counterRefs: refs, limitation: line }).strict();
export const focusV2AnswerSchema = z.object({
  directAnswer: line,
  findings: z.array(z.object({ title: short, observation: line, whyItMatters: line,
    workRefs: refs.min(1), counterRefs: refs, citations: z.array(quote).min(1).max(10), limitation: line }).strict()).min(1).max(12),
  comparisons: z.array(z.object({ dimension: short, accounts: z.array(ref).min(2).max(3),
    difference: line, workRefs: refs.min(2), counterRefs: refs, limitation: line }).strict()).max(10),
  dissent: z.array(z.object({ observation: line, workRefs: refs.min(1), significance: line }).strict()).max(8),
  whatChanged: z.array(z.object({ accountId: ref, earlierRefs: refs.min(1), laterRefs: refs.min(1),
    observation: line, limitation: line }).strict()).max(8),
  transferable: z.array(z.object({ mechanism: line, applicability: line, ownProofNeeded: line,
    sourceWorkRefs: refs.min(1), testVariable: line }).strict()).max(8),
  unanswered: z.array(line).max(8), nextStudyNeeds: z.array(line).max(8),
  researchLimits: z.array(line).min(1).max(10),
}).strict();
export const focusV2StateSchema = z.object({ schemaVersion: z.literal("focus-research-v2"),
  question: z.string().trim().min(2).max(1000), capturedAt: z.string(), fingerprint: z.string().length(64),
  accounts: z.array(z.object({ id: ref, name: z.string().max(500), platform: z.string() }).strict()).min(1).max(3),
  works: z.array(focusWorkSchema).min(1).max(200), patterns: z.array(focusPatternSchema).max(60),
  deferredWorkIds: z.array(ref).max(200), totalAvailableWorks: z.number().int().nonnegative(),
  answer: focusV2AnswerSchema.nullable(),
}).strict();
export type FocusV2State = z.infer<typeof focusV2StateSchema>;
export type FocusV2Answer = z.infer<typeof focusV2AnswerSchema>;
export type FocusWork = z.infer<typeof focusWorkSchema>;
export type FocusPattern = z.infer<typeof focusPatternSchema>;
export function parseFocusV2State(coverage: unknown): FocusV2State | null {
  const value = coverage && typeof coverage === "object" && "focusV2" in coverage ? coverage.focusV2 : null;
  const parsed = focusV2StateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
