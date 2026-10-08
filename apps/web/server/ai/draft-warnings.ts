import "server-only";

import { db } from "@content-center/db";
import { materialAnalysisOutputSchema } from "../material-analysis/schemas";
import { findSourceOverlaps } from "./writing-methods/source-overlap";

export type DraftWarning = { code: "UNCERTAIN_REFERENCE" | "POSSIBLE_SOURCE_COPY" | "UNVERIFIED_REFERENCE_CLAIM"; message: string; reason: string; suggestion: string };

export function warningKey(warning: Pick<DraftWarning, "code" | "message">) { return `${warning.code}:${warning.message}`; }

function signals(value: string) { return value.match(/\d+(?:\.\d+)?%?|百分之[^，。！？\s]+|[一二三四五六七八九十百千万]+(?:个|元|万|亿)/g) ?? []; }

export function warningsFromUnderstanding(input: { body: string; understandings: unknown[]; sourceTexts: string[] }): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  for (const value of input.understandings) {
    const parsed = materialAnalysisOutputSchema.safeParse(value);
    if (!parsed.success) continue;
    for (const item of parsed.data.uncertain) warnings.push({ code: "UNCERTAIN_REFERENCE", message: `参考素材中的“${item.content.slice(0, 40)}”仍需确认。`, reason: item.reason, suggestion: "核对原始转写或补充可靠来源后再使用。" });
    for (const item of parsed.data.doNotCopy) {
      const copiedSignal = signals(item.content).some((signal) => input.body.includes(signal));
      if (copiedSignal || (item.content.length >= 12 && input.body.includes(item.content.slice(0, 12)))) warnings.push({ code: "UNVERIFIED_REFERENCE_CLAIM", message: "稿件可能使用了参考素材中不应直接采用的案例或说法。", reason: item.reason, suggestion: "改写为自己的表达，或先核实案例依据。" });
    }
  }
  if (findSourceOverlaps(input.body, input.sourceTexts).length) warnings.push({ code: "POSSIBLE_SOURCE_COPY", message: "稿件与参考素材存在较长的相同表达，请人工确认。", reason: "部分表达与参考素材重复，可能会误用原文。", suggestion: "保留观点即可，用自己的语言重新表达。" });
  return warnings.filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code && candidate.message === item.message) === index);
}

export async function buildDraftWarnings(input: { workspaceId: string; projectId: string; body: string }): Promise<DraftWarning[]> {
  const rows = await db.projectSource.findMany({ where: { projectId: input.projectId, project: { workspaceId: input.workspaceId } }, select: { sourceItem: { select: { rawText: true, transcript: { select: { fullText: true } }, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { understanding: true } } } } } });
  const sourceTexts = rows.map(({ sourceItem }) => sourceItem.transcript?.fullText || sourceItem.rawText || "").filter(Boolean);
  return warningsFromUnderstanding({ body: input.body, sourceTexts, understandings: rows.map(({ sourceItem }) => sourceItem.materialAnalyses[0]?.understanding) });
}
