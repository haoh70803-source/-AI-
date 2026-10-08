import type { QualityIssue } from "./schemas";

type ProjectInput = { id: string };
type MotherInput = { title: string; body: string; origin: "HUMAN" | "KIMI" | "GPT_WEB" };
type VariantInput = { platform: "DOUYIN" | "XIAOHONGSHU" | "WECHAT_MOMENTS" | "WECHAT_CHANNELS" | "WECHAT_OFFICIAL"; title: string | null; body: string; hook: string | null; summary?: string | null; hashtags: unknown; metadata?: unknown };
type ProfileInput = { forbiddenTerms: unknown } | null;
type EvidenceInput = Array<{ excerpt?: string | null; claim?: string | null; note?: string | null; sourceUrl?: string | null }>;
type DeepPackageInput = { evidencePackage: unknown } | null;

const TITLE_REQUIRED = new Set<VariantInput["platform"]>(["XIAOHONGSHU", "WECHAT_CHANNELS", "WECHAT_OFFICIAL"]);
const RISK_TERMS = ["100%有效", "一定成功", "绝对不会", "保证结果", "保证赚钱", "唯一", "第一", "永久有效"];
const FACT_PATTERN = /(?:[¥￥$]\s*\d+(?:\.\d+)?(?:万|亿)?|\d+(?:\.\d+)?\s*(?:%|％|元|万元|亿元)|\d{4}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?)?|\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d+(?:\.\d+)?)/g;

function issue(code: string, severity: QualityIssue["severity"], message: string, field: string, suggestion: string): QualityIssue {
  return { code, severity, message, field, source: "RULE", suggestion };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function facts(value: string): string[] {
  return [...new Set((value.match(FACT_PATTERN) ?? []).map((item) => item.replaceAll(/\s/g, "")))];
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textIncludes(haystack: string, needle: string) {
  const normalized = needle.trim().replaceAll(/\s+/g, " ");
  return normalized.length >= 4 && haystack.replaceAll(/\s+/g, " ").includes(normalized);
}

export class QualityGate {
  check(input: { project: ProjectInput; motherContent: MotherInput; platformVariant: VariantInput; creatorProfile: ProfileInput; evidence: EvidenceInput; deepContentPackage?: DeepPackageInput }) {
    const variant = input.platformVariant;
    const issues: QualityIssue[] = [];
    const fields = { title: variant.title ?? "", hook: variant.hook ?? "", body: variant.body, summary: variant.summary ?? "" };
    const combined = Object.values(fields).join("\n");

    if (!variant.body.trim()) issues.push(issue("EMPTY_BODY", "ERROR", "正文不能为空。", "body", "请补充完整正文。"));
    if (TITLE_REQUIRED.has(variant.platform) && !variant.title?.trim()) issues.push(issue("MISSING_TITLE", "ERROR", "该平台需要标题。", "title", "请补充标题。"));
    if (variant.platform === "DOUYIN" && !variant.hook?.trim()) issues.push(issue("MISSING_HOOK", "ERROR", "抖音内容需要 Hook。", "hook", "请补充开场 Hook。"));

    for (const [field, value] of Object.entries(fields)) {
      if (/\{\{[^}]+\}\}/.test(value)) issues.push(issue("UNRESOLVED_TEMPLATE", "ERROR", "存在未替换的模板变量。", field, "请替换模板变量后再审核。"));
      const openings = (value.match(/\{\{/g) ?? []).length;
      const closings = (value.match(/\}\}/g) ?? []).length;
      if (openings !== closings) issues.push(issue("UNCLOSED_TEMPLATE", "ERROR", "存在未闭合的模板变量。", field, "请修复模板变量括号。"));
      if (/\b(?:TODO|TBD)\b/i.test(value)) issues.push(issue("TODO_PLACEHOLDER", "ERROR", "存在 TODO / TBD 占位符。", field, "请完成占位内容。"));
      if (/\[(?:待补充|需要补充)\]/.test(value)) issues.push(issue("INCOMPLETE_PLACEHOLDER", "ERROR", "存在待补充内容。", field, "请补充内容后再审核。"));
      if (/\[(?:待确认|需要确认)\]/.test(value)) issues.push(issue("CONFIRMATION_PLACEHOLDER", "WARNING", "存在待确认内容。", field, "请人工确认后再批准。"));
    }

    const tags = strings(variant.hashtags);
    if (tags.some((tag) => !tag.trim())) issues.push(issue("EMPTY_HASHTAG", "WARNING", "存在空 hashtag。", "hashtags", "请移除空标签。"));
    const normalizedTags = tags.map((tag) => tag.trim().replace(/^#/, "").toLocaleLowerCase()).filter(Boolean);
    if (new Set(normalizedTags).size < normalizedTags.length) issues.push(issue("DUPLICATE_HASHTAG", "WARNING", "存在重复 hashtag。", "hashtags", "请合并重复标签。"));

    for (const term of RISK_TERMS) {
      if (combined.includes(term)) issues.push(issue("HIGH_RISK_PROMISE", "WARNING", `发现高风险承诺表达：${term}`, "body", "请核实依据并改为可验证、有限定条件的表达。"));
    }

    const variantFacts = facts(combined);
    const motherText = `${input.motherContent.title}\n${input.motherContent.body}`;
    const motherFacts = new Set(facts(motherText));
    const newFacts = variantFacts.filter((fact) => !motherFacts.has(fact));
    if (newFacts.length) issues.push(issue("POSSIBLE_NEW_FACT", "WARNING", `平台内容出现母稿中没有的具体事实：${newFacts.join("、")}`, "body", "请确认这些数字、金额、比例或日期的来源。"));

    const formalEvidence = input.evidence.map((item) => [item.claim, item.excerpt, item.note, item.sourceUrl].filter(Boolean).join(" ")).join("\n");
    const evidencePackage = object(input.deepContentPackage?.evidencePackage);
    const deepItems = Array.isArray(evidencePackage?.items) ? evidencePackage.items.map(object).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
    const confirmedEvidence = deepItems.filter((item) => item.classification === "CONFIRMED").map((item) => typeof item.content === "string" ? item.content : "").join("\n");
    const evidenceCorpus = `${formalEvidence}\n${confirmedEvidence}`;
    const unsupportedFacts = variantFacts.filter((fact) => !evidenceCorpus.includes(fact));
    if (variantFacts.length && unsupportedFacts.length) issues.push(issue("UNVERIFIED_FACT", "WARNING", `存在未由正式 Evidence 或 CONFIRMED 材料支撑的事实：${unsupportedFacts.join("、")}`, "body", "请补充正式 Evidence，或人工核实后调整表达。"));

    const finalText = `${motherText}\n${combined}`;
    const usesUnverified = deepItems.some((item) => item.classification === "NEEDS_VERIFICATION" && typeof item.content === "string" && textIncludes(finalText, item.content));
    if (usesUnverified) issues.push(issue("USES_UNVERIFIED_MATERIAL", "WARNING", "最终内容使用了 Deep Content Package 中标记为 NEEDS_VERIFICATION 的材料。", "body", "请完成事实核验或移除该材料。"));

    for (const forbidden of strings(input.creatorProfile?.forbiddenTerms)) {
      if (forbidden.trim() && combined.includes(forbidden.trim())) issues.push(issue("CREATOR_FORBIDDEN_TERM", "WARNING", `命中 CreatorProfile 禁用词：${forbidden.trim()}`, "body", "请按 CreatorProfile 调整表达。"));
    }

    return { passed: !issues.some(({ severity }) => severity === "ERROR"), issues };
  }
}

export function isPlatformVariantReadyToPublish(input: { status: string; sourceMotherVersion: number; motherVersion: number }) {
  return input.status === "APPROVED" && input.sourceMotherVersion >= input.motherVersion;
}
