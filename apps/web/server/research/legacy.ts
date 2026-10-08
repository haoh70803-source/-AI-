import "server-only";
import { db } from "@content-center/db";
import { benchmarkAnalysisOutputSchema, benchmarkCreatorProfileOutputSchema, benchmarkCreatorProfileOutputV2Schema, benchmarkCreatorProfileOutputV3Schema, benchmarkCreatorProfileOutputV4Schema, benchmarkPlaybookOutputSchema } from "@content-center/providers";
import type { ResearchBlock, ResearchSource } from "@content-center/core";
import { researchMember, ResearchError, type ResearchActor } from "./access";
import { validateResearchBlocks } from "./contracts";

export async function getLegacyResearchResult(actor: ResearchActor, studyId: string) {
  await researchMember(actor);
  const study = await db.benchmarkStudy.findFirst({ where: { id: studyId, workspaceId: actor.workspaceId, status: "COMPLETED", benchmarkAccount: { workspaceId: actor.workspaceId } }, include: { benchmarkAccount: { select: { id: true, name: true } }, samples: { include: { sourceItem: { select: { id: true, workspaceId: true, title: true } } } } } });
  if (!study || study.samples.some(sample => sample.sourceItem.workspaceId !== actor.workspaceId)) throw new ResearchError("NOT_FOUND", "历史研究不存在或不可访问。", 404);
  const sources: ResearchSource[] = study.samples.map((sample, index) => ({ ref: `S${index + 1}`, kind: "MATERIAL", objectId: sample.sourceItemId, title: sample.sourceItem.title || "历史资料", href: `/library/${sample.sourceItemId}`, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "AI_READING", locator: "旧研究的样本引用；不代表本次重新读取", excerpt: "", version: sample.materialAnalysisId }));
  const sourceMap = new Map(study.samples.flatMap((sample, index) => [[sample.id, sources[index]!.ref], [sample.sourceItemId, sources[index]!.ref]]));
  const refs = (ids: string[]) => [...new Set(ids.flatMap(id => sourceMap.has(id) ? [sourceMap.get(id)!] : []))];
  const blocks: ResearchBlock[] = [];
  const add = (title: string, text: string, ids: string[]) => { if (text.trim()) blocks.push({ id: `legacy-${blocks.length}`, type: "text", title, text, provenance: "AI_INTERPRETATION", sourceRefs: refs(ids), limitation: "这是已保存的历史 AI 研究，仅适用于当时所选样本；未重新采集或扩大为账号整体结论。" }); };
  const analysis = benchmarkAnalysisOutputSchema.safeParse(study.output);
  const playbook = benchmarkPlaybookOutputSchema.safeParse(study.output);
  const v4 = benchmarkCreatorProfileOutputV4Schema.safeParse(study.output);
  const v3 = benchmarkCreatorProfileOutputV3Schema.safeParse(study.output);
  const v2 = benchmarkCreatorProfileOutputV2Schema.safeParse(study.output);
  const v1 = benchmarkCreatorProfileOutputSchema.safeParse(study.output);
  const labels: Record<string, string> = { PROFILE: "账号定位观察", CONTENT_MIX: "内容方向", TOPIC_STYLE: "选题规律", CONTENT_STYLE: "表达与信任", RECURRING_VIEWPOINT: "反复表达的观点", LEARN: "可借鉴的部分", AVOID: "不可照搬的部分", POSITIONING: "定位观察", AUDIENCE: "受众观察", THEME: "主题观察", TOPIC_PATTERN: "选题特点", VIDEO_STYLE: "内容形式", EVIDENCE_STYLE: "论证方式", ATTENTION_TRUST: "关注与信任", METHOD_TENDENCY: "方法倾向" };
  if (analysis.success) {
    for (const [key, title] of [["topicDirections", "主题方向"], ["openingPatterns", "开头"], ["structures", "内容结构"], ["persuasionMethods", "论证"], ["expressionHabits", "表达"], ["endings", "结尾"], ["exceptions", "例外与局限"]] as const) for (const item of analysis.data[key]) {
      add(`${title} · ${item.name}`, item.summary, item.evidence.map(evidence => evidence.sampleId));
      for (const evidence of item.evidence) { const source = sources.find(source => source.ref === sourceMap.get(evidence.sampleId)); if (source) source.excerpt = [source.excerpt, evidence.quote].filter(Boolean).join("\n").slice(0, 1200); }
    }
  } else if (playbook.success) {
    for (const item of playbook.data.playbooks) add(item.name, [`组成：${item.elements.join("；")}`, `展开：${item.flow}`, `适用：${item.useCase}`, `例外：${item.exceptions}`, `不可照搬：${item.doNotCopy}`].join("\n\n"), item.evidence.map(evidence => evidence.sourceItemId));
  } else if (v4.success || v3.success) {
    const cards = v4.success ? v4.data.cards : v3.success ? v3.data.cards : [];
    for (const card of cards) for (const claim of card.claims) add(labels[card.code] || "历史研究判断", claim.text, claim.evidence.map(evidence => evidence.sourceItemId));
  } else if (v2.success) {
    for (const card of v2.data.cards) add(labels[card.code] || "历史研究判断", card.text, card.evidence.map(evidence => evidence.sourceItemId));
  } else if (v1.success) {
    for (const section of v1.data.sections) add(labels[section.code] || "历史研究判断", section.text, section.evidence.map(evidence => evidence.sourceItemId));
  }
  if (!blocks.length) blocks.push({ id: "legacy-empty", type: "text", title: "历史记录保留", text: "这条旧研究没有可适配的结论正文。样本引用仍可核对，可基于这些资料重新开展研究。", provenance: "REAL_DATA", sourceRefs: [], limitation: "未将未知格式或输入清单冒充研究成果。" });
  blocks.push({ id: "sources", type: "sources", title: "当时的样本与来源", provenance: "REAL_DATA", sourceRefs: sources.map(source => source.ref), limitation: `保存的样本数：${study.sampleCount}；可追溯样本关系：${sources.length}。不代表账号全量。`, refs: sources });
  return { id: study.id, version: study.version, title: `${study.benchmarkAccount.name} · 历史研究 ${study.version}`, createdAt: study.createdAt, accountId: study.benchmarkAccountId, sampleCount: study.sampleCount, traceableCount: sources.length, blocks: validateResearchBlocks(blocks, sources) };
}
