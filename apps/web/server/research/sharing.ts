import "server-only";
import { db, type Prisma } from "@content-center/db";
import type { ResearchBlock, ResearchSource } from "@content-center/core";
import { writeDraftRevisionInTransaction } from "../drafts/service";
import { getArtifactForUser } from "../artifacts/service";
import type { ResearchSelection } from "../../lib/contracts/references";
import { getSelectedResearch } from "./read-model";
import { researchBlocksSchema } from "./contracts";
import { researchMember, ResearchError, type ResearchActor } from "./access";
import { getLegacyResearchResult } from "./legacy";

const shareableKinds = new Set<ResearchSource["kind"]>(["MATERIAL", "BENCHMARK_ACCOUNT", "BENCHMARK_WORK", "BENCHMARK_COMMENT", "TREND"]);
async function createSharedArtifact(tx: Prisma.TransactionClient, actor: ResearchActor, project: { id: string; primaryDraftBranchId: string | null }, source: { kind: "run" | "study"; id: string; title: string; blocks: ResearchBlock[]; userSelected?: boolean }) {
  const title = source.title.slice(0, 200);
  const preview = buildResearchSharePreview(title, source.blocks, { explicitSelection: source.userSelected });
  if (!preview.body) throw new ResearchError("NO_SHAREABLE_BLOCKS", "当前成果没有可共享的来源结论。", 409);
  const branch = await tx.draftBranch.create({ data: { workspaceId: actor.workspaceId, projectId: project.id, title, createdById: actor.userId, updatedById: actor.userId } });
  await writeDraftRevisionInTransaction(tx, { workspaceId: actor.workspaceId, userId: actor.userId, projectId: project.id, branchId: branch.id, primaryDraftBranchId: project.primaryDraftBranchId, expectedVersion: branch.version, title, body: preview.body, outline: [], origin: "HUMAN", originNote: `用户从已保存的 ${source.kind === "run" ? "ResearchRun" : "BenchmarkStudy"} ${source.id} 加入项目` });
  const sourceFields = source.kind === "run" ? { sourceResearchRunId: source.id } : { sourceBenchmarkStudyId: source.id };
  const artifact = await tx.artifact.create({ data: { workspaceId: actor.workspaceId, projectId: project.id, draftBranchId: branch.id, createdById: actor.userId, type: "TEXT", title, ...sourceFields } });
  await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, userId: actor.userId, action: "research.result_shared_to_project", resourceType: "artifact", resourceId: artifact.id, metadata: { projectId: project.id, sourceKind: source.kind, sourceId: source.id, sharedSourceCount: preview.sourceCount, sharedBlockCount: preview.blockCount } } });
  return artifact.id;
}
export function buildResearchSharePreview(title: string, blocks: ResearchBlock[], options: { explicitSelection?: boolean } = {}) {
  const sources = blocks.flatMap(block => block.type === "sources" ? block.refs : []).filter(source => shareableKinds.has(source.kind));
  const allowed = new Set(sources.map(source => source.ref));
  const privateRefs = new Set(blocks.flatMap(block => block.type === "sources" ? block.refs.filter(source => source.kind === "CREATOR_PROFILE").map(source => source.ref) : []));
  const selected = blocks.filter(block => block.type !== "sources" && (options.explicitSelection || block.sourceRefs.some(ref => allowed.has(ref)) && !block.sourceRefs.some(ref => privateRefs.has(ref))));
  if (!selected.length) return { body: "", sourceCount: 0, blockCount: 0, omitted: blocks.length };
  const used = new Set(selected.flatMap(block => block.sourceRefs.filter(ref => allowed.has(ref))));
  const lines = [`# ${title}`, "", ...(options.explicitSelection ? ["用户已主动挑选并审阅这些结论。结论可能包含个人判断，请按正文核对可见信息；私人原始背景与完整会话未附带。", ""] : []), "此文本由用户主动从已保存的研究成果加入项目。数据、系统计算与 AI 判断按原标记保留；缺失值和局限不作补齐。", ""];
  const label = { REAL_DATA: "来源记录", COMPUTED: "系统计算", AI_INTERPRETATION: "AI 判断" } as const;
  for (const block of selected) {
    lines.push(`## ${block.title} · ${block.limitation?.startsWith("这段文字经用户调整") ? "用户调整（原标记：" + label[block.provenance] + "）" : label[block.provenance]}`);
    if (block.type === "text") lines.push(block.text);
    else if (block.type === "metrics") for (const item of block.items) lines.push(`- ${item.label}：${item.value ?? "缺失"}${item.unit}（有效 ${item.validCount}/${item.denominator}；${item.method}）`);
    else if (block.type === "table") { lines.push(block.columns.join(" | ")); for (const row of block.rows) lines.push(row.cells.map(cell => cell ?? "缺失").join(" | ")); }
    else if (block.type === "bar_chart" || block.type === "line_chart") { lines.push(`图表口径：${block.method}`); for (const point of block.points) lines.push(`- ${point.label}：${point.value ?? "缺失"}${block.unit}`); }
    if (block.limitation) lines.push(`局限：${block.limitation}`);
    lines.push(`来源：${block.sourceRefs.filter(ref => used.has(ref)).join("、") || "个人输入或私人背景（原始内容未分享）"}`, "");
  }
  lines.push("## 可核验来源");
  if (!used.size) lines.push("本次没有可核验的外部来源，请把这些结论作为个人判断，而不是已验证事实。");
  const kindName: Record<string, string> = { MATERIAL: "资料", BENCHMARK_ACCOUNT: "对标账号", BENCHMARK_WORK: "对标作品", BENCHMARK_COMMENT: "评论样本", TREND: "趋势快照" };
  for (const source of sources.filter(source => used.has(source.ref))) lines.push(`- ${source.ref} ${source.title}（${kindName[source.kind] || "来源"}；采集 ${source.capturedAt ?? "未知"}；发布 ${source.publishedAt ?? "未知"}）${source.href ? ` ${source.href}` : ""}\n  ${source.excerpt}`);
  return { body: lines.join("\n"), sourceCount: used.size, blockCount: selected.length, omitted: blocks.length - selected.length };
}

export async function shareResearchRunToProject(actor: ResearchActor, runId: string, projectId: string, selection?: ResearchSelection) {
  await researchMember(actor, true);
  const chosen = selection ? await getSelectedResearch(actor, "run", runId, selection) : null;
  if (!projectId || projectId.length > 200) throw new ResearchError("INVALID_PROJECT", "请选择有效项目。", 400);
  if (!await db.researchRun.findFirst({ where: { id: runId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", ...(selection ? {} : { savedAt: { not: null } }), session: { workspaceId: actor.workspaceId, createdById: actor.userId } }, select: { id: true } })) throw new ResearchError("RESULT_NOT_FOUND", "只能共享自己已保存的完成研究成果。", 404);
  if (!await db.contentProject.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } })) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或已归档。", 404);
  const existing = await db.artifact.findFirst({ where: { workspaceId: actor.workspaceId, projectId, sourceResearchRunId: runId }, select: { id: true } });
  if (existing) return { ...await getArtifactForUser({ ...actor, projectId, artifactId: existing.id }), alreadyShared: true };
  let artifactId: string;
  try {
    artifactId = await db.$transaction(async tx => {
      const project = await tx.contentProject.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" }, workspace: { disabledAt: null, members: { some: { userId: actor.userId, disabledAt: null, user: { disabledAt: null }, role: { not: "VIEWER" } } } } }, select: { id: true, primaryDraftBranchId: true } });
      if (!project) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或没有写入权限。", 404);
      const run = await tx.researchRun.findFirst({ where: { id: runId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", ...(selection ? {} : { savedAt: { not: null } }), session: { workspaceId: actor.workspaceId, createdById: actor.userId } }, select: { id: true, resultTitle: true, question: true, blocks: true, version: true } });
      if (!run) throw new ResearchError("RESULT_NOT_FOUND", "只能共享自己已保存的完成研究成果。", 404);
      if (chosen && run.version !== chosen.version) throw new ResearchError("RESULT_CHANGED", "研究版本已变化，请重新审阅。", 409);
      if (selection) await tx.researchRun.updateMany({ where: { id: run.id, savedAt: null }, data: { savedAt: new Date() } });
      return createSharedArtifact(tx, actor, project, { kind: "run", id: run.id, title: run.resultTitle || run.question, blocks: chosen?.blocks ?? researchBlocksSchema.parse(run.blocks), userSelected: Boolean(chosen) });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
      const duplicate = await db.artifact.findFirst({ where: { workspaceId: actor.workspaceId, projectId, sourceResearchRunId: runId }, select: { id: true } });
      if (duplicate) return { ...await getArtifactForUser({ ...actor, projectId, artifactId: duplicate.id }), alreadyShared: true };
    }
    throw error;
  }
  return { ...await getArtifactForUser({ ...actor, projectId, artifactId }), alreadyShared: false };
}

export async function shareLegacyStudyToProject(actor: ResearchActor, studyId: string, projectId: string, selection?: ResearchSelection) {
  await researchMember(actor, true);
  const chosen = selection ? await getSelectedResearch(actor, "study", studyId, selection) : null;
  if (!projectId || projectId.length > 200) throw new ResearchError("INVALID_PROJECT", "请选择有效项目。", 400);
  const result = await getLegacyResearchResult(actor, studyId);
  if (!await db.contentProject.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } })) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或已归档。", 404);
  const existing = await db.artifact.findFirst({ where: { workspaceId: actor.workspaceId, projectId, sourceBenchmarkStudyId: studyId }, select: { id: true } });
  if (existing) return { ...await getArtifactForUser({ ...actor, projectId, artifactId: existing.id }), alreadyShared: true };
  let artifactId: string;
  try {
    artifactId = await db.$transaction(async tx => {
      const project = await tx.contentProject.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" }, workspace: { disabledAt: null, members: { some: { userId: actor.userId, disabledAt: null, user: { disabledAt: null }, role: { not: "VIEWER" } } } } }, select: { id: true, primaryDraftBranchId: true } });
      if (!project) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或没有写入权限。", 404);
      const study = await tx.benchmarkStudy.findFirst({ where: { id: studyId, workspaceId: actor.workspaceId, status: "COMPLETED", benchmarkAccount: { workspaceId: actor.workspaceId } }, select: { id: true, version: true, samples: { select: { sourceItem: { select: { workspaceId: true } } } } } });
      if (!study || study.samples.some(sample => sample.sourceItem.workspaceId !== actor.workspaceId)) throw new ResearchError("RESULT_NOT_FOUND", "历史研究不存在或不可访问。", 404);
      if (chosen && study.version !== chosen.version) throw new ResearchError("RESULT_CHANGED", "研究版本已变化，请重新审阅。", 409);
      return createSharedArtifact(tx, actor, project, { kind: "study", id: study.id, title: result.title, blocks: chosen?.blocks ?? result.blocks, userSelected: Boolean(chosen) });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
      const duplicate = await db.artifact.findFirst({ where: { workspaceId: actor.workspaceId, projectId, sourceBenchmarkStudyId: studyId }, select: { id: true } });
      if (duplicate) return { ...await getArtifactForUser({ ...actor, projectId, artifactId: duplicate.id }), alreadyShared: true };
    }
    throw error;
  }
  return { ...await getArtifactForUser({ ...actor, projectId, artifactId }), alreadyShared: false };
}
