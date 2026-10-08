import { z } from "zod";

export const AI_ACTIONS = ["ANALYZE_SOURCES", "EXTRACT_EVIDENCE", "GENERATE_ANGLES", "GENERATE_BRIEF", "GENERATE_MOTHER_CONTENT", "REWRITE_SELECTION", "SHORTEN", "EXPAND", "ADD_PERSONAL_VIEW", "HUMANIZE"] as const;
export type AIAction = (typeof AI_ACTIONS)[number];

export const STUDIO_QUICK_ACTIONS = ["TOPIC_IDEAS", "REWRITE_OPENING", "REWRITE_BODY", "ADD_CASE", "STRENGTHEN_EVIDENCE", "HUMANIZE_TEXT", "SHORTEN_TEXT", "ALTERNATIVE_EXPRESSION", "FACT_CHECK", "DEFAULT_METHOD_OPTIMIZE"] as const;
export type StudioQuickAction = (typeof STUDIO_QUICK_ACTIONS)[number];
export const studioQuickActionSchema = z.enum(STUDIO_QUICK_ACTIONS);
export type StudioActionRecommendation = { action: StudioQuickAction; label: string; instruction?: string };

export function recommendStudioQuickActions(state: { hasTopic: boolean; hasDraft: boolean; hasOwnEvidence: boolean }): StudioActionRecommendation[] {
  if (!state.hasDraft) return [
    { action: "TOPIC_IDEAS", label: "从客户问题找题", instruction: "优先从目标客户正在面对的具体问题寻找选题" },
    { action: "TOPIC_IDEAS", label: "看几个不同角度", instruction: "给出问题、观点、反常识、场景等不同角度，不要使用同一种结构" },
    { action: "TOPIC_IDEAS", label: "更有冲突一点", instruction: "保持事实边界，用观点差异或真实处境增加冲突感" },
    { action: "TOPIC_IDEAS", label: "更偏老板观点", instruction: "从经营负责人的判断和决策角度寻找选题" },
    { action: "TOPIC_IDEAS", label: state.hasTopic ? "换一组选题" : "用当前资料找题", instruction: "只使用当前统一创作上下文寻找新的选题方向" },
  ];
  if (!state.hasOwnEvidence) return [
    { action: "REWRITE_OPENING", label: "改开头" },
    { action: "HUMANIZE_TEXT", label: "更像本人说话" },
    { action: "REWRITE_BODY", label: "先写观点版", instruction: "当前没有可用我方案例，只写观点、判断和建议，不虚构经历或结果" },
    { action: "TOPIC_IDEAS", label: "换个不用数据的角度", instruction: "给出不依赖我方数字或案例的观点型、场景型选题" },
    { action: "STRENGTHEN_EVIDENCE", label: "补真实证据" },
    { action: "FACT_CHECK", label: "检查事实风险" },
  ];
  return [
    { action: "REWRITE_OPENING", label: "改开头" },
    { action: "HUMANIZE_TEXT", label: "更像本人说话" },
    { action: "STRENGTHEN_EVIDENCE", label: "加强证据" },
    { action: "SHORTEN_TEXT", label: "精简一点" },
    { action: "FACT_CHECK", label: "检查事实风险" },
    { action: "DEFAULT_METHOD_OPTIMIZE", label: "按鑫世界方法检查" },
  ];
}
export const studioQuickActionSections: Record<StudioQuickAction, Array<"AUDIENCE" | "TOPIC" | "OPENING" | "BODY" | "EVIDENCE" | "ENDING" | "BOUNDARY">> = {
  TOPIC_IDEAS: ["AUDIENCE", "TOPIC", "BOUNDARY"],
  REWRITE_OPENING: ["AUDIENCE", "OPENING", "BOUNDARY"],
  REWRITE_BODY: ["BODY", "EVIDENCE", "BOUNDARY"],
  ADD_CASE: ["EVIDENCE", "BOUNDARY"],
  STRENGTHEN_EVIDENCE: ["EVIDENCE", "BOUNDARY"],
  HUMANIZE_TEXT: ["BODY", "BOUNDARY"],
  SHORTEN_TEXT: ["BODY", "ENDING", "BOUNDARY"],
  ALTERNATIVE_EXPRESSION: ["BODY", "BOUNDARY"],
  FACT_CHECK: ["EVIDENCE", "BOUNDARY"],
  DEFAULT_METHOD_OPTIMIZE: ["BODY", "EVIDENCE", "ENDING", "BOUNDARY"],
};

export const STUDIO_FACT_STATES = ["CONFIRMED_OWN_FACT", "EXTERNAL_FACT", "HYPOTHETICAL", "CREATIVE_EXPRESSION", "UNVERIFIED_JUDGMENT"] as const;
export type StudioFactState = (typeof STUDIO_FACT_STATES)[number];
const studioFactStateSchema = z.enum(STUDIO_FACT_STATES);
const quickTextSuggestionSchema = z.object({ title: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(20_000) }).strict();
const quickSuggestionSchema = quickTextSuggestionSchema.extend({ factState: studioFactStateSchema.optional() }).strict();
export const rewriteOpeningProviderSchema = z.object({
  summary: z.string().trim().min(1).max(2_000),
  suggestions: z.array(quickTextSuggestionSchema).min(2).max(5),
}).strict();
const quickRiskSchema = z.object({ text: z.string().trim().min(1).max(2_000), handling: z.string().trim().min(1).max(2_000) }).strict();
export const studioQuickActionOutputSchema = z.object({
  original: z.string().max(1_000_000),
  summary: z.string().trim().min(1).max(2_000),
  suggestions: z.array(quickSuggestionSchema).max(5),
  replacement: z.string().trim().min(1).max(1_000_000).nullable(),
  replacementFactState: studioFactStateSchema.nullable().optional(),
  risks: z.array(quickRiskSchema).max(20),
  factSafety: z.object({ removedSuggestions: z.number().int().nonnegative(), blockedReplacement: z.boolean() }).strict().optional(),
}).strict();

const ids = z.array(z.string().min(1)).max(100).default([]);
const insight = z.object({ text: z.string().min(1).max(10_000), evidenceIds: ids, sourceItemIds: ids }).strict();
export const analyzeSourcesSchema = z.object({ topics: z.array(z.string()).max(100), coreClaims: z.array(insight).max(100), facts: z.array(insight).max(100), cases: z.array(insight).max(100), questions: z.array(z.string()).max(100), hooks: z.array(z.string()).max(100), structures: z.array(z.string()).max(100), risks: z.array(z.string()).max(100), reusableInsights: z.array(insight).max(100) }).strict();
export const evidencePreviewSchema = z.object({ items: z.array(z.object({ type: z.enum(["FACT", "VIEWPOINT", "CASE", "DATA", "QUOTE", "EXPERIENCE", "QUESTION", "OTHER"]), excerpt: z.string().max(20_000).default(""), claim: z.string().max(5_000).default(""), note: z.string().max(5_000).default(""), sourceItemId: z.string().nullable().default(null) }).strict()).min(1).max(50) }).strict();
export const anglesSchema = z.object({ angles: z.array(z.object({ title: z.string().min(1).max(2_000), angle: z.string().min(1).max(5_000), coreMessage: z.string().min(1).max(10_000), whyItWorks: z.string().max(5_000), targetAudience: z.string().max(2_000), recommendedStructure: z.array(z.string()).max(50), risk: z.string().max(5_000), evidenceIds: ids, sourceItemIds: ids }).strict()).min(1).max(10) }).strict();
export const briefPreviewSchema = z.object({ topic: z.string().min(1).max(2_000), angle: z.string().max(5_000), audience: z.string().max(2_000), coreMessage: z.string().min(1).max(10_000), keyPoints: z.array(z.string()).max(100), structure: z.array(z.string()).max(100), tone: z.string().max(2_000), risks: z.array(z.string()).max(100), evidenceIds: ids, sourceItemIds: ids }).strict();
export const motherContentProviderSchema = z.object({
  recommendedAngle: z.string().min(1).max(5_000),
  alternativeAngles: z.array(z.string().min(1).max(5_000)).max(2),
  recommendedTitle: z.string().min(1).max(2_000),
  alternativeTitles: z.array(z.string().min(1).max(2_000)).length(2),
  openingHook: z.string().min(1).max(5_000),
  alternativeOpenings: z.array(z.string().min(1).max(5_000)).max(3).default([]),
  closingAction: z.string().max(5_000).nullable().default(null),
  cta: z.string().max(5_000).nullable().default(null),
  needsConfirmation: z.array(z.string().min(1).max(2_000)).max(20).default([]),
  outline: z.array(z.string()).max(200),
  body: z.string().min(1).max(1_000_000),
  evidenceIds: ids,
  sourceItemIds: ids,
}).strict();
export const motherContentPreviewSchema = motherContentProviderSchema.extend({
  estimatedDurationSeconds: z.number().int().positive(),
  estimatedCharacterCount: z.number().int().nonnegative(),
  ownContribution: z.enum(["STRONG", "MEDIUM", "WEAK"]),
}).strict();
export const rewritePreviewSchema = z.object({ original: z.string().min(1).max(20_000), aiVersion: z.string().min(1).max(50_000) }).strict();

export function schemaForAction(action: AIAction): z.ZodTypeAny {
  if (action === "ANALYZE_SOURCES") return analyzeSourcesSchema;
  if (action === "EXTRACT_EVIDENCE") return evidencePreviewSchema;
  if (action === "GENERATE_ANGLES") return anglesSchema;
  if (action === "GENERATE_BRIEF") return briefPreviewSchema;
  if (action === "GENERATE_MOTHER_CONTENT") return motherContentPreviewSchema;
  return rewritePreviewSchema;
}

const outputShapes: Record<AIAction, string> = {
  ANALYZE_SOURCES: '{"topics":string[],"coreClaims":Insight[],"facts":Insight[],"cases":Insight[],"questions":string[],"hooks":string[],"structures":string[],"risks":string[],"reusableInsights":Insight[]}; Insight={"text":string,"evidenceIds":string[],"sourceItemIds":string[]}',
  EXTRACT_EVIDENCE: '{"items":[{"type":"FACT|VIEWPOINT|CASE|DATA|QUOTE|EXPERIENCE|QUESTION|OTHER","excerpt":string,"claim":string,"note":string,"sourceItemId":string|null}]}',
  GENERATE_ANGLES: '{"angles":[{"title":string,"angle":string,"coreMessage":string,"whyItWorks":string,"targetAudience":string,"recommendedStructure":string[],"risk":string,"evidenceIds":string[],"sourceItemIds":string[]}]}',
  GENERATE_BRIEF: '{"topic":string,"angle":string,"audience":string,"coreMessage":string,"keyPoints":string[],"structure":string[],"tone":string,"risks":string[],"evidenceIds":string[],"sourceItemIds":string[]}',
  GENERATE_MOTHER_CONTENT: '{"recommendedAngle":string,"alternativeAngles":string[0..2],"recommendedTitle":string,"alternativeTitles":[string,string],"openingHook":string,"alternativeOpenings":string[0..3],"closingAction":string|null,"cta":string|null,"needsConfirmation":string[],"outline":string[],"body":string,"evidenceIds":string[],"sourceItemIds":string[]}',
  REWRITE_SELECTION: '{"original":string,"aiVersion":string}', SHORTEN: '{"original":string,"aiVersion":string}', EXPAND: '{"original":string,"aiVersion":string}', ADD_PERSONAL_VIEW: '{"original":string,"aiVersion":string}', HUMANIZE: '{"original":string,"aiVersion":string}',
};

export function outputInstruction(action: AIAction) { return `\nReturn exactly one JSON object matching this shape. Do not use markdown fences:\n${outputShapes[action]}`; }
export function isRewriteAction(action: AIAction) { return ["REWRITE_SELECTION", "SHORTEN", "EXPAND", "ADD_PERSONAL_VIEW", "HUMANIZE"].includes(action); }
