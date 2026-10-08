export type OwnContribution = "STRONG" | "MEDIUM" | "WEAK";

export type ContentProductionPlan = {
  recommendedAngle: string;
  alternativeAngles: string[];
  recommendedTitle: string;
  alternativeTitles: string[];
  openingHook: string;
  alternativeOpenings?: string[];
  closingAction?: string | null;
  cta?: string | null;
  needsConfirmation?: string[];
  estimatedDurationSeconds: number;
  estimatedCharacterCount: number;
  ownContribution: OwnContribution;
};

export function countSpokenCharacters(body: string) {
  return body.replace(/\s/g, "").length;
}

export function estimateSpokenDuration(body: string, charactersPerSecond = 4.2) {
  return Math.max(1, Math.round(countSpokenCharacters(body) / charactersPerSecond));
}

export function groundUngroundedPersonalClaims(text: string, hasOwnBackground: boolean) {
  if (hasOwnBackground) return text;
  return text
    .replace(/很多([^。！？\n]{0,30})跟我(?:们)?聊[，,]说/g, "很多$1都会遇到这样的情况：")
    .replace(/我(?:们)?见过一种做法[，,]?(?:挺有意思)?[。.]?/g, "有一种可以先小范围验证的做法：")
    .replace(/我(?:们)?(?:自己)?做下来(?:以后)?发现/g, "实际执行时常见的情况是")
    .replace(/我们在持续调/g, "方法需要持续调整")
    .replace(/(?:我的|我们的)(客户|学员|校长|用户|收入|成绩|项目|经历|案例|数据)/g, "$1");
}

export function resolveOwnContribution(input: { coreMessage?: string | null; background?: string | null; audience?: string | null }) : OwnContribution {
  const viewpoint = input.coreMessage?.trim().length ?? 0;
  const ownMaterial = input.background?.trim().length ?? 0;
  const audience = input.audience?.trim().length ?? 0;
  if (ownMaterial >= 80 && viewpoint >= 20) return "STRONG";
  if (ownMaterial >= 20 || (viewpoint >= 30 && audience > 0)) return "MEDIUM";
  return "WEAK";
}

export function sourceDisplayName(input: {
  title?: string | null;
  suggestedTitle?: string | null;
  summary?: string | null;
  platformLabel: string;
  createdAt: Date;
}) {
  const explicit = input.title?.trim() || input.suggestedTitle?.trim();
  if (explicit) return explicit;
  const summary = input.summary?.replace(/\s+/g, " ").trim();
  if (summary) return summary.length > 28 ? `${summary.slice(0, 28)}…` : summary;
  return `${input.platformLabel}资料 · ${input.createdAt.toLocaleDateString("zh-CN")}`;
}
