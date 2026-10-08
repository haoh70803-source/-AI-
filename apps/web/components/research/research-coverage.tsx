import { z } from "zod";

const schema = z.object({ requested: z.number().int().nonnegative(), observed: z.number().int().nonnegative(), readable: z.number().int().nonnegative(), timed: z.number().int().nonnegative(), visual: z.number().int().nonnegative(), aiSampleCount: z.number().int().nonnegative(), truncated: z.boolean(), sampling: z.enum(["SELECTED", "WINDOW", "HIGH_PERFORMANCE"]), timeRange: z.object({ from: z.string().nullable(), to: z.string().nullable() }), gaps: z.array(z.string()) });

export function ResearchCoverageSummary({ value }: { value: unknown }) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return <p className="research-notice">这条历史结果没有可用的结构化样本范围，请以来源记录和原研究说明为准。</p>;
  const coverage = parsed.data;
  const date = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "未提供";
  return <section className="research-section research-coverage-summary"><header><h2>本次数据范围</h2><span>{coverage.truncated ? "部分内容超出读取上限" : "按本次实际读取记录"}</span></header><p>看了 <strong>{coverage.observed}</strong> 条资料或作品 · <strong>{coverage.readable}</strong> 条有正文 · <strong>{coverage.aiSampleCount}</strong> 条用于分析</p><details><summary>查看具体范围与证据缺口{coverage.gaps.length ? ` · ${coverage.gaps.length} 项` : ""}</summary><p>选择范围 {coverage.requested} 条；其中 {coverage.timed} 条有时间码，{coverage.visual} 条有直接画面检视。{coverage.timeRange.from || coverage.timeRange.to ? `来源窗口 ${date(coverage.timeRange.from)} 至 ${date(coverage.timeRange.to)}。` : "没有统一的来源时间窗口。"}{coverage.sampling === "HIGH_PERFORMANCE" ? "本次是高表现样本，不能代表账号全量。" : ""}</p>{coverage.gaps.length ? <ul>{coverage.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul> : <p>本次没有记录额外的证据缺口。</p>}</details></section>;
}
