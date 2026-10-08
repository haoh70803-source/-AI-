import { z } from "zod";

export const qualitySeveritySchema = z.enum(["INFO", "WARNING", "ERROR"]);
export const qualitySourceSchema = z.enum(["RULE", "AI"]);

export const qualityIssueSchema = z.object({
  code: z.string().min(1).max(100),
  severity: qualitySeveritySchema,
  message: z.string().min(1).max(5_000),
  field: z.string().min(1).max(100),
  source: qualitySourceSchema,
  suggestion: z.string().max(5_000).default(""),
}).strict();

export const qualityIssuesSchema = z.array(qualityIssueSchema).max(200);

export const aiReviewOutputSchema = z.object({
  summary: z.string().min(1).max(10_000),
  issues: z.array(z.object({
    code: z.string().min(1).max(100),
    severity: qualitySeveritySchema,
    message: z.string().min(1).max(5_000),
    field: z.string().min(1).max(100),
    suggestion: z.string().max(5_000),
  }).strict()).max(100),
  suggestions: z.array(z.string().min(1).max(5_000)).max(100),
}).strict();

export type QualityIssue = z.infer<typeof qualityIssueSchema>;
export type AIReviewOutput = z.infer<typeof aiReviewOutputSchema>;

export const aiReviewOutputInstruction = `
Return exactly one JSON object matching this shape. Do not use markdown fences:
{
  "summary": string,
  "issues": [{"code": string, "severity": "INFO|WARNING|ERROR", "message": string, "field": string, "suggestion": string}],
  "suggestions": string[]
}
Do not return an approval or rejection decision.`;
