import { z } from "zod";
const refs = z.array(z.string().min(1).max(200)).min(1).max(15);
export const commentAnalysisSchema = z.object({
  summary: z.string().min(1).max(1500),
  needs: z.array(z.object({ name: z.string().min(1).max(80), explanation: z.string().min(1).max(1000), commentIds: refs }).strict()).max(8),
  ideas: z.array(z.object({ title: z.string().min(1).max(200), angle: z.string().min(1).max(600), hook: z.string().min(1).max(300), requiredOwnEvidence: z.string().min(1).max(500), commentIds: refs }).strict()).length(5),
  limitations: z.array(z.string().max(500)).min(1).max(8),
}).strict();
export type CommentAnalysis = z.infer<typeof commentAnalysisSchema>;
export const commentEvidenceSchema = z.array(z.object({ id: z.string(), text: z.string(), work: z.string(), url: z.string() }));
export function validateCommentReferences(result: CommentAnalysis, ids: Set<string>) {
  if ([...result.needs, ...result.ideas].some((item) => item.commentIds.some((id) => !ids.has(id)))) throw new Error("分析引用了本次输入之外的评论。");
  return result;
}
