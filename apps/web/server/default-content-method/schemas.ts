import { z } from "zod";

export const DEFAULT_CONTENT_METHOD_KIND = "WORKSPACE_DEFAULT_CONTENT_METHOD";
export const DEFAULT_CONTENT_METHOD_SCHEMA_VERSION = "workspace-default-content-method-v1";

export const defaultContentMethodSectionCodes = ["AUDIENCE", "TOPIC", "OPENING", "BODY", "EVIDENCE", "ENDING", "BOUNDARY"] as const;
export const defaultContentMethodSectionCodeSchema = z.enum(defaultContentMethodSectionCodes);
export const defaultContentMethodSourceTypeSchema = z.enum(["OWN_FACT", "OWN_EXPERIENCE", "CREATION_FEEDBACK", "SAVED_METHOD", "MULTI_BENCHMARK_REFERENCE", "SINGLE_BENCHMARK_REFERENCE"]);

const text = (maximum: number) => z.string().trim().min(1).max(maximum);

export const defaultContentMethodSourceSchema = z.object({
  type: defaultContentMethodSourceTypeSchema,
  referenceId: text(200),
  label: text(200),
}).strict();

export const defaultContentMethodGuidelineSchema = z.object({
  text: text(500),
  sourceRefs: z.array(defaultContentMethodSourceSchema).max(20),
}).strict();

export const defaultContentMethodSectionSchema = z.object({
  code: defaultContentMethodSectionCodeSchema,
  items: z.array(defaultContentMethodGuidelineSchema).max(8),
}).strict();

export const defaultContentMethodSectionsSchema = z.array(defaultContentMethodSectionSchema).length(defaultContentMethodSectionCodes.length).superRefine((sections, context) => {
  const codes = sections.map(({ code }) => code);
  if (new Set(codes).size !== defaultContentMethodSectionCodes.length || defaultContentMethodSectionCodes.some((code) => !codes.includes(code))) context.addIssue({ code: "custom", message: "必须包含七个不重复的创作指南部分。" });
});

export const defaultContentMethodPayloadSchema = z.object({
  kind: z.literal(DEFAULT_CONTENT_METHOD_KIND),
  schemaVersion: z.literal(DEFAULT_CONTENT_METHOD_SCHEMA_VERSION),
  publicationStatus: z.enum(["DRAFT", "PUBLISHED"]),
  origin: z.enum(["HUMAN", "AI_SUGGESTION"]),
  createdFromVersion: z.number().int().positive().nullable(),
  publishedAt: z.string().datetime().nullable(),
  publishedById: z.string().trim().min(1).max(200).nullable(),
  sections: defaultContentMethodSectionsSchema,
}).strict();

export type DefaultContentMethodPayload = z.infer<typeof defaultContentMethodPayloadSchema>;
export type DefaultContentMethodSection = z.infer<typeof defaultContentMethodSectionSchema>;

export const defaultContentMethodMinimumItems: Record<DefaultContentMethodSection["code"], number> = {
  AUDIENCE: 1,
  TOPIC: 2,
  OPENING: 1,
  BODY: 2,
  EVIDENCE: 2,
  ENDING: 1,
  BOUNDARY: 2,
};

export function getDefaultContentMethodReadiness(sections: DefaultContentMethodSection[]) {
  const missingSections = defaultContentMethodSectionCodes.filter((code) => {
    const section = sections.find((item) => item.code === code);
    return !section || section.items.length < defaultContentMethodMinimumItems[code] || section.items.some((item) => item.sourceRefs.length === 0);
  });
  return { readyToPublish: missingSections.length === 0, missingSections };
}

export function emptyDefaultContentMethodSections(): DefaultContentMethodSection[] {
  return defaultContentMethodSectionCodes.map((code) => ({ code, items: [] }));
}

export function parseDefaultContentMethodPayload(value: unknown) {
  return defaultContentMethodPayloadSchema.safeParse(value);
}

export function isDefaultContentMethodPayload(value: unknown) {
  return parseDefaultContentMethodPayload(value).success;
}
