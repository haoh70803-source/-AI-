import { z } from "zod";

export const openAICompatibleConfigSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().url().max(2_000),
  apiKey: z.string().trim().min(1).max(10_000),
  model: z.string().trim().min(1).max(200),
  capabilities: z.object({
    text: z.boolean(),
    image: z.boolean(),
    reasoning: z.boolean(),
    structuredOutput: z.boolean(),
    jsonObject: z.boolean(),
    tools: z.boolean(),
    responsesApi: z.boolean(),
  }).strict().optional(),
  chatStructuredOutput: z.enum(["JSON_SCHEMA", "JSON_OBJECT"]).optional(),
});

export type OpenAICompatibleConfig = z.infer<typeof openAICompatibleConfigSchema>;

export const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});
