export type CreativeBasisItem = {
  id: string;
  evidenceId: string | null;
  displayType: string;
  text: string;
  sourceTitle: string;
  sourceItemId: string | null;
  status: "ADOPTED" | "NEEDS_VERIFICATION";
  verificationRequired: boolean;
  provenanceType: "EVIDENCE" | "AI_SUGGESTION";
  excerpt: string | null;
  note: string | null;
};

export type CreativeBasisSummary = {
  totalCount: number;
  usableCount: number;
  needsVerificationCount: number;
  items: CreativeBasisItem[];
};

type EvidenceLike = {
  id: string;
  type: string;
  excerpt: string | null;
  claim: string | null;
  note: string | null;
  sourceItemId: string | null;
  sourceItem: { title: string | null } | null;
};

const labels: Record<string, string> = {
  FACT: "事实",
  VIEWPOINT: "观点",
  CASE: "案例",
  DATA: "数据",
  QUOTE: "引用",
  EXPERIENCE: "经历",
  QUESTION: "问题",
  OTHER: "参考信息",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function gapText(value: unknown) {
  if (value === "SOURCE_REFERENCE_GAP") return "有部分建议缺少充分素材依据。";
  if (typeof value === "string") return value.trim();
  const item = record(value);
  return item ? text(item.text) || text(item.message) || text(item.description) : "";
}

function stableId(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

export function buildCreativeBasisSummary(input: { evidence: EvidenceLike[]; unifiedAnalysisOutput?: unknown; dismissedIds?: string[] }): CreativeBasisSummary {
  const evidenceItems = input.evidence.flatMap<CreativeBasisItem>((item) => {
    const content = item.claim?.trim() || item.excerpt?.trim() || item.note?.trim();
    if (!content) return [];
    return [{
      id: `evidence:${item.id}`,
      evidenceId: item.id,
      displayType: labels[item.type] || "参考信息",
      text: content,
      sourceTitle: item.sourceItem?.title?.trim() || "人工确认",
      sourceItemId: item.sourceItemId,
      status: "ADOPTED",
      verificationRequired: false,
      provenanceType: "EVIDENCE",
      excerpt: item.excerpt,
      note: item.note,
    }];
  });
  const output = record(input.unifiedAnalysisOutput);
  const gaps = Array.isArray(output?.groundingGaps) ? output.groundingGaps : [];
  const confirmedText = new Set(evidenceItems.map((item) => item.text.trim().toLocaleLowerCase()));
  const dismissedIds = new Set(input.dismissedIds ?? []);
  const gapItems = gaps.flatMap<CreativeBasisItem>((value) => {
    const content = gapText(value);
    const id = `source-gap:${stableId(content)}`;
    if (!content || confirmedText.has(content.toLocaleLowerCase()) || dismissedIds.has(id)) return [];
    return [{
      id,
      evidenceId: null,
      displayType: "待核实建议",
      text: content,
      sourceTitle: "AI 建议（暂无可靠素材支持）",
      sourceItemId: null,
      status: "NEEDS_VERIFICATION",
      verificationRequired: true,
      provenanceType: "AI_SUGGESTION",
      excerpt: null,
      note: "这条内容来自 AI 建议，目前没有可靠参考素材支持。",
    }];
  });
  const items = [...evidenceItems, ...gapItems];
  return {
    totalCount: items.length,
    usableCount: evidenceItems.length,
    needsVerificationCount: gapItems.length,
    items,
  };
}
