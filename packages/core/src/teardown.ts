import type { ResearchBlock, ResearchSource } from "./research";

export const TEARDOWN_SCHEMA = "douyin-teardown-v1";
export const TEARDOWN_LIMITATION = "以下是基于转写的 AI 解释，不能证明播放留存、完播或互动的因果关系；未分析画面、配乐和创作者后台数据。转写可能有误，请结合原视频核对。";
export const TEARDOWN_STAGES = ["MATERIAL", "TRANSCRIPTION", "BASELINE", "ANALYSIS", "COMPLETED"] as const;
export const TEARDOWN_VIRALITY_ANGLES = ["受众需求", "内容辨识度", "情绪共鸣", "收藏价值", "分享动机", "传播条件", "注意钩子", "利益承诺", "具体示范", "信任建立", "互动引导"] as const;
export type TeardownTrendContext = { checkedAt: string; gap: string | null; sources: Array<{ id: string; title: string; platform: string; observedAt: string; windowStart: string; windowEnd: string }> };
export type TeardownStage = typeof TEARDOWN_STAGES[number];
export type TimedText = { id: number; startMs: number; endMs: number; text: string };
export type TeardownWork = {
  externalId: string | null; title: string; authorId: string | null; authorName: string | null;
  publicDataStatus?: "AVAILABLE" | "UNAVAILABLE";
  url: string; publishedAt: string | null; capturedAt: string;
  metrics: { likes: number | null; comments: number | null; shares: number | null; favorites: number | null; views: number | null };
};
export type BaselineSample = { externalId: string; authorId: string | null; title: string; url: string; publishedAt: string | null; likes: number | null; pinned: boolean | null };
export const TEARDOWN_BASELINE_POLICY = { recentDays: 60, maxSamples: 60, minSamples: 20, minMedian: 50, maxPages: 3 } as const;
export type TeardownBaseline = {
  samples: BaselineSample[]; excluded: number; median: number | null; multiple: number | null;
  capturedAt: string; gaps: string[]; policy: typeof TEARDOWN_BASELINE_POLICY;
};
export type TeardownAnalysis = {
  thesis: string; thesisSegmentId: number;
  sections: Array<{ startId: number; endId: number; label: "钩子" | "承诺" | "论点" | "案例" | "跑题" | "收束" | "引导"; servesThesis: boolean; summary: string; reason: string }>;
  strengths: Array<{ explanation: string; segmentId: number }>;
  distractions: Array<{ explanation: string; segmentId: number }>;
  virality?: Array<{ angle: typeof TEARDOWN_VIRALITY_ANGLES[number]; explanation: string; segmentId?: number }>;
  trendAssessment?: { status: "RELATED" | "NO_MATCH" | "UNVERIFIED"; explanation: string; sourceIds: string[] };
};
export type TeardownReport = {
  schema: typeof TEARDOWN_SCHEMA; sourceItemId: string; transcriptId: string; generatedAt: string; model: string;
  work: TeardownWork; baseline: TeardownBaseline; transcript: TimedText[]; analysis: TeardownAnalysis; trendContext?: TeardownTrendContext;
};
export type TeardownState = { schema: typeof TEARDOWN_SCHEMA; sourceItemId: string; inputUrl?: string; ingestJobId: string | null; transcriptionJobId?: string; transcriptionWait?: { startedAt: string; finishedAt?: string }; lastStage?: TeardownStage; work?: TeardownWork; baseline?: TeardownBaseline; report?: TeardownReport; trendContext?: TeardownTrendContext };

export function readTeardownState(value: unknown): TeardownState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<TeardownState>;
  return state.schema === TEARDOWN_SCHEMA && typeof state.sourceItemId === "string" ? state as TeardownState : null;
}

/** IDs and timestamps come only from the stored ASR evidence, never from the model. */
export function timedTranscript(value: unknown): TimedText[] {
  if (!Array.isArray(value) || !value.length || value.length > 2500) throw new Error("TEARDOWN_TIMESTAMPS_REQUIRED");
  const result = value.map((entry, id) => {
    const row = entry as Record<string, unknown>;
    if (!row || typeof row.startMs !== "number" || typeof row.endMs !== "number" || !Number.isFinite(row.startMs) || !Number.isFinite(row.endMs) || row.startMs < 0 || row.endMs <= row.startMs || typeof row.text !== "string" || !row.text.trim()) throw new Error("TEARDOWN_TIMESTAMPS_REQUIRED");
    return { id, startMs: row.startMs, endMs: row.endMs, text: row.text };
  });
  if (result.some((row, index) => index > 0 && row.startMs < result[index - 1]!.startMs)) throw new Error("TEARDOWN_TIMESTAMPS_REQUIRED");
  if (result.reduce((size, row) => size + row.text.length, 0) > 60000 || result.some(row => row.text.length > 4000)) throw new Error("TEARDOWN_CONTENT_TOO_LONG");
  return result;
}

export function compareAuthorLikes(work: TeardownWork, input: BaselineSample[], capturedAt: string, gaps: string[] = []): TeardownBaseline {
  const policy = TEARDOWN_BASELINE_POLICY;
  const end = Date.parse(capturedAt), start = end - policy.recentDays * 86400000;
  const seen = new Set<string>();
  const valid = input.filter(sample => {
    const published = Date.parse(sample.publishedAt ?? "");
    if (!work.authorId || sample.authorId !== work.authorId || sample.externalId === work.externalId || seen.has(sample.externalId) || sample.pinned === true || sample.likes === null || !Number.isFinite(sample.likes) || sample.likes < 0 || !Number.isFinite(published) || published < start || published > end) return false;
    seen.add(sample.externalId); return true;
  }).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!)).slice(0, policy.maxSamples);
  const values = valid.map(row => row.likes!).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length ? (values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2) : null;
  const notes = [...gaps];
  if (valid.length < policy.minSamples) notes.push(`有效样本 ${valid.length} 条，少于 ${policy.minSamples} 条，不计算表现倍数。`);
  if (median !== null && median < policy.minMedian) notes.push(`中位点赞小于 ${policy.minMedian}，不计算表现倍数。`);
  if (valid.some(sample => sample.pinned === null)) notes.push("部分作品未返回置顶标识，无法完整排除置顶作品。" );
  notes.push("按采集时的公开累计点赞比较；作品发布时间不同，未按曝光量或发布时长校正，不能据此认定爆款或归因。" );
  const likes = work.metrics.likes;
  return { samples: valid, excluded: input.length - valid.length, median, multiple: valid.length >= policy.minSamples && median !== null && median >= policy.minMedian && likes !== null && Number.isFinite(likes) && likes >= 0 ? likes / median : null, capturedAt, gaps: [...new Set(notes)], policy };
}

export function validateTeardownAnalysis(analysis: TeardownAnalysis, transcript: TimedText[], metricEvidence?: unknown, trendContext?: TeardownTrendContext): TeardownAnalysis {
  if (!transcript.length || !analysis.sections.length) throw new Error("TEARDOWN_INCOMPLETE_SEGMENTS");
  let next = 0;
  for (const section of analysis.sections) {
    if (!Number.isInteger(section.startId) || !Number.isInteger(section.endId) || section.startId !== next || section.endId < section.startId || section.endId >= transcript.length) throw new Error("TEARDOWN_INCOMPLETE_SEGMENTS");
    next = section.endId + 1;
  }
  if (next !== transcript.length) throw new Error("TEARDOWN_INCOMPLETE_SEGMENTS");
  for (const id of [analysis.thesisSegmentId, ...analysis.strengths.map(row => row.segmentId), ...analysis.distractions.map(row => row.segmentId), ...(analysis.virality ?? []).flatMap(row => row.segmentId === undefined ? [] : [row.segmentId])]) {
    if (!Number.isInteger(id) || !transcript[id]) throw new Error("TEARDOWN_UNKNOWN_QUOTE");
  }
  const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)*(?:[%％])?/g) ?? []).map(value => `${Number(value.replaceAll(",", "").replace(/[%％]$/, ""))}${/[%％]$/.test(value) ? "%" : ""}`);
  const known = new Set(numbers(`${transcript.map(row => row.text).join("\n")}\n${JSON.stringify(metricEvidence ?? {})}\n${JSON.stringify(trendContext ?? {})}`));
  const prose = [analysis.thesis, ...analysis.sections.flatMap(row => [row.summary, row.reason]), ...analysis.strengths.map(row => row.explanation), ...analysis.distractions.map(row => row.explanation), ...(analysis.virality ?? []).map(row => row.explanation), analysis.trendAssessment?.explanation ?? ""].join("\n");
  const unsupportedNumbers = [...new Set(numbers(prose).filter(value => !known.has(value)))];
  if (unsupportedNumbers.length) throw new Error("TEARDOWN_UNSUPPORTED_NUMBER", { cause: { unsupportedNumbers: unsupportedNumbers.slice(0, 12) } });
  const trend = analysis.trendAssessment;
  if (trend && (trend.sourceIds.some(id => !trendContext?.sources.some(source => source.id === id)) || (trend.status === "RELATED" && !trend.sourceIds.length) || (!trendContext?.sources.length && trend.status !== "UNVERIFIED"))) throw new Error("TEARDOWN_UNSUPPORTED_TREND");
  const normalize = (text: string) => text.replace(/[\s\p{P}]/gu, "");
  if ((analysis.virality ?? []).some(row => analysis.strengths.some(strength => normalize(strength.explanation) === normalize(row.explanation)))) throw new Error("TEARDOWN_DUPLICATE_INSIGHT");
  return analysis;
}
export function teardownTimestamp(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function teardownInteractionRatios(metrics: TeardownWork["metrics"]) {
  const ratio = (count: number | null) => metrics.likes !== null && Number.isFinite(metrics.likes) && metrics.likes > 0 && count !== null && Number.isFinite(count) && count >= 0 ? count / metrics.likes * 100 : null;
  return { favorites: ratio(metrics.favorites), shares: ratio(metrics.shares), comments: ratio(metrics.comments) };
}
export function teardownPercentage(value: number | null) { return value === null ? "不可用" : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%`; }
/** Missing historical propagation analysis stays missing; never copy craft findings into it. */
export function teardownViralityFindings(analysis: TeardownAnalysis) {
  return analysis.virality ?? [];
}
/** Display and export derived facts without asking the model to invent metrics or times. */
export function teardownReportOverview(report: TeardownReport) {
  const { transcript, analysis, work } = report;
  const durationMs = Math.max(0, ...transcript.map(row => row.endMs));
  const sections = analysis.sections.map(section => {
    const startMs = transcript[section.startId]!.startMs, endMs = transcript[section.endId]!.endMs;
    return { ...section, startMs, endMs, durationMs: endMs - startMs };
  });
  const intervals = sections.filter(section => !section.servesThesis || section.label === "跑题").map(section => [section.startMs, section.endMs] as const).sort((a, b) => a[0] - b[0]);
  let detourMs = 0, mergedEnd = 0;
  for (const [start, end] of intervals) { detourMs += Math.max(0, end - Math.max(start, mergedEnd)); mergedEnd = Math.max(mergedEnd, end); }
  return { durationMs, sections, detourMs, detourPercent: durationMs > 0 ? detourMs / durationMs * 100 : null, ratios: teardownInteractionRatios(work.metrics) };
}
const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
const quote = (row: TimedText) => `> ${row.text.replaceAll("\n", "\n> ")}（${teardownTimestamp(row.startMs)}）`;

/** Adapted report structure from zinan92/douyin-teardown (MIT); prose is generated from this run's evidence. */
export function renderTeardownMarkdown(report: TeardownReport) {
  const { work, baseline, analysis, transcript } = report;
  const overview = teardownReportOverview(report);
  const ratioText = teardownPercentage;
  const dataSource = work.publicDataStatus === "UNAVAILABLE" ? "公开数据未取得，数据不足，无法比较作者近期表现；正文分析依据已保存转写。" : `红狐 · 作品采集 ${work.capturedAt} · 样本采集 ${baseline.capturedAt}。`;
  const lines = [`# ${work.title}`, "", `作者：${work.authorName ?? "未返回"}`, `原作品：${work.url}`, `生成时间：${report.generatedAt} · 模型：${report.model}`, "", "## 数据", "", "| 指标 | 数值 |", "| --- | --- |", ...Object.entries(work.metrics).map(([key, value]) => `| ${{ likes: "点赞", comments: "评论", shares: "分享", favorites: "收藏", views: "播放" }[key]} | ${value ?? "未返回"} |`), `| 作者近期有效样本 | ${baseline.samples.length} |`, `| 作者近期点赞中位数 | ${baseline.median ?? "不可用"} |`, `| 相对中位数倍数 | ${baseline.multiple === null ? "不计算" : baseline.multiple.toFixed(2)} |`, "", `数据来源：${dataSource}最近 ${baseline.policy.recentDays} 天，最多 ${baseline.policy.maxSamples} 条；排除本作品、重复、已知置顶、作者不匹配和缺失数据。`, ...baseline.gaps.map(gap => `- ${gap}`), "", "## 主线一句话", "", analysis.thesis, "", quote(transcript[analysis.thesisSegmentId]!), "", "## 分段时间轴", "", "| 时间 | 标签 | 服务主线 | 这段在讲什么 | 判断理由 |", "| --- | --- | --- | --- | --- |"];
  lines.splice(lines.indexOf("## 主线一句话"), 0, `转写时长：${teardownTimestamp(overview.durationMs)}；偏离主线区间：${teardownTimestamp(overview.detourMs)}（${ratioText(overview.detourPercent)}）。按转写时间及 AI 分段计算，非观看留存。`, `收藏/赞：${ratioText(overview.ratios.favorites)}；分享/赞：${ratioText(overview.ratios.shares)}；评论/赞：${ratioText(overview.ratios.comments)}。比例以点赞为分母，非播放互动率；点赞为零或指标缺失时不计算。`, "");
  for (const section of analysis.sections) lines.push(`| ${teardownTimestamp(transcript[section.startId]!.startMs)}–${teardownTimestamp(transcript[section.endId]!.endMs)} | ${section.label} | ${section.servesThesis ? "是" : "否"} | ${cell(section.summary)} | ${cell(section.reason)} |`);
  lines.push("", "## 做对了什么", "");
  for (const finding of analysis.strengths) lines.push(finding.explanation, "", quote(transcript[finding.segmentId]!), "");
  if (!analysis.strengths.length) lines.push("没有足够依据形成明确判断。", "");
  lines.push("## 为什么爆", "", "潜在传播机制 · AI 假设，不代表已证实爆款或因果。", "");
  if (analysis.virality === undefined) lines.push("历史报告未生成专门的传播分析，可在当前报告更新分析。", "");
  const virality = teardownViralityFindings(analysis);
  for (const finding of virality) lines.push(finding.explanation, "");
  if (analysis.trendAssessment) lines.push("### 热点与阶段关联", "", analysis.trendAssessment.explanation, "", ...analysis.trendAssessment.sourceIds.map(id => { const source = report.trendContext!.sources.find(row => row.id === id)!; return `- ${source.title} · ${source.platform} · 采集 ${source.observedAt} · 榜单范围 ${source.windowStart}–${source.windowEnd}`; }), "");
  if (!virality.length) lines.push("当前证据不足以提出有原文支持的传播机制。", "");
  lines.push("## 主线风险", "");
  for (const finding of analysis.distractions) lines.push(finding.explanation, "", quote(transcript[finding.segmentId]!), "");
  if (!analysis.distractions.length) lines.push("未识别出有原文支持的偏离主线段落。", "");
  lines.push("## 逐段原文", "");
  for (const section of analysis.sections) lines.push(`### ${teardownTimestamp(transcript[section.startId]!.startMs)}–${teardownTimestamp(transcript[section.endId]!.endMs)} · ${section.label}`, "", ...transcript.slice(section.startId, section.endId + 1).map(quote), "");
  lines.push("## 解释边界", "", TEARDOWN_LIMITATION);
  return lines.join("\n");
}

/** Projection into the existing Research/Artifact contract, with data and judgments kept distinct. */
export function teardownResearchBlocks(report: TeardownReport): ResearchBlock[] {
  const source: ResearchSource = { ref: "M1", kind: "MATERIAL", objectId: report.sourceItemId, title: report.work.title.slice(0, 500), href: report.work.url, capturedAt: report.work.capturedAt, publishedAt: report.work.publishedAt, eventAt: null, contentOrigin: "MACHINE_TRANSCRIPT", locator: "逐段原文与时间轴", excerpt: report.transcript.map(row => `[${teardownTimestamp(row.startMs)}] ${row.text}`).join("\n").slice(0, 20000), version: report.transcriptId };
  const samples: ResearchSource[] = report.baseline.samples.map((sample, index) => ({ ref: `B${index + 1}`, kind: "BENCHMARK_WORK", objectId: sample.externalId, title: sample.title.slice(0, 500), href: sample.url, capturedAt: report.baseline.capturedAt, publishedAt: sample.publishedAt, eventAt: null, contentOrigin: "ORIGINAL", locator: "红狐作者近期作品快照", excerpt: `点赞：${sample.likes}；置顶标识：${sample.pinned === null ? "未返回" : "非置顶"}`, version: report.baseline.capturedAt }));
  const trends: ResearchSource[] = (report.trendContext?.sources ?? []).filter(row => report.analysis.trendAssessment?.sourceIds.includes(row.id)).map((row, index) => ({ ref: `H${index + 1}`, kind: "TREND", objectId: row.id, title: row.title, href: null, capturedAt: row.observedAt, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: `红狐热点快照 · ${row.platform} · ${row.windowStart}–${row.windowEnd}`, excerpt: row.title, version: row.observedAt }));
  const refs = [source.ref, ...samples.map(row => row.ref)];
  const base = { sourceRefs: ["M1"], limitation: TEARDOWN_LIMITATION, provenance: "AI_INTERPRETATION" as const };
  return [
    { id: "teardown-metrics", type: "metrics", title: "作者近期表现比较", provenance: "COMPUTED", sourceRefs: refs, limitation: report.baseline.gaps.join("\n"), items: [{ label: "近期点赞中位数", value: report.baseline.median, unit: "赞", validCount: report.baseline.samples.length, denominator: report.baseline.samples.length, method: "最近60天，排除本作品、重复、已知置顶与缺失数据，中位数" }, { label: "目标相对倍数", value: report.baseline.multiple, unit: "倍", validCount: report.baseline.multiple === null ? 0 : 1, denominator: 1, method: "目标点赞 / 作者近期点赞中位数；至少20条样本，中位数至少50" }] },
    { ...base, id: "teardown-thesis", type: "text", title: "主线一句话", text: `${report.analysis.thesis}\n\n${quote(report.transcript[report.analysis.thesisSegmentId]!)}` },
    { ...base, id: "teardown-timeline", type: "table", title: "分段时间轴", columns: ["时间", "标签", "服务主线", "内容", "判断理由"], rows: report.analysis.sections.map(section => ({ cells: [`${teardownTimestamp(report.transcript[section.startId]!.startMs)}–${teardownTimestamp(report.transcript[section.endId]!.endMs)}`, section.label, section.servesThesis ? "是" : "否", section.summary, section.reason], sourceRefs: ["M1"] })) },
    ...report.analysis.strengths.map((row, index): ResearchBlock => ({ ...base, id: `teardown-strength-${index}`, type: "text", title: `做对了什么 ${index + 1}`, text: `${row.explanation}\n${quote(report.transcript[row.segmentId]!)}` })),
    ...teardownViralityFindings(report.analysis).map((row, index): ResearchBlock => ({ ...base, id: `teardown-virality-${index}`, type: "text", title: `为什么爆 · ${row.angle}`, text: `整条作品的传播解释，非已证实爆款因果。\n${row.explanation}` })),
    ...(report.analysis.trendAssessment ? [{ ...base, id: "teardown-trend-assessment", sourceRefs: ["M1", ...trends.map(row => row.ref)], type: "text" as const, title: "热点与阶段关联", text: `${report.analysis.trendAssessment.explanation}\n${report.analysis.trendAssessment.sourceIds.map(id => { const source = report.trendContext!.sources.find(row => row.id === id)!; return `${source.title} · ${source.platform} · 采集 ${source.observedAt} · 范围 ${source.windowStart}–${source.windowEnd}`; }).join("\n")}` }] : []),
    ...report.analysis.distractions.map((row, index): ResearchBlock => ({ ...base, id: `teardown-distraction-${index}`, type: "text", title: `主线风险 ${index + 1}`, text: `${row.explanation}\n${quote(report.transcript[row.segmentId]!)}` })),
    { id: "teardown-sources", type: "sources", title: "可核验来源", provenance: "REAL_DATA", sourceRefs: [...refs, ...trends.map(row => row.ref)], limitation: null, refs: [source, ...samples, ...trends] },
  ];
}
