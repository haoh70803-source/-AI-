import { z } from "zod";
import type { ResearchBlock, ResearchSource } from "@content-center/core";
import { researchAnswerSchema, validateResearchAnswer } from "./contracts";

const ref = z.string().trim().min(1).max(200);
const statement = z.string().trim().min(1).max(2000);
const cited = { sourceRefs: z.array(ref).min(1).max(100), limitation: statement };
export const breakdownAnswerSchema = researchAnswerSchema.extend({ breakdowns: z.array(z.object({ materialRef: ref, audienceTask: statement, openingPromise: statement, structure: statement, coreClaims: statement, evidence: statement, turn: statement, cta: statement, conditions: statement, doNotCopy: statement, ...cited }).strict()).min(1).max(10), comparison: z.object({ commonalities: statement, differences: statement, transferable: statement, ...cited }).strict().nullable().default(null) }).strict();
export const benchmarkAnswerSchema = researchAnswerSchema.extend({ accountFindings: z.array(z.object({ accountId: ref, sampleScope: z.enum(["WINDOW", "HISTORY"]), audienceTask: statement, themes: statement, openings: statement, structure: statement, directionChange: statement, transferable: statement, doNotCopy: statement, ...cited }).strict()).min(1).max(3) }).strict();
export const opportunityAnswerSchema = researchAnswerSchema.extend({ topics: z.array(z.object({ title: statement, audienceTask: statement, coreBenefit: statement, angle: statement, whyNow: statement, trendRefs: z.array(ref).max(10), benchmarkRefs: z.array(ref).max(20), historyRefs: z.array(ref).max(20), profileRefs: z.array(ref).max(5), evidenceGaps: z.array(statement).min(1).max(10), nextValidation: statement, evergreen: z.boolean(), ...cited }).strict()).min(1).max(5) }).strict();
export type ResearchMode = "DIRECT" | "BREAKDOWN" | "BENCHMARK" | "OPPORTUNITY";
export function researchModeSchema(mode: ResearchMode) { return mode === "BREAKDOWN" ? breakdownAnswerSchema : mode === "BENCHMARK" ? benchmarkAnswerSchema : mode === "OPPORTUNITY" ? opportunityAnswerSchema : researchAnswerSchema; }
export function researchModeInstruction(mode: ResearchMode) {
  if (mode === "BREAKDOWN") return "输出 sections、breakdowns 和 comparison。每个 breakdown 对应实际读到的 Material，逐项说明观众任务、开头承诺、结构、观点、证据、转折、CTA、适用条件和不可照搬部分。无正文时不得猜测内容。只有一条可读材料时 comparison=null；多条材料时比较共性、差异与可借鉴条件，至少引用两条实际材料。";
  if (mode === "BENCHMARK") return "输出 sections 和 accountFindings。每个账号明确 WINDOW 或 HISTORY 样本，不得把单条或仅高表现样本说成账号整体策略。给出观众任务、主题、开头、结构、方向变化证据、可借鉴与不可照搬的条件。没有纵向样本时在 directionChange 说明无法判断；没有正文时不得猜测开头或结构。";
  if (mode === "OPPORTUNITY") return "输出 sections 和 topics。每个选题必须包含观众任务、核心收益、切口、为什么现在值得做、趋势/对标/已有内容/IP 依据来源、证据缺口与下一步验证动作。没有适合热点时可给 evergreen=true 的常青选题，whyNow 说明持续需求。不得输出爆款概率、成功率或凭空分数。";
  return "输出 sections，解释已选来源能支持什么、不能支持什么，并给出下一步核验建议。";
}

export function validateAndRenderModeAnswer(mode: ResearchMode, value: unknown, sources: ResearchSource[], evidenceByRef: Record<string, string>, accountSampleKinds: Record<string, "WINDOW" | "HISTORY"> = {}, readableWorkRefs: string[] = []) {
  const parsed = z.object({ sections: researchAnswerSchema.shape.sections }).passthrough().parse(value);
  const sections = [...parsed.sections];
  const blocks: ResearchBlock[] = [];
  const ensureRefs = (refs: string[], kind?: ResearchSource["kind"]) => {
    for (const item of refs) if (!sources.some(source => source.ref === item && (!kind || source.kind === kind))) throw new Error("RESEARCH_UNKNOWN_SOURCE");
  };
  const breakdown = mode === "BREAKDOWN" ? breakdownAnswerSchema.parse(value) : null;
  if (breakdown) for (const [index, item] of breakdown.breakdowns.entries()) {
    ensureRefs([item.materialRef], "MATERIAL"); ensureRefs(item.sourceRefs);
    if (!item.sourceRefs.includes(item.materialRef)) throw new Error("RESEARCH_MISSING_MATERIAL_CITATION");
    if (!evidenceByRef[item.materialRef]?.trim()) throw new Error("RESEARCH_UNREADABLE_MATERIAL");
    const text = `观众任务：${item.audienceTask}\n开头承诺：${item.openingPromise}\n内容结构：${item.structure}\n核心观点：${item.coreClaims}\n证据：${item.evidence}\n转折：${item.turn}\nCTA：${item.cta}\n适用条件：${item.conditions}\n不可照搬：${item.doNotCopy}`;
    sections.push({ title: `内容拆解：${sources.find(source => source.ref === item.materialRef)!.title}`, text, sourceRefs: item.sourceRefs, limitation: item.limitation });
    blocks.push({ id: `breakdown-${index}`, type: "text", title: sections.at(-1)!.title, text, sourceRefs: item.sourceRefs, limitation: item.limitation, provenance: "AI_INTERPRETATION" });
  }
  if (breakdown) {
    const materialRefs = sources.filter(source => source.kind === "MATERIAL" && evidenceByRef[source.ref]?.trim()).map(source => source.ref);
    if (materialRefs.length > 1 && !breakdown.comparison) throw new Error("RESEARCH_COMPARISON_REQUIRED");
    if (breakdown.comparison) {
      ensureRefs(breakdown.comparison.sourceRefs, "MATERIAL");
      if (breakdown.comparison.sourceRefs.filter(ref => materialRefs.includes(ref)).length < 2) throw new Error("RESEARCH_COMPARISON_SOURCES_REQUIRED");
      const text = `共性：${breakdown.comparison.commonalities}\n差异：${breakdown.comparison.differences}\n可借鉴条件：${breakdown.comparison.transferable}`;
      sections.push({ title: "多条内容比较", text, sourceRefs: breakdown.comparison.sourceRefs, limitation: breakdown.comparison.limitation });
      blocks.push({ id: "breakdown-comparison", type: "text", title: "多条内容比较", text, sourceRefs: breakdown.comparison.sourceRefs, limitation: breakdown.comparison.limitation, provenance: "AI_INTERPRETATION" });
    }
  }
  if (mode === "BENCHMARK") for (const [index, item] of benchmarkAnswerSchema.parse(value).accountFindings.entries()) {
    const account = sources.find(source => source.kind === "BENCHMARK_ACCOUNT" && source.objectId === item.accountId);
    if (!account) throw new Error("RESEARCH_UNKNOWN_ACCOUNT");
    if (accountSampleKinds[item.accountId] !== item.sampleScope) throw new Error("RESEARCH_SAMPLE_SCOPE_MISMATCH");
    ensureRefs(item.sourceRefs);
    if (!item.sourceRefs.includes(account.ref)) throw new Error("RESEARCH_MISSING_ACCOUNT_CITATION");
    const hasBody = item.sourceRefs.some(ref => readableWorkRefs.includes(ref));
    const text = `样本口径：${item.sampleScope === "WINDOW" ? "时间窗口样本" : "历史保存作品样本"}\n观众任务：${item.audienceTask}\n主题观察：${hasBody ? item.themes : "仅有作品标题或元数据，未分析正文主题"}\n开头观察：${hasBody ? item.openings : "缺少可读正文，无法判断开头类型"}\n内容结构：${hasBody ? item.structure : "缺少可读正文，无法判断内容结构"}\n方向变化：缺少可比较的连续样本批次，当前无法判断账号方向变化\n可借鉴：${item.transferable}\n不可照搬：${item.doNotCopy}`;
    sections.push({ title: `账号研究：${account.title}`, text, sourceRefs: item.sourceRefs, limitation: item.limitation });
    blocks.push({ id: `account-finding-${index}`, type: "text", title: sections.at(-1)!.title, text, sourceRefs: item.sourceRefs, limitation: item.limitation, provenance: "AI_INTERPRETATION" });
  }
  if (mode === "OPPORTUNITY") for (const [index, item] of opportunityAnswerSchema.parse(value).topics.entries()) {
    ensureRefs(item.sourceRefs); ensureRefs(item.trendRefs, "TREND"); ensureRefs(item.historyRefs, "PROJECT_ARTIFACT"); ensureRefs(item.profileRefs, "CREATOR_PROFILE");
    for (const ref of item.benchmarkRefs) if (!sources.some(source => source.ref === ref && (source.kind === "BENCHMARK_ACCOUNT" || source.kind === "BENCHMARK_WORK"))) throw new Error("RESEARCH_UNKNOWN_BENCHMARK_SOURCE");
    const cited = new Set(item.sourceRefs);
    if ([...item.trendRefs, ...item.benchmarkRefs, ...item.historyRefs, ...item.profileRefs].some(ref => !cited.has(ref))) throw new Error("RESEARCH_MISSING_TOPIC_CITATION");
    const titles = (refs: string[]) => refs.map(ref => sources.find(source => source.ref === ref)!.title).join("、") || "暂无";
    const text = `观众任务：${item.audienceTask}\n核心收益：${item.coreBenefit}\n推荐切口：${item.angle}\n为什么现在值得做：${item.whyNow}\n类型：${item.evergreen ? "常青选题" : "时效选题"}\n趋势依据：${titles(item.trendRefs)}\n对标依据：${titles(item.benchmarkRefs)}\n已有内容依据：${titles(item.historyRefs)}\n个人背景依据：${titles(item.profileRefs)}\n证据缺口：${item.evidenceGaps.join("；")}\n下一步验证：${item.nextValidation}`;
    sections.push({ title: `选题：${item.title}`, text, sourceRefs: item.sourceRefs, limitation: item.limitation });
    blocks.push({ id: `topic-${index}`, type: "text", title: `选题：${item.title}`, text, sourceRefs: item.sourceRefs, limitation: item.limitation, provenance: "AI_INTERPRETATION" });
  }
  validateResearchAnswer({ sections }, sources, evidenceByRef);
  return { sections: mode === "DIRECT" ? parsed.sections : [], blocks };
}
