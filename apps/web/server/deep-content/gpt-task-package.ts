import "server-only";

import { db } from "@content-center/db";
import { ProjectServiceError } from "../project-service";
import { deepContentPackageSchema, type DeepContentPackageOutput } from "./schemas";

export const GPT_CONTENT_TYPES = ["SPOKEN_60", "SPOKEN_90", "LONG_SPOKEN", "LONG_ARTICLE", "CUSTOM"] as const;
export type GPTContentType = (typeof GPT_CONTENT_TYPES)[number];

const contentTypeLabels: Record<GPTContentType, string> = { SPOKEN_60: "60秒口播", SPOKEN_90: "90秒口播", LONG_SPOKEN: "长口播", LONG_ARTICLE: "长文章", CUSTOM: "自定义" };

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function list(items: string[], empty = "（无）") { return items.length ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : empty; }
function section(title: string, content: string) { return `━━━━━━━━━━━━━━━━━━━━\n【${title}】\n\n${content || "（无）"}\n`; }

export function renderGPTTaskPackage(input: {
  package: DeepContentPackageOutput;
  contentType: GPTContentType;
  customRequirements?: string;
  project: { title: string; goal: string | null; audience: string | null };
  brief: { topic: string; angle: string; audience: string; coreMessage: string; tone: string } | null;
  profile: { positioning: string; targetAudience: string; tone: string; preferredStyle: string; forbiddenStyle: string; personalViews: unknown; brandTerms: unknown; forbiddenTerms: unknown; examplePhrases: unknown } | null;
}) {
  const pack = deepContentPackageSchema.parse(input.package);
  const reliable = pack.evidencePackage.items.filter((item) => item.classification === "CONFIRMED" && item.evidenceId && !item.needsVerification);
  const creatorEvidence = pack.evidencePackage.items.filter((item) => item.classification === "CREATOR_VIEW");
  const suggestions = pack.evidencePackage.items.filter((item) => item.classification === "AI_SUGGESTION");
  const unverified = pack.evidencePackage.items.filter((item) => item.classification === "NEEDS_VERIFICATION" || item.needsVerification);
  const profile = input.profile;
  const selectedStructure = pack.structurePackage.structures.find((item) => item.name === pack.structurePackage.recommendedStructure) ?? pack.structurePackage.structures[0];
  const evidenceLines = reliable.map((item) => `${item.content}${item.sourceReference ? `（来源：${item.sourceReference}）` : ""} [Evidence: ${item.evidenceId}]`);
  const creatorViews = [...pack.creatorContribution.personalViews, ...creatorEvidence.map(({ content }) => content), ...strings(profile?.personalViews)];
  const taskRequirements = [
    `内容类型：${contentTypeLabels[input.contentType]}`,
    input.contentType === "SPOKEN_60" ? "目标时长约 60 秒，优先清晰、自然、可口播。" : "",
    input.contentType === "SPOKEN_90" ? "目标时长约 90 秒，允许更完整的论证。" : "",
    input.customRequirements?.trim() ? `用户补充要求：${input.customRequirements.trim()}` : "",
  ].filter(Boolean).join("\n");

  return [
    "━━━━━━━━━━━━━━━━━━━━\nGPT 高质量内容创作任务\n━━━━━━━━━━━━━━━━━━━━\n",
    section("你的角色", "你是一名高级中文内容主笔。你的工作不是对原素材做简单改写，而是基于已经完成的研究资料重新完成内容创作。"),
    section("创作目标", [taskRequirements, input.project.goal || "完成一篇可靠、原创、符合创作者表达的成稿", `项目：${input.project.title}`, input.brief?.topic ? `Brief 主题：${input.brief.topic}` : "", input.brief?.angle ? `Brief 角度：${input.brief.angle}` : "", input.brief?.tone ? `Brief 语气：${input.brief.tone}` : ""].filter(Boolean).join("\n")),
    section("目标受众", input.brief?.audience || profile?.targetAudience || input.project.audience || "（待确认）"),
    section("选定选题", pack.topicPackage.coreTopic),
    section("核心命题", `${pack.topicPackage.coreQuestion}\n${input.brief?.coreMessage || ""}`.trim()),
    section("核心观点", pack.viewpointPackage.mainViewpoint),
    section("支撑观点", list(pack.viewpointPackage.supportingViewpoints)),
    section("反方观点", list(pack.viewpointPackage.counterArguments)),
    section("我们的判断", pack.viewpointPackage.ourJudgement),
    section("可靠 Evidence", list(evidenceLines, "（当前没有可作为可靠事实引用的正式 Evidence）")),
    section("创作者自己的观点", list(creatorViews)),
    section("创作者经验 / 案例", list([...pack.creatorContribution.personalExperiences, ...pack.creatorContribution.personalCases])),
    section("创作者表达特点", [profile?.positioning, profile?.tone, profile?.preferredStyle, ...pack.creatorContribution.preferredExpressions, ...strings(profile?.examplePhrases)].filter((item): item is string => Boolean(item)).join("\n")),
    section("品牌词 / 原则", list([...strings(profile?.brandTerms), ...pack.creatorContribution.brandPrinciples])),
    section("候选 Hook", list(pack.expressionPackage.hooks.map(({ type, text }) => `[${type}] ${text}`))),
    section("可用金句", list(pack.expressionPackage.goldenLines)),
    section("类比 / 冲突", list([...pack.expressionPackage.analogies, ...pack.expressionPackage.conflictLines])),
    section("推荐结构", selectedStructure ? `${selectedStructure.name}\n${selectedStructure.whySuitable}\n${list(selectedStructure.steps)}` : pack.structurePackage.recommendedStructure),
    section("创作建议（不是可靠事实）", list([...suggestions.map(({ content }) => content), pack.recommendedDirection])),
    section("风险 / 待确认", list([...pack.risks, ...pack.needsConfirmation, ...unverified.map(({ content }) => `需要核实：${content}`)])),
    section("禁止表达", list([profile?.forbiddenStyle || "", ...strings(profile?.forbiddenTerms), ...pack.creatorContribution.forbiddenExpressions].filter(Boolean))),
    section("硬性要求", "不要简单改写来源。\n不要虚构数据、人物、案例、日期、经历或引用。\n不要使用材料中没有依据的信息。\n创作建议不能写成已确认事实。\n减少 AI 腔、营销腔、空泛总结和机械排比。\n保持创作者自己的声音。"),
    section("最终输出", "1. 主标题\n2. 完整成稿\n3. 3 个不同类型的备选开头\n4. 2 个不同风格的备选结尾\n5. 需要创作者进一步确认的信息"),
  ].join("\n");
}

async function scopedData(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
    include: { creatorProfile: true, creativeBrief: true, deepContentPackages: { where: { status: { not: "ARCHIVED" } }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  const ownProfile = project.creatorProfile ?? await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } });
  const row = project.deepContentPackages[0];
  if (!row) throw new GPTTaskPackageError("DEEP_PACKAGE_REQUIRED", "请先保存 Deep Content Package。");
  return { project, profile: ownProfile, row };
}

export async function getGPTTaskPackage(input: { workspaceId: string; userId: string; projectId: string; contentType: GPTContentType; customRequirements?: string }) {
  const { project, profile, row } = await scopedData(input);
  const packageOutput = deepContentPackageSchema.parse({ topicPackage: row.topicPackage, viewpointPackage: row.viewpointPackage, evidencePackage: row.evidencePackage, expressionPackage: row.expressionPackage, structurePackage: row.structurePackage, creatorContribution: row.creatorContribution, recommendedDirection: row.recommendedDirection, risks: row.risks, needsConfirmation: row.needsConfirmation });
  return { packageId: row.id, packageVersion: row.version, contentType: input.contentType, text: renderGPTTaskPackage({ package: packageOutput, contentType: input.contentType, customRequirements: input.customRequirements, project: { title: project.title, goal: project.goal, audience: project.audience }, brief: project.creativeBrief ? { topic: project.creativeBrief.topic, angle: project.creativeBrief.angle, audience: project.creativeBrief.audience, coreMessage: project.creativeBrief.coreMessage, tone: project.creativeBrief.tone } : null, profile }) };
}

export async function recordGPTTaskPackageCopied(input: { workspaceId: string; userId: string; projectId: string; packageId: string; contentType: GPTContentType; characterCount: number }) {
  const { row } = await scopedData(input);
  if (row.id !== input.packageId) throw new GPTTaskPackageError("DEEP_PACKAGE_REQUIRED", "创作包已经更新，请重新生成任务包。");
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "gpt_package.copied", resourceType: "deep_content_package", resourceId: row.id, metadata: { projectId: input.projectId, packageId: row.id, version: row.version, contentType: input.contentType, characterCount: input.characterCount } } });
  return { recorded: true };
}

export class GPTTaskPackageError extends Error {
  constructor(readonly code: "DEEP_PACKAGE_REQUIRED", message: string) { super(message); this.name = "GPTTaskPackageError"; }
}
