export type ResearchProvenance = "REAL_DATA" | "COMPUTED" | "AI_INTERPRETATION";
export type ResearchSource = {
  ref: string;
  kind: "MATERIAL" | "BENCHMARK_ACCOUNT" | "BENCHMARK_WORK" | "BENCHMARK_COMMENT" | "TREND" | "PROJECT_ARTIFACT" | "USER_INPUT" | "CREATOR_PROFILE";
  objectId: string;
  title: string;
  href: string | null;
  capturedAt: string | null;
  publishedAt: string | null;
  eventAt: string | null;
  contentOrigin: "ORIGINAL" | "MACHINE_TRANSCRIPT" | "AI_READING" | "USER_PROVIDED";
  locator: string | null;
  excerpt: string;
  version: string | null;
};
export type ResearchBlockBase = {
  id: string;
  title: string;
  provenance: ResearchProvenance;
  sourceRefs: string[];
  limitation: string | null;
};
export type ResearchBlock = ResearchBlockBase & (
  | { type: "text"; text: string }
  | { type: "metrics"; items: Array<{ label: string; value: number | null; unit: string; validCount: number; denominator: number; method: string }> }
  | { type: "table"; columns: string[]; rows: Array<{ cells: Array<string | number | null>; sourceRefs: string[] }> }
  | { type: "bar_chart" | "line_chart"; unit: string; method: string; points: Array<{ label: string; value: number | null; sourceRefs: string[] }>; lowerIsBetter: boolean }
  | { type: "sources"; refs: ResearchSource[] }
);
export type ResearchCoverage = {
  requested: number;
  observed: number;
  readable: number;
  timed: number;
  visual: number;
  aiSampleCount: number;
  truncated: boolean;
  sampling: "SELECTED" | "WINDOW" | "HIGH_PERFORMANCE";
  timeRange: { from: string | null; to: string | null };
  gaps: string[];
};
export const RESEARCH_PROVENANCE_LABELS: Record<ResearchProvenance, string> = { REAL_DATA: "来源记录", COMPUTED: "系统计算", AI_INTERPRETATION: "AI 判断" };
export const RESEARCH_ENTRY_LABELS = { DIRECT: "直接问 AI", BREAKDOWN: "内容拆解", OPPORTUNITY: "选题机会", BENCHMARK: "对标研究" } as const;
