import { z } from "zod";

export const FACT_CLASSIFICATIONS = ["CONFIRMED", "CREATOR_VIEW", "AI_SUGGESTION", "NEEDS_VERIFICATION"] as const;
export const HOOK_TYPES = ["CONTRARIAN", "QUESTION", "CASE", "DIRECT_JUDGEMENT", "BOSS_VIEW", "STORY"] as const;

const shortText = z.string().max(5_000);
const textList = z.array(shortText).max(100);

export const topicPackageSchema = z.object({
  coreTopic: z.string().min(1).max(2_000),
  coreQuestion: z.string().min(1).max(5_000),
  candidateTopics: z.array(z.object({
    title: z.string().min(1).max(2_000),
    angle: shortText,
    targetAudience: shortText,
    conflict: shortText,
    novelty: shortText,
    whyWorthDoing: shortText,
    differenceFromSources: shortText,
  }).strict()).min(1).max(20),
}).strict();

export const viewpointPackageSchema = z.object({
  mainViewpoint: z.string().min(1).max(10_000),
  supportingViewpoints: textList,
  counterArguments: textList,
  commonBeliefs: textList,
  ourJudgement: z.string().min(1).max(10_000),
  deeperImplications: textList,
}).strict();

export const evidenceEntrySchema = z.object({
  evidenceId: z.string().min(1).nullable(),
  type: z.string().min(1).max(100),
  content: z.string().min(1).max(20_000),
  sourceItemId: z.string().min(1).nullable(),
  sourceReference: z.string().max(5_000).nullable(),
  supports: z.string().max(10_000),
  confidence: z.number().min(0).max(1),
  needsVerification: z.boolean(),
  classification: z.enum(FACT_CLASSIFICATIONS),
}).strict();

export const evidencePackageSchema = z.object({ items: z.array(evidenceEntrySchema).max(100) }).strict();

export const expressionPackageSchema = z.object({
  hooks: z.array(z.object({ type: z.enum(HOOK_TYPES), text: z.string().min(1).max(5_000) }).strict()).min(6).max(60),
  goldenLines: textList,
  questions: textList,
  analogies: textList,
  conflictLines: textList,
  transitions: textList,
  endingIdeas: textList,
  ctaIdeas: textList,
}).strict().superRefine((value, context) => {
  const available = new Set(value.hooks.map(({ type }) => type));
  for (const type of HOOK_TYPES) if (!available.has(type)) context.addIssue({ code: "custom", message: `hooks must include ${type}`, path: ["hooks"] });
});

export const structurePackageSchema = z.object({
  structures: z.array(z.object({
    type: z.enum(["CONTRARIAN", "STORY", "VIEWPOINT", "CUSTOM"]),
    name: z.string().min(1).max(2_000),
    whySuitable: shortText,
    steps: z.array(z.string().min(1).max(5_000)).min(1).max(100),
  }).strict()).min(3).max(12),
  recommendedStructure: z.string().min(1).max(2_000),
}).strict();

export const creatorContributionSchema = z.object({
  personalViews: textList,
  personalExperiences: textList,
  personalCases: textList,
  professionalKnowledge: textList,
  positions: textList,
  preferredExpressions: textList,
  brandPrinciples: textList,
  forbiddenExpressions: textList,
}).strict();

export const deepContentPackageSchema = z.object({
  topicPackage: topicPackageSchema,
  viewpointPackage: viewpointPackageSchema,
  evidencePackage: evidencePackageSchema,
  expressionPackage: expressionPackageSchema,
  structurePackage: structurePackageSchema,
  creatorContribution: creatorContributionSchema,
  recommendedDirection: z.string().min(1).max(10_000),
  risks: textList,
  needsConfirmation: textList,
}).strict();

export type DeepContentPackageOutput = z.infer<typeof deepContentPackageSchema>;

export const deepPackageOutputInstruction = `
Return exactly one JSON object matching this shape. Do not use markdown fences:
{
  "topicPackage":{"coreTopic":string,"coreQuestion":string,"candidateTopics":[{"title":string,"angle":string,"targetAudience":string,"conflict":string,"novelty":string,"whyWorthDoing":string,"differenceFromSources":string}]},
  "viewpointPackage":{"mainViewpoint":string,"supportingViewpoints":string[],"counterArguments":string[],"commonBeliefs":string[],"ourJudgement":string,"deeperImplications":string[]},
  "evidencePackage":{"items":[{"evidenceId":string|null,"type":string,"content":string,"sourceItemId":string|null,"sourceReference":string|null,"supports":string,"confidence":number,"needsVerification":boolean,"classification":"CONFIRMED|CREATOR_VIEW|AI_SUGGESTION|NEEDS_VERIFICATION"}]},
  "expressionPackage":{"hooks":[{"type":"CONTRARIAN|QUESTION|CASE|DIRECT_JUDGEMENT|BOSS_VIEW|STORY","text":string}],"goldenLines":string[],"questions":string[],"analogies":string[],"conflictLines":string[],"transitions":string[],"endingIdeas":string[],"ctaIdeas":string[]},
  "structurePackage":{"structures":[{"type":"CONTRARIAN|STORY|VIEWPOINT|CUSTOM","name":string,"whySuitable":string,"steps":string[]}],"recommendedStructure":string},
  "creatorContribution":{"personalViews":string[],"personalExperiences":string[],"personalCases":string[],"professionalKnowledge":string[],"positions":string[],"preferredExpressions":string[],"brandPrinciples":string[],"forbiddenExpressions":string[]},
  "recommendedDirection":string,"risks":string[],"needsConfirmation":string[]
}`;
