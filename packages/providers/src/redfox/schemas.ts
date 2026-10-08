import { z } from "zod";

const codeSchema = z.union([z.string(), z.number()]);

export const RedFoxParseDataSchema = z
  .object({
    awemeType: z.string(),
    platform: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    author: z.string().optional().nullable(),
    authorName: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    desc: z.string().optional().nullable(),
    coverUrl: z.string().url().optional().nullable(),
    cover: z.string().url().optional().nullable(),
    videoUrl: z.string().url().optional().nullable(),
    imageUrls: z.array(z.string().url()).optional().nullable(),
    awemeId: z.union([z.string(), z.number()]).optional().nullable(),
    requestId: z.string().optional().nullable(),
  })
  .passthrough();

export const RedFoxParseResponseSchema = z
  .object({
    code: codeSchema,
    msg: z.string().optional().nullable(),
    message: z.string().optional().nullable(),
    data: RedFoxParseDataSchema.optional().nullable(),
    requestId: z.string().optional().nullable(),
  })
  .passthrough();

export const RedFoxApiResponseSchema = z
  .object({
    code: codeSchema,
    msg: z.string().optional().nullable(),
    message: z.string().optional().nullable(),
    data: z.unknown().optional().nullable(),
    requestId: z.string().optional().nullable(),
  })
  .passthrough();

export type RedFoxParseData = z.infer<typeof RedFoxParseDataSchema>;
export type RedFoxParseResponse = z.infer<typeof RedFoxParseResponseSchema>;
