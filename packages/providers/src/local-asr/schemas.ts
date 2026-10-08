import { z } from "zod";

const modelKeySchema = z.enum(["SENSEVOICE_SMALL", "PARAFORMER_ZH", "FUN_ASR_NANO"]);

export const localAsrModelStatusSchema = z.object({
  key: modelKeySchema,
  label: z.string(),
  modelId: z.string(),
  installed: z.boolean(),
  loaded: z.boolean(),
  loadedDevices: z.array(z.string()),
  supported: z.boolean(),
  unavailableReason: z.string().nullable().optional(),
});

export const localAsrHealthSchema = z.object({
  status: z.literal("NORMAL"),
  service: z.literal("LOCAL_FUNASR"),
  hardware: z.object({
    classification: z.enum(["CPU_ONLY", "NVIDIA_CUDA_AVAILABLE", "UNKNOWN_GPU"]),
    cudaAvailable: z.boolean(),
    vramTotalMb: z.number().nullable().optional(),
    vramFreeMb: z.number().nullable().optional(),
  }).passthrough(),
  models: z.array(localAsrModelStatusSchema),
});

export const localAsrTranscriptSchema = z.object({
  language: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  fullText: z.string().trim().min(1),
  segments: z.array(z.object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    text: z.string().trim().min(1),
  })).refine((segments) => segments.every((segment) => segment.endMs >= segment.startMs)),
  model: modelKeySchema,
  modelLabel: z.string(),
  device: z.enum(["CPU", "CUDA"]),
  processingMs: z.number().int().nonnegative(),
  resources: z.record(z.string(), z.unknown()).optional(),
});

