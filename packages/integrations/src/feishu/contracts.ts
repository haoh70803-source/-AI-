import { z } from 'zod';

export const feishuTokenSchema = z.string().regex(/^[A-Za-z0-9]{10,100}$/);
export const feishuSpaceIdSchema = z.string().regex(/^\d{1,30}$/);
export const wikiSpaceSchema = z.object({
  space_id: feishuSpaceIdSchema,
  name: z.string(),
  description: z.string().optional(),
});
export const wikiNodeSchema = z.object({
  space_id: feishuSpaceIdSchema.optional(),
  node_token: feishuTokenSchema,
  parent_node_token: z.union([feishuTokenSchema, z.literal('')]).optional(),
  obj_token: feishuTokenSchema,
  obj_type: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  title: z.string(),
  has_child: z.boolean(),
  node_type: z.string().optional(),
});
export const docxBlockSchema = z.object({
  block_id: feishuTokenSchema,
  parent_id: z.string().optional(),
  block_type: z.number().int().positive(),
  children: z.array(feishuTokenSchema).optional(),
}).passthrough();

export type WikiSpace = z.infer<typeof wikiSpaceSchema>;
export type WikiNode = z.infer<typeof wikiNodeSchema>;
export type DocxBlock = z.infer<typeof docxBlockSchema>;
export type FeishuPage<T> = { items: T[]; hasMore: boolean; pageToken: string | null };
export type DocxSection = { blockId: string; type: number; headingPath: string[]; text: string };
export type ParsedDocx = {
  text: string;
  sections: DocxSection[];
  coverage: 'COMPLETE' | 'PARTIAL';
  warnings: string[];
  unsupportedBlockIds: string[];
};

// Admin-only discovery input. It never accepts arbitrary upstream URLs or credentials.
const pageToken = z.string().min(1).max(4096).optional();
export const feishuBrowseInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('spaces'), pageToken }).strict(),
  z.object({ action: z.literal('nodes'), spaceId: feishuSpaceIdSchema, parentToken: feishuTokenSchema.optional(), pageToken }).strict(),
  z.object({ action: z.literal('document'), nodeToken: feishuTokenSchema }).strict(),
  z.object({ action: z.literal('resolve'), url: z.string().trim().min(1).max(2048) }).strict(),
]);
