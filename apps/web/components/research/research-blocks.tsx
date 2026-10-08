"use client";
import { type ResearchBlock } from "@content-center/core";
import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { ResearchComposer } from "./research-composer";
import type { ResearchScope } from "@/server/research/contracts";
const RESEARCH_PROVENANCE_LABELS = { REAL_DATA: "来源数据", COMPUTED: "系统统计", AI_INTERPRETATION: "AI 分析" };
const number = (value: number | null) => value === null ? "暂无数据" : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
export function ResearchBlocks({ blocks, prefix = "result", afterLead, reader, expanded = false, sourceBlocks = [] }: { blocks: ResearchBlock[]; prefix?: string; afterLead?: ReactNode; expanded?: boolean; sourceBlocks?: ResearchBlock[]; reader?: { resultId: string; kind: "run" | "study"; canWrite: boolean; continueHref: string; sessionId?: string; scope?: ResearchScope } }) {
  const [followup, setFollowup] = useState<string | null>(null);
  const sources = [...blocks, ...sourceBlocks].flatMap(block => block.type === "sources" ? block.refs : []);
  const priority = (block: ResearchBlock) => block.type === "sources" ? 3 : block.provenance === "AI_INTERPRETATION" ? 0 : block.provenance === "COMPUTED" ? 1 : 2;
  const titleFor = (block: ResearchBlock) => block.id.startsWith("account-v2-skill-") ? block.title.replace(/^方法候选/, "可以借鉴的写法") : block.title;
  const ordered = [...blocks].sort((a, b) => priority(a) - priority(b));

  if (reader) {
    const findings = ordered.filter(block => block.type === "text" && block.provenance === "AI_INTERPRETATION" && !block.id.startsWith("detail-") && !block.id.startsWith("structure-") && block.id !== "proof-review");
    const supplemental = ordered.filter(block => block.type !== "sources" && !findings.includes(block));
    return <div className="research-reader-grid">
      <div className="research-findings-column">
        <header className="research-findings-intro"><span className="research-eyebrow">这次看明白了什么</span><h2>{findings.length} 条研究发现</h2><p>逐条阅读，也可以只挑一条继续研究或用于创作。AI 判断请结合旁边的原始内容核对。</p></header>
        {findings.map(block => <article className="research-finding-card" key={block.id}>
          <ResearchBlocks blocks={[block]} sourceBlocks={blocks.filter(item => item.type === "sources")} prefix={prefix} expanded />
          <div className="research-finding-actions">
            <button type="button" className="research-button" onClick={event => window.dispatchEvent(new CustomEvent("research:select-finding", { detail: { resultId: reader.resultId, kind: reader.kind, blockId: block.id, trigger: event.currentTarget } }))}>选这条用于创作</button>
            {reader.sessionId ? <button type="button" className="research-button" aria-expanded={followup === block.id} onClick={() => setFollowup(current => current === block.id ? null : block.id)}>{followup === block.id ? "收起追问" : "继续研究这条发现"}</button> : <Link className="research-button" href={reader.continueHref}>继续研究</Link>}
          </div>
          {followup === block.id && reader.sessionId ? <div className="research-finding-followup"><ResearchComposer key={block.id} sessionId={reader.sessionId} canWrite={reader.canWrite} initialScope={reader.scope} initialQuestion={"关于“" + block.title + "”，我想进一步弄清："} onStarted={() => setFollowup(null)} /><button type="button" onClick={() => setFollowup(null)}>取消追问</button></div> : null}
        </article>)}
        {!findings.length ? <p className="research-empty-inline">当前保存的是数据与来源记录，尚没有可直接使用的研究判断。可以继续研究补充。</p> : null}
        {supplemental.length ? <details className="research-analysis-details"><summary>补充分析与数据 · {supplemental.length} 项</summary><ResearchBlocks blocks={supplemental} sourceBlocks={blocks.filter(block => block.type === "sources")} prefix={prefix} expanded /></details> : null}
        {afterLead ? <details className="research-analysis-details"><summary>这次研究的资料范围与缺口</summary>{afterLead}</details> : null}
      </div>
      <aside className="research-original-column" aria-label="原始内容对照">
        <header><span className="research-eyebrow">对照原始内容</span><h2>原文与结构</h2><p>没有保存的视频画面、时间点或数据不会补造。</p></header>
        {blocks.filter(block => block.type === "text" && block.id.startsWith("structure-")).map(block => <details key={block.id} className="research-original-structure"><summary>{block.title}</summary><div className="research-prose">{block.type === "text" ? block.text.split(/\n\n+/).map((text, i) => <p key={i}>{text}</p>) : null}</div></details>)}
        {sources.length ? sources.map(source => <article key={source.ref} id={prefix+"-"+source.ref} className="research-original-source">
          <h3>{source.title}</h3><small>{source.contentOrigin === "MACHINE_TRANSCRIPT" ? "机器文字稿，请核对识别准确性" : source.contentOrigin === "AI_READING" ? "AI 识读文字，请对照原件" : source.contentOrigin === "USER_PROVIDED" ? "用户提供，未作外部核验" : "研究时保存的来源记录"}</small>
          {source.excerpt ? <><p className="research-original-excerpt">{source.excerpt.length > 450 ? source.excerpt.slice(0,450) + "…" : source.excerpt}</p>{source.excerpt.length > 450 ? <details><summary>展开完整保存摘录</summary><p className="research-original-excerpt">{source.excerpt}</p></details> : null}</> : <p>没有可读摘录，可打开原来源核对。</p>}
          {source.href && (/^https?:\/\//.test(source.href) || /^\/(library|research\/trends|research\/benchmarks)\//.test(source.href) || source.href.startsWith("/dashboard?project=")) ? <Link className="research-source-link" href={source.href}>打开原来源 →</Link> : null}
          {source.capturedAt ? <details><summary>查看记录时间与定位</summary><p>记录于 {new Date(source.capturedAt).toLocaleString("zh-CN")}{source.locator ? " · " + source.locator : ""}</p>{source.publishedAt ? <p>发布于 {new Date(source.publishedAt).toLocaleString("zh-CN")}</p> : null}</details> : null}
        </article>) : <p className="research-empty-inline">这份结果没有保存可对照的原始摘录。当前结论需要谨慎使用，可继续研究补充资料。</p>}
      </aside>
    </div>;
  }
  return <div className="research-blocks">{ordered.map((block, index) => { const content = <section className={`research-block research-block-${block.type}`}><header hidden={block.type === "sources"}><h3>{titleFor(block)}</h3><span className={`research-provenance is-${block.provenance.toLowerCase()}`}>{RESEARCH_PROVENANCE_LABELS[block.provenance]}</span></header>
    {block.type === "text" ? (() => {
      // Historical result data stays intact; original quotes and proof lines are optional in the view.
      const lines = block.text.split("\n");
      const details = lines.filter(line => /^(原文：|作品主张：|作品提供的证明：|反例：)/.test(line));
      const main = lines.filter(line => !details.includes(line)).join("\n");
      return <><div className="research-prose">{main.split(/\n\n+/).filter(text => text.trim()).map((text, index) => <p key={index}>{text}</p>)}</div>{details.length ? <details className="research-analysis-details"><summary>原文与分析细节</summary>{details.map((text, index) => <p key={index}>{text}</p>)}</details> : null}</>;
    })() : null}
    {block.type === "metrics" ? <dl className="research-metrics">{block.items.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{number(item.value)}{item.value !== null ? <small>{item.unit}</small> : null}</dd><small>有效样本 {item.validCount}/{item.denominator} · {item.method}</small></div>)}</dl> : null}
    {block.type === "table" ? <div className="research-table-scroll" tabIndex={0} role="region" aria-label={block.title}><table><thead><tr>{block.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.cells.map((cell, col) => <td key={col}>{cell === null ? "暂无数据" : typeof cell === "number" ? number(cell) : cell}</td>)}</tr>)}</tbody></table>{!block.rows.length ? <p>当前范围内没有可用记录。</p> : null}</div> : null}
    {block.type === "bar_chart" || block.type === "line_chart" ? <><ResearchChart block={block} /><p className="research-caption">{block.method}{block.lowerIsBetter ? " · 数值越小越靠前" : ""}</p><details><summary>查看图表原始值</summary><table><thead><tr><th>项目</th><th>{block.unit}</th></tr></thead><tbody>{block.points.map((point, index) => <tr key={index}><td>{point.label}</td><td>{number(point.value)}</td></tr>)}</tbody></table></details></> : null}
    {block.type === "sources" ? <details className="research-sources-disclosure"><summary>查看来源与摘录 · {block.refs.length} 项</summary><ol className="research-sources">{block.refs.map(source => <li key={source.ref} id={`${prefix}-${source.ref}`}><div><strong>{sources.findIndex(item => item.ref === source.ref) + 1} · {source.title}</strong>{source.href && (source.href.startsWith("/library/") || source.href.startsWith("/research/trends/") || source.href.startsWith("/research/benchmarks/") || source.href.startsWith("/dashboard?project=") || /^https?:\/\//.test(source.href)) ? <Link href={source.href}>打开来源</Link> : null}</div><small>{source.contentOrigin === "AI_READING" ? "AI 识读文字，需对照原件" : source.contentOrigin === "MACHINE_TRANSCRIPT" ? "机器文字稿，需核对识别准确性" : source.contentOrigin === "USER_PROVIDED" ? source.kind === "PROJECT_ARTIFACT" ? "已保存项目产出；非发布历史" : "用户提供，未作外部核验" : source.kind === "TREND" ? "已保存的榜单快照" : source.kind === "BENCHMARK_ACCOUNT" ? "已保存的对标账号档案" : source.kind === "BENCHMARK_COMMENT" ? "研究时保存的真实评论" : source.kind === "BENCHMARK_WORK" ? "已保存的对标作品观察" : "已保存的资料输入"}{source.capturedAt ? ` · 采集/记录于 ${new Date(source.capturedAt).toLocaleString("zh-CN")}` : ""}{source.publishedAt ? ` · 发布于 ${new Date(source.publishedAt).toLocaleString("zh-CN")}` : ""}{source.eventAt ? ` · 事件发生于 ${new Date(source.eventAt).toLocaleString("zh-CN")}` : ""}{source.locator ? ` · ${source.locator}` : ""}</small>{source.excerpt ? <p>{source.excerpt}</p> : <p>暂无可读摘录。</p>}</li>)}</ol>{block.limitation ? <p className="research-limitation">{block.limitation}</p> : null}</details> : null}
    {block.type !== "sources" && (block.limitation || block.sourceRefs.length) ? <details className="research-analysis-details"><summary>来源与分析细节</summary>
    {block.limitation ? <p className="research-limitation">这段结论的边界：{block.limitation}</p> : null}
    {sources.length && block.sourceRefs.length ? <div className="research-citations">查看依据：{block.sourceRefs.map(ref => <a key={ref} href={`#${prefix}-${ref}`} title={sources.find(source => source.ref === ref)?.title || "查看来源"} aria-label={`查看依据：${sources.find(source => source.ref === ref)?.title || ref}`} onClick={() => { const target = document.getElementById(`${prefix}-${ref}`); const disclosure = target?.closest("details"); if (disclosure) disclosure.open = true; }}>{sources.findIndex(source => source.ref === ref) + 1 || ref}</a>)}</div> : null}
    </details> : null}
  </section>;
    const optional = !expanded && ((index > 1 && block.type !== "sources") || (block.provenance !== "AI_INTERPRETATION" && block.type !== "sources") || block.id === "proof-review" || block.id.startsWith("detail-") || block.id === "account-v2-method" || block.id.startsWith("account-v2-evolution-") || block.id.startsWith("account-v2-writing-") || block.id.startsWith("legacy-"));
    return <Fragment key={block.id}>{optional ? <details className="research-analysis-details"><summary>{titleFor(block)}</summary>{content}</details> : content}{index === 0 && afterLead ? <details><summary>这版研究使用了哪些内容</summary>{afterLead}</details> : null}</Fragment>;
  })}{!ordered.length ? afterLead : null}</div>;
}
function ResearchChart({ block }: { block: Extract<ResearchBlock, { type: "bar_chart" | "line_chart" }> }) {
  const known = block.points.flatMap(point => point.value === null ? [] : [point.value]);
  if (!known.length) return <p className="research-empty-inline">暂无可用于绘图的数据。</p>;
  if (block.type === "bar_chart") {
    const max = Math.max(...known.map(Math.abs), 1);
    return <div className="research-bars">{block.points.map((point, index) => <div key={index}><span title={point.label}>{point.label}</span><i>{point.value !== null ? <b style={{ width: `${Math.abs(point.value) / max * 100}%` }} /> : null}</i><strong>{number(point.value)}</strong></div>)}</div>;
  }
  const min = Math.min(...known); const max = Math.max(...known); const span = max - min || 1;
  const x = (index: number) => 30 + index / Math.max(block.points.length - 1, 1) * 600;
  const y = (value: number) => block.lowerIsBetter ? 30 + (value - min) / span * 150 : 180 - (value - min) / span * 150;
  return <svg className="research-line-chart" viewBox="0 0 660 230" role="img" aria-label={`${block.title}；原始值见下方表格，缺失记录不连接`}><line x1="30" y1="190" x2="630" y2="190" stroke="currentColor" opacity=".2" />{block.points.map((point, index) => { const previous = block.points[index - 1]; return point.value === null ? null : <g key={index}>{previous?.value !== null && previous?.value !== undefined ? <line x1={x(index - 1)} y1={y(previous.value)} x2={x(index)} y2={y(point.value)} stroke="currentColor" strokeWidth="2" /> : null}<circle cx={x(index)} cy={y(point.value)} r="4"><title>{`${point.label}：${number(point.value)}`}</title></circle>{(index === 0 || index === block.points.length - 1) ? <text x={x(index)} y="215" textAnchor={index === 0 ? "start" : "end"}>{point.label}</text> : null}</g>; })}</svg>;
}
