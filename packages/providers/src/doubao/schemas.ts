import { z } from "zod";

const sharedConfig = {
  baseUrl: z.string().trim().url().max(2_000),
  resourceId: z.string().trim().min(1).max(500),
  boostingTableId: z.string().trim().min(1).max(500).optional(),
  boostingTableName: z.string().trim().min(1).max(500).optional(),
};

export const doubaoRuntimeConfigSchema = z.discriminatedUnion("authMode", [
  z.object({
    ...sharedConfig,
    authMode: z.literal("API_KEY"),
    apiKey: z.string().trim().min(1).max(10_000),
  }).passthrough(),
  z.object({
    ...sharedConfig,
    authMode: z.literal("LEGACY_APP_TOKEN"),
    appId: z.string().trim().min(1).max(500),
    accessToken: z.string().trim().min(1).max(10_000),
  }).passthrough(),
]);

export type DoubaoRuntimeConfig = z.infer<typeof doubaoRuntimeConfigSchema>;

export const doubaoFlashResponseSchema = z.object({
  audio_info: z.object({
    duration: z.number().finite().nonnegative(),
  }).optional(),
  result: z.object({
    text: z.string(),
    utterances: z.array(z.object({
      start_time: z.number().finite().nonnegative(),
      end_time: z.number().finite().nonnegative(),
      text: z.string(),
    })).optional().default([]),
  }),
});

export type DoubaoFlashResponse = z.infer<typeof doubaoFlashResponseSchema>;
