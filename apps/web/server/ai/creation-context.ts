export const CONFIRMED_FACT_PREFIX = "【已确认事实】";

const uncertainty = /(我觉得|我感觉|可能|也许|应该|以后|将来|打算|计划|希望|看起来|似乎|大概)/u;
const explicitOwnFact = /^(?:我|我们|我的|我们的|这个客户是我们|这位客户是我们|这个项目是我们).{0,80}(?:是|有|做过|做了|负责|从事|合作|带过|运营|服务|已经|曾经|以前|现在|目前)/u;

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s，,。；;：:！？!?、“”‘’（）()《》【】\-—]/gu, "");
}

export function splitContextStatements(value: string) {
  return value.split(/\n+|(?<=[。！？!?])/u).map((item) => item.trim()).filter(Boolean);
}

export function extractExplicitOwnFacts(value: string) {
  return splitContextStatements(value).flatMap((statement) => {
    const marked = statement.startsWith(CONFIRMED_FACT_PREFIX);
    const text = marked ? statement.slice(CONFIRMED_FACT_PREFIX.length).trim() : statement;
    if (!text || (!marked && (uncertainty.test(text) || !explicitOwnFact.test(text)))) return [];
    return [text];
  }).filter((item, index, all) => all.findIndex((candidate) => normalize(candidate) === normalize(item)) === index);
}

export function appendConfirmedCreatorFacts(notes: string, facts: string[]) {
  const existing = splitContextStatements(notes);
  const known = new Set(existing.flatMap((item) => [item, item.startsWith(CONFIRMED_FACT_PREFIX) ? item.slice(CONFIRMED_FACT_PREFIX.length).trim() : item]).map(normalize));
  const additions = facts.filter((fact) => !known.has(normalize(fact))).map((fact) => `${CONFIRMED_FACT_PREFIX}${fact}`);
  return [...existing, ...additions].join("\n");
}

export type CreatorContextProfile = {
  displayName: string;
  positioning: string;
  targetAudience: string;
  tone: string;
  preferredStyle: string;
  forbiddenStyle: string;
  coreTopics: string[];
  personalViews: string[];
  brandTerms: string[];
  forbiddenTerms: string[];
  hookPreferences: string[];
  structurePreferences: string[];
  ctaPreferences: string[];
  examplePhrases: string[];
  notes: string;
};

export function classifyCreatorContext(profile: CreatorContextProfile | null) {
  if (!profile) return { profile: null, confirmedFacts: [] as string[], currentUnderstanding: [] as string[], pendingInformation: [] as string[] };
  const notes = splitContextStatements(profile.notes);
  const confirmedFacts = [
    ...(profile.positioning.trim() ? [profile.positioning.trim()] : []),
    ...extractExplicitOwnFacts(profile.notes),
  ].filter((item, index, all) => all.findIndex((candidate) => normalize(candidate) === normalize(item)) === index);
  const currentUnderstanding = [
    profile.targetAudience,
    profile.tone,
    profile.preferredStyle,
    ...profile.coreTopics,
    ...profile.personalViews,
    ...profile.hookPreferences,
    ...profile.structurePreferences,
    ...profile.ctaPreferences,
    ...profile.examplePhrases,
  ].map((item) => item.trim()).filter(Boolean);
  const pendingInformation = notes.filter((item) => uncertainty.test(item)).map((item) => item.replace(CONFIRMED_FACT_PREFIX, "").trim());
  return {
    profile: { displayName: profile.displayName, positioning: profile.positioning, targetAudience: profile.targetAudience, tone: profile.tone, preferredStyle: profile.preferredStyle, forbiddenStyle: profile.forbiddenStyle, coreTopics: profile.coreTopics, personalViews: profile.personalViews, brandTerms: profile.brandTerms, forbiddenTerms: profile.forbiddenTerms, hookPreferences: profile.hookPreferences, structurePreferences: profile.structurePreferences, ctaPreferences: profile.ctaPreferences, examplePhrases: profile.examplePhrases },
    confirmedFacts,
    currentUnderstanding,
    pendingInformation,
  };
}

export type ConfirmedOwnFact = {
  text: string;
  source: "CREATOR_PROFILE" | "PROJECT_EVIDENCE" | "MY_SUPPLEMENT" | "CURRENT_DRAFT";
  kind: "FACT" | "VIEWPOINT" | "CASE" | "DATA" | "QUOTE" | "EXPERIENCE" | "QUESTION" | "OTHER";
  sourceId?: string;
};

export function uniqueConfirmedFacts(facts: ConfirmedOwnFact[]) {
  return facts.filter((fact, index, all) => all.findIndex((candidate) => normalize(candidate.text) === normalize(fact.text)) === index);
}
