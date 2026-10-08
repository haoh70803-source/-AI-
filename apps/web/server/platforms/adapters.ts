import "server-only";

import type { LLMProvider, LLMStructuredResult, ProviderResult } from "@content-center/providers";
import { z } from "zod";
import type { PlatformParameters, SupportedPlatform } from "../../lib/platforms";

export type PlatformBuildInput = {
  motherContent: { id: string; title: string; body: string; outline: string[]; version: number };
  creativeBrief: { topic: string; angle: string; audience: string; coreMessage: string; keyPoints: string[]; structure: string[]; tone: string; risks: string[] } | null;
  creatorProfile: { displayName: string; positioning: string; targetAudience: string; tone: string; preferredStyle: string; forbiddenStyle: string; personalViews: string[]; brandTerms: string[]; forbiddenTerms: string[]; hookPreferences: string[]; structurePreferences: string[]; ctaPreferences: string[]; examplePhrases: string[] } | null;
  evidence: Array<{ id: string; type: string; summary: string }>;
  parameters: PlatformParameters;
};

export type PlatformTemplateValue = { systemPrompt: string; template: string };
export type NormalizedPlatformVariant = { title: string | null; body: string; hook: string | null; summary: string | null; hashtags: string[]; mediaPlan: unknown; metadata: unknown };

export interface PlatformAdapter<T> {
  readonly platform: SupportedPlatform;
  buildContext(input: PlatformBuildInput): unknown;
  generate(provider: LLMProvider, template: PlatformTemplateValue, context: unknown): Promise<ProviderResult<LLMStructuredResult<T>>>;
  validate(value: unknown): T;
  normalize(value: T, parameters: PlatformParameters): NormalizedPlatformVariant;
}

const hashtags = z.array(z.string().min(1).max(200)).max(50);
const douyinSchema = z.object({ hook: z.string().min(1).max(2_000), title: z.string().min(1).max(2_000), body: z.string().min(1).max(100_000), hashtags, mediaPlan: z.object({ duration: z.union([z.literal(30), z.literal(60), z.literal(90)]), shotSuggestions: z.array(z.string().min(1).max(2_000)).max(50) }).strict() }).strict();
const xiaohongshuSchema = z.object({ titles: z.array(z.string().min(1).max(2_000)).length(3), body: z.string().min(1).max(200_000), hashtags, coverTitles: z.array(z.string().min(1).max(2_000)).max(10), mediaPlan: z.object({ imageIdeas: z.array(z.string().min(1).max(2_000)).max(50) }).strict() }).strict();
const momentsSchema = z.object({ variants: z.array(z.object({ type: z.enum(["SHORT", "VIEWPOINT", "STORY"]), body: z.string().min(1).max(50_000) }).strict()).length(3) }).strict().superRefine((value, context) => { if (new Set(value.variants.map(({ type }) => type)).size !== 3) context.addIssue({ code: "custom", message: "SHORT, VIEWPOINT and STORY are all required" }); });
const channelsSchema = z.object({ title: z.string().min(1).max(2_000), hook: z.string().min(1).max(2_000), body: z.string().min(1).max(100_000), description: z.string().min(1).max(5_000), hashtags }).strict();
const officialSchema = z.object({ title: z.string().min(1).max(2_000), summary: z.string().min(1).max(5_000), body: z.string().min(1).max(500_000), outline: z.array(z.string().min(1).max(5_000)).max(100) }).strict();

const outputShapes: Record<SupportedPlatform, string> = {
  DOUYIN: '{"hook":string,"title":string,"body":string,"hashtags":string[],"mediaPlan":{"duration":30|60|90,"shotSuggestions":string[]}}',
  XIAOHONGSHU: '{"titles":[string,string,string],"body":string,"hashtags":string[],"coverTitles":string[],"mediaPlan":{"imageIdeas":string[]}}',
  WECHAT_MOMENTS: '{"variants":[{"type":"SHORT","body":string},{"type":"VIEWPOINT","body":string},{"type":"STORY","body":string}]}',
  WECHAT_CHANNELS: '{"title":string,"hook":string,"body":string,"description":string,"hashtags":string[]}',
  WECHAT_OFFICIAL: '{"title":string,"summary":string,"body":string,"outline":string[]}',
};

abstract class BasePlatformAdapter<T> implements PlatformAdapter<T> {
  abstract readonly platform: SupportedPlatform;
  protected abstract readonly schema: z.ZodType<T>;
  abstract normalize(value: T, parameters: PlatformParameters): NormalizedPlatformVariant;

  buildContext(input: PlatformBuildInput) {
    return { targetPlatform: this.platform, parameters: input.parameters, motherContent: input.motherContent, creativeBrief: input.creativeBrief, creatorProfile: input.creatorProfile, evidence: input.evidence };
  }

  generate(provider: LLMProvider, template: PlatformTemplateValue, context: unknown) {
    const prompt = `Action: ADAPT_PLATFORM\nTarget: ${this.platform}\n${template.template.replaceAll("{{context}}", JSON.stringify(context, null, 2))}\nReturn exactly one JSON object matching this shape. Do not use markdown fences:\n${outputShapes[this.platform]}`;
    return provider.generateStructured({ systemPrompt: template.systemPrompt, prompt }, this.schema);
  }

  validate(value: unknown) { return this.schema.parse(value); }
}

export class DouyinPlatformAdapter extends BasePlatformAdapter<z.infer<typeof douyinSchema>> {
  readonly platform = "DOUYIN" as const;
  protected readonly schema = douyinSchema;
  normalize(value: z.infer<typeof douyinSchema>): NormalizedPlatformVariant { const output = this.validate(value); return { title: output.title, body: output.body, hook: output.hook, summary: null, hashtags: output.hashtags, mediaPlan: output.mediaPlan, metadata: {} }; }
}

export class XiaohongshuPlatformAdapter extends BasePlatformAdapter<z.infer<typeof xiaohongshuSchema>> {
  readonly platform = "XIAOHONGSHU" as const;
  protected readonly schema = xiaohongshuSchema;
  normalize(value: z.infer<typeof xiaohongshuSchema>, parameters: PlatformParameters): NormalizedPlatformVariant { const output = this.validate(value); return { title: output.titles[0]!, body: output.body, hook: null, summary: null, hashtags: output.hashtags, mediaPlan: output.mediaPlan, metadata: { titles: output.titles, coverTitles: output.coverTitles, style: parameters.style ?? "VIEWPOINT" } }; }
}

export class WeChatMomentsPlatformAdapter extends BasePlatformAdapter<z.infer<typeof momentsSchema>> {
  readonly platform = "WECHAT_MOMENTS" as const;
  protected readonly schema = momentsSchema;
  normalize(value: z.infer<typeof momentsSchema>, parameters: PlatformParameters): NormalizedPlatformVariant { const output = this.validate(value); const selectedType = parameters.variantType ?? "VIEWPOINT"; const selected = output.variants.find(({ type }) => type === selectedType) ?? output.variants.find(({ type }) => type === "VIEWPOINT")!; return { title: null, body: selected.body, hook: null, summary: null, hashtags: [], mediaPlan: {}, metadata: { variants: output.variants, selectedType } }; }
}

export class WechatChannelsPlatformAdapter extends BasePlatformAdapter<z.infer<typeof channelsSchema>> {
  readonly platform = "WECHAT_CHANNELS" as const;
  protected readonly schema = channelsSchema;
  normalize(value: z.infer<typeof channelsSchema>): NormalizedPlatformVariant { const output = this.validate(value); return { title: output.title, body: output.body, hook: output.hook, summary: output.description, hashtags: output.hashtags, mediaPlan: {}, metadata: {} }; }
}

export class WechatOfficialPlatformAdapter extends BasePlatformAdapter<z.infer<typeof officialSchema>> {
  readonly platform = "WECHAT_OFFICIAL" as const;
  protected readonly schema = officialSchema;
  normalize(value: z.infer<typeof officialSchema>): NormalizedPlatformVariant { const output = this.validate(value); return { title: output.title, body: output.body, hook: null, summary: output.summary, hashtags: [], mediaPlan: {}, metadata: { outline: output.outline } }; }
}

const adapters: Record<SupportedPlatform, PlatformAdapter<unknown>> = {
  DOUYIN: new DouyinPlatformAdapter(),
  XIAOHONGSHU: new XiaohongshuPlatformAdapter(),
  WECHAT_MOMENTS: new WeChatMomentsPlatformAdapter(),
  WECHAT_CHANNELS: new WechatChannelsPlatformAdapter(),
  WECHAT_OFFICIAL: new WechatOfficialPlatformAdapter(),
};

export function getPlatformAdapter(platform: SupportedPlatform) { return adapters[platform]; }
