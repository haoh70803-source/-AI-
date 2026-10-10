import { z } from "zod";
export const MAX_PROJECT_SKILLS = 3;
export const projectSkillVersionIdsSchema = z.array(z.string().trim().min(1).max(200)).max(MAX_PROJECT_SKILLS).transform(ids => [...new Set(ids)]);
export const creationOptionsSchema = z.object({
  task: z.enum(["AUTO", "QA", "TOPIC", "SCRIPT", "MOMENTS", "MESSAGE", "PLAN", "ANALYSIS", "EDIT"]).default("AUTO"),
  depth: z.enum(["AUTO", "BRIEF", "STANDARD", "DEEP"]).default("AUTO"),
  mode: z.enum(["AUTO", "EXPLORE", "EXECUTE"]).default("AUTO"),
  naturalness: z.enum(["AUTO", "SPOKEN", "BALANCED", "PROFESSIONAL"]).default("AUTO"),
  divergence: z.enum(["FOCUSED", "BALANCED", "WIDE"]).default("BALANCED"),
  persona: z.string().trim().max(160).default(""),
}).strict();
export type CreationOptions = z.infer<typeof creationOptionsSchema>;
export const defaultCreationOptions = creationOptionsSchema.parse({});
export const editScopeSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), expectedVersion: z.number().int().positive() }).strict().refine(v => v.end > v.start);
export type EditScope = z.infer<typeof editScopeSchema>;
