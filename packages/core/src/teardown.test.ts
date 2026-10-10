import { describe, expect, it } from "vitest";
import { compareAuthorLikes, timedTranscript, validateTeardownAnalysis, renderTeardownMarkdown, teardownResearchBlocks, teardownReportOverview, teardownViralityFindings, TEARDOWN_SCHEMA, type BaselineSample, type TeardownAnalysis, type TeardownWork } from "./teardown";

const at = "2026-10-09T00:00:00.000Z";
const work: TeardownWork = { externalId: "target", title: "表达的结构", authorId: "author", authorName: "老师", url: "https://www.douyin.com/video/123", publishedAt: at, capturedAt: at, metrics: { likes: 400, views: null, favorites: 0, shares: null, comments: 4 } };
const sample = (id: string, likes: number | null, extra: Partial<BaselineSample> = {}): BaselineSample => ({ externalId: id, authorId: "author", title: id, url: `https://www.douyin.com/video/${id}`, likes, publishedAt: "2026-10-01T00:00:00.000Z", pinned: false, ...extra });
const transcript = timedTranscript([{ startMs: 0, endMs: 2100, text: "先说清楚主线。" }, { startMs: 2100, endMs: 8500, text: "用一个具体例子解释。" }, { startMs: 8500, endMs: 9900, text: "最后回到主线。" }]);
const analysis: TeardownAnalysis = { thesis: "用案例组织主线", thesisSegmentId: 0, sections: [{ startId: 0, endId: 0, label: "钩子", servesThesis: true, summary: "提出主线", reason: "让观众理解" }, { startId: 1, endId: 2, label: "案例", servesThesis: true, summary: "案例后回归", reason: "围绕同一主线" }], strengths: [{ explanation: "先给出清晰主题", segmentId: 0 }], distractions: [] };
describe("teardown evidence and report", () => {
  it("supports whole-video analysis without segment links and validates hotspot provenance", () => {
    const whole: TeardownAnalysis = { ...analysis, virality: [{ angle: "受众需求", explanation: "这类内容吸引有表达困扰的人，给了他们下次组织表达时可用的办法。" }], trendAssessment: { status: "UNVERIFIED", explanation: "没有带日期的热点来源，不能确认当下热度。", sourceIds: [] } };
    expect(validateTeardownAnalysis(whole, transcript)).toEqual(whole);
    expect(() => validateTeardownAnalysis({ ...whole, virality: [{ angle: "受众需求", explanation: analysis.strengths[0]!.explanation }] }, transcript)).toThrow("DUPLICATE_INSIGHT");
    const trend = { checkedAt: at, gap: null, sources: [{ id: "T1", title: "内容表达", platform: "GLOBAL", observedAt: at, windowStart: at, windowEnd: at }] };
    const related: TeardownAnalysis = { ...whole, trendAssessment: { status: "RELATED", explanation: "本次榜单里的表达主题与作品有关，但不能据此倒推发布时蹭了热点。", sourceIds: ["T1"] } };
    expect(() => validateTeardownAnalysis(related, transcript)).toThrow("UNSUPPORTED_TREND");
    expect(validateTeardownAnalysis(related, transcript, {}, trend)).toEqual(related);
    expect(() => validateTeardownAnalysis({ ...related, trendAssessment: { ...related.trendAssessment!, sourceIds: ["fake"] } }, transcript, {}, trend)).toThrow("UNSUPPORTED_TREND");
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work, baseline: compareAuthorLikes(work, [], at), transcript, analysis: related, trendContext: trend };
    const markdown = renderTeardownMarkdown(report).split("## 为什么爆")[1]!.split("## 主线风险")[0]!;
    expect(markdown).not.toContain("（00:");
    expect(markdown).toContain("采集");
    expect(teardownResearchBlocks(report).find(block => block.id === "teardown-trend-assessment")?.sourceRefs).toEqual(["M1", "H1"]);
  });
  it("accepts equivalent metric formatting while still rejecting fabricated values", () => {
    const changed: TeardownAnalysis = { ...analysis, virality: [{ angle: "收藏价值", explanation: "收藏/赞35%，是内容可供之后参考的线索。" }] };
    expect(validateTeardownAnalysis(changed, transcript, { favoritesPerLike: "35.0%" })).toEqual(changed);
    const dated: TeardownAnalysis = { ...changed, trendAssessment: { status: "UNVERIFIED", explanation: "作品发布于9月29日，尚未取得发布时的热点来源。", sourceIds: [] } };
    expect(validateTeardownAnalysis(dated, transcript, { favoritesPerLike: "35.0%", publishedAt: "2026-09-29T10:00:00Z" })).toEqual(dated);
    expect(() => validateTeardownAnalysis({ ...changed, virality: [{ angle: "收藏价值", explanation: "收藏/赞36%，证明观众喜欢它。" }] }, transcript, { favoritesPerLike: "35.0%" })).toThrow("UNSUPPORTED_NUMBER");
  });
  it("checks viral hypotheses against transcript IDs and metric evidence, and exports them as judgments", () => {
    const changed: TeardownAnalysis = { ...analysis, virality: [{ angle: "收藏价值", explanation: "具体案例有供之后核对的价值，收藏/赞0.0%仅描述公开数量关系。", segmentId: 1 }] };
    expect(validateTeardownAnalysis(changed, transcript, { favoritesPerLike: "0.0%" })).toEqual(changed);
    expect(() => validateTeardownAnalysis(changed, transcript)).toThrow("UNSUPPORTED_NUMBER");
    expect(() => validateTeardownAnalysis({ ...changed, virality: [{ ...changed.virality![0]!, segmentId: 99 }] }, transcript)).toThrow("UNKNOWN_QUOTE");
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work, baseline: compareAuthorLikes(work, [], at), transcript, analysis: changed };
    expect(renderTeardownMarkdown(report)).toContain("## 为什么爆");
    expect(renderTeardownMarkdown(report)).toContain(changed.virality![0]!.explanation);
    expect(renderTeardownMarkdown(report)).not.toContain("### 收藏价值");
    expect(teardownResearchBlocks(report).find(block => block.id === "teardown-virality-0")).toMatchObject({ provenance: "AI_INTERPRETATION", sourceRefs: ["M1"], limitation: expect.any(String), text: expect.stringContaining("具体案例有供之后核对的价值") });
  });
  it("does not duplicate legacy strengths and preserves independent risks", () => {
    const legacy = { ...analysis, distractions: [{ explanation: "存在偏离主线的风险", segmentId: 2 }] };
    expect(teardownViralityFindings(legacy)).toEqual([]);
    expect(teardownViralityFindings({ ...legacy, virality: [] })).toEqual([]);
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work, baseline: compareAuthorLikes(work, [], at), transcript, analysis: legacy };
    const markdown = renderTeardownMarkdown(report);
    expect(markdown).toContain("历史报告未生成专门的传播分析");
    expect(markdown.split("## 为什么爆")[1]!.split("## 主线风险")[0]).not.toContain("存在偏离主线的风险");
    expect(markdown).toContain("## 主线风险");
    expect(markdown).toContain("存在偏离主线的风险");
  });
  it("derives ratios and semantic duration while preserving missing data and zero denominators", () => {
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work, baseline: compareAuthorLikes(work, [], at), transcript, analysis };
    expect(teardownReportOverview(report)).toMatchObject({ durationMs: 9900, detourMs: 0, detourPercent: 0, ratios: { favorites: 0, shares: null, comments: 1 } });
    expect(teardownReportOverview({ ...report, work: { ...work, metrics: { ...work.metrics, likes: 0 } } }).ratios).toEqual({ favorites: null, shares: null, comments: null });
    const markdown = renderTeardownMarkdown(report);
    expect(markdown).toContain("收藏/赞：0.0%");
    expect(markdown).toContain("分享/赞：不可用");
    expect(markdown).toContain("转写时长：00:09");
    expect(markdown).not.toContain("不可用%");
  });
  it("does not double-count overlapping ASR intervals in deviation time", () => {
    const overlapping = timedTranscript([{ startMs: 0, endMs: 4000, text: "第一段" }, { startMs: 3000, endMs: 7000, text: "第二段" }, { startMs: 6500, endMs: 8000, text: "第三段" }]);
    const changed = { ...analysis, sections: [{ ...analysis.sections[0]!, label: "跑题" as const, servesThesis: false }, { ...analysis.sections[1]!, servesThesis: false }] };
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work, baseline: compareAuthorLikes(work, [], at), transcript: overlapping, analysis: changed };
    expect(teardownReportOverview(report)).toMatchObject({ durationMs: 8000, detourMs: 8000, detourPercent: 100 });
  });
  it("computes a median from valid recent author samples and preserves missing counts", () => {
    const input = Array.from({ length: 20 }, (_, index) => sample(String(index), index % 2 ? 300 : 100));
    input.push(sample("target", 900), sample("pinned", 99999, { pinned: true }), sample("missing", null), sample("foreign", 700, { authorId: "other" }), sample("old", 400, { publishedAt: "2025-01-01" }), input[0]!);
    const result = compareAuthorLikes(work, input, at);
    expect(result).toMatchObject({ median: 200, multiple: 2, excluded: 6 });
    expect(result.samples).toHaveLength(20);
    expect(compareAuthorLikes({ ...work, metrics: { ...work.metrics, likes: null } }, input, at).multiple).toBeNull();
  });
  it("does not label sparse, zero, low-median or missing baselines as strong performance", () => {
    expect(compareAuthorLikes(work, [sample("one", 400)], at).multiple).toBeNull();
    const rows = Array.from({ length: 20 }, (_, index) => sample(String(index), 0));
    expect(compareAuthorLikes(work, rows, at)).toMatchObject({ median: 0, multiple: null });
    expect(compareAuthorLikes({ ...work, authorId: null }, rows, at).samples).toEqual([]);
  });
  it("rejects overlapping, missing or fabricated semantic IDs instead of rendering guessed timestamps", () => {
    expect(validateTeardownAnalysis(analysis, transcript)).toEqual(analysis);
    expect(() => validateTeardownAnalysis({ ...analysis, sections: [{ ...analysis.sections[0]!, endId: 1 }, analysis.sections[1]!] }, transcript)).toThrow("INCOMPLETE");
    expect(() => validateTeardownAnalysis({ ...analysis, thesisSegmentId: 99 }, transcript)).toThrow("UNKNOWN_QUOTE");
    expect(() => validateTeardownAnalysis({ ...analysis, thesis: "这个开头带来80%完播率" }, transcript)).toThrow("UNSUPPORTED_NUMBER");
    expect(() => timedTranscript([{ startMs: -1, endMs: 1, text: "假时间" }])).toThrow("TIMESTAMPS_REQUIRED");
    expect(() => timedTranscript([{ startMs: 0, endMs: 0, text: "无时长" }])).toThrow("TIMESTAMPS_REQUIRED");
  });
  it("renders reference report sections and exact ASR quotes while preserving Research provenance", () => {
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work, baseline: compareAuthorLikes(work, [], at), transcript, analysis };
    const markdown = renderTeardownMarkdown(report);
    for (const heading of ["主线一句话", "分段时间轴", "做对了什么", "为什么爆", "主线风险", "逐段原文", "解释边界"]) expect(markdown).toContain(`## ${heading}`);
    expect(markdown).toContain("先说清楚主线。（00:00）");
    expect(markdown).toContain("| 播放 | 未返回 |");
    expect(markdown).not.toMatch(/平均观看时长|## 为什么散/);
    const blocks = teardownResearchBlocks(report);
    expect(blocks.find(block => block.type === "metrics")?.provenance).toBe("COMPUTED");
    expect(blocks.filter(block => block.provenance === "AI_INTERPRETATION").every(block => Boolean(block.limitation))).toBe(true);
  });
  it("exports transcript-only reports with an explicit gap and no claimed public-data snapshot", () => {
    const unavailable: TeardownWork = { ...work, externalId: null, authorId: null, publicDataStatus: "UNAVAILABLE", metrics: { likes: null, comments: null, shares: null, favorites: null, views: null } };
    const report = { schema: TEARDOWN_SCHEMA, sourceItemId: "source", transcriptId: "transcript", generatedAt: at, model: "deepseek", work: unavailable, baseline: compareAuthorLikes(unavailable, [], at, ["红狐未收录该作品"]), transcript, analysis };
    const markdown = renderTeardownMarkdown(report);
    expect(markdown).toContain("数据不足，无法比较作者近期表现");
    expect(markdown).toContain("| 点赞 | 未返回 |");
    expect(markdown).toContain("用一个具体例子解释。（00:02）");
    expect(markdown).not.toContain("数据来源：红狐 · 作品采集");
    expect(teardownResearchBlocks(report).find(block => block.type === "metrics")).toMatchObject({ items: [{ value: null }, { value: null }] });
  });
});
