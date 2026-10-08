import "server-only";
import { createHash } from "node:crypto";
import { db } from "@content-center/db";
import { searchDiscoveryContent } from "../discovery/service";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { parseTrendStableKey } from "./trends";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { parseWorkResearchState } from "./work-research-contract";
import { topicOpportunityV2StateSchema, type TopicOpportunityV2State } from "./topic-opportunity-v2-contract";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function collectTopicOpportunityV2(actor: ResearchActor, input: { stableKey: string; projectId: string; materialIds: string[] }): Promise<TopicOpportunityV2State> {
  await researchMember(actor, true);
  const identity = parseTrendStableKey(input.stableKey);
  const [trend, observedCount, project, materials] = await Promise.all([
    db.trendSnapshot.findFirst({ where: { workspaceId: actor.workspaceId, ...identity }, orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      select: { id: true, title: true, keyword: true, platform: true, observedAt: true, rank: true } }),
    db.trendSnapshot.count({ where: { workspaceId: actor.workspaceId, ...identity } }),
    db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, goal: true, audience: true } }),
    db.sourceItem.findMany({ where: { id: { in: [...new Set(input.materialIds)] }, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true } }),
  ]);
  if (!trend) throw new ResearchError("TREND_NOT_FOUND", "趋势记录不存在或不可访问。", 404);
  if (!project) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或不可访问。", 404);
  if (!input.materialIds.length || input.materialIds.length > 8 || materials.length !== new Set(input.materialIds).size) throw new ResearchError("MATERIAL_NOT_FOUND", "请选择当前工作区内的自有资料。", 404);
  const ownReadings = await Promise.all(materials.map(item => getMaterialReadableContent({ ...actor, sourceItemId: item.id })));
  const unreadable = materials.find((_, index) => !ownReadings[index]?.contentText.trim());
  if (unreadable) throw new ResearchError("MATERIAL_UNREADABLE", `${unreadable.title || "所选资料"}暂时没有可读正文。`, 409);
  const ownMaterials = materials.map((item, index) => ({ ref: `M${index + 1}`, id: item.id, title: item.title || "未命名资料",
    version: ownReadings[index]!.version ?? null, excerpt: ownReadings[index]!.contentText.slice(0, 4500) }));
  const search = await searchDiscoveryContent({ ...actor, query: (trend.keyword || trend.title).slice(0, 300),
    platform: trend.platform === "DOUYIN" || trend.platform === "XIAOHONGSHU" ? trend.platform : "ALL", sort: "RECOMMENDED" });
  const candidates = search.items.slice(0, 12);
  const relatedReadings = await Promise.all(candidates.map(async item => item.sourceItemId ? getMaterialReadableContent({ ...actor, sourceItemId: item.sourceItemId }) : null));
  const related = candidates.map((item, index) => ({ ref: `R${index + 1}`, externalId: item.externalId,
    platform: item.platform, title: (item.title || item.description || "未命名作品").slice(0, 1000), authorName: item.authorName,
    publishedAt: item.publishedAt, url: /^https:\/\//i.test(item.originalUrl) ? item.originalUrl : null,
    bodyExcerpt: relatedReadings[index]?.contentText.slice(0, 2000) ?? null,
    bodyOrigin: relatedReadings[index]?.contentSource ?? null }));
  const runs = await db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId,
    status: "COMPLETED", inputScope: { path: ["researchProfile"], equals: "WORK_DEEP" } },
    orderBy: { finishedAt: "desc" }, take: 80, select: { id: true, coverage: true } });
  const needle = (trend.keyword || trend.title).trim().toLocaleLowerCase("zh-CN");
  const workMethods = [...new Map(runs.flatMap(run => {
    const state = parseWorkResearchState(run.coverage);
    if (state?.schemaVersion !== "work-research-v2" || !state.answer) return [];
    const haystack = `${state.evidence.title} ${state.answer.topicIdea.theme ?? ""} ${state.answer.decision.topicLogic.angle}`.toLocaleLowerCase("zh-CN");
    if (needle.length < 2 || !haystack.includes(needle)) return [];
    return [[state.evidence.workId, { ref: `W${hash(state.evidence.workId).slice(0, 12)}`, workId: state.evidence.workId, runId: run.id,
      title: state.evidence.title, oneLine: state.answer.decision.executiveSummary.oneLine,
      mechanism: state.answer.transferable.principle, citation: state.answer.transferable.citation.quote }]] as const;
  })).values()].slice(0, 12);
  const fingerprint = hash({ trendId: trend.id, observedCount, project, related: related.map(item => [item.externalId, item.title, item.bodyExcerpt]),
    materials: ownMaterials.map(item => [item.id, item.version, hash(item.excerpt)]), workMethods: workMethods.map(item => item.runId) });
  return topicOpportunityV2StateSchema.parse({ schemaVersion: "topic-opportunity-v2", fingerprint, capturedAt: new Date().toISOString(),
    trend: { stableKey: input.stableKey, snapshotId: trend.id, title: trend.title, platform: trend.platform, observedAt: trend.observedAt.toISOString(),
      rank: trend.rank, keyword: trend.keyword, observedCount }, project, related, ownMaterials, workMethods, answer: null });
}
