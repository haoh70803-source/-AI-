"use client";
import Link from "next/link";
import { useState } from "react";
import type { ResearchSource } from "@content-center/core";
import type { AccountResearchView } from "@/server/research/account-research-service";
import type { AccountResearchAnswer } from "@/server/research/account-research-contract";

type View = AccountResearchView;
type Citation = { ref: string; quote: string };
export type AccountEvidencePresentation = { title: string; text: string; limitation?: string | null; sources: ResearchSource[] };
type Props = { value: View; onEvidence: (value: AccountEvidencePresentation) => void };
const basisLabel = { TEXT: "基于正文", TITLE: "标题级观察", METADATA: "基于作品数据", MIXED: "结合正文与基础数据" };
const dimensionLabel: Record<string, string> = { TOPIC: "主题", TITLE: "标题", OPENING: "开头", STRUCTURE: "结构", EXAMPLES: "案例", LENGTH: "长度", CTA: "结尾行动", SCHEDULE: "发布节奏", PERFORMANCE: "表现" };
const number = (value: number | null) => value === null ? "未提供" : value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
function evidence(value: View, title: string, text: string, citations: Citation[], limitation: string): AccountEvidencePresentation {
  const refs = [...new Set(citations.map(item => item.ref))];
  return { title, text, limitation: `${limitation}\n依据保留自第 ${value.latest?.version ?? ""} 版的研究快照，打开原资料可能看到后续修改。`, sources: refs.flatMap(ref => { const source = value.report?.sources.find(item => item.ref === ref); return source ? [{ ...source, excerpt: citations.filter(item => item.ref === ref).map(item => item.quote).join("\n\n") }] : []; }) };
}
function CounterEvidence({ value, onEvidence, refs }: Props & { refs: string[] }) {
  if (!refs.length || !value.report) return null;
  const citations = refs.flatMap(ref => value.report!.workAnalyses.find(item => item.ref === ref)?.citations ?? []);
  return <button type="button" className="dossier-evidence-button" onClick={() => onEvidence({ ...evidence(value, "反例与适用边界", "这些样本提醒我们：同样的表达方式不一定得到相同表现。请结合原文核对差异。", citations, "反例来自当前研究快照，不能单凭指标证明原因。"), sources: refs.flatMap(ref => { const source = value.report!.sources.find(item => item.ref === ref); return source ? [{ ...source, excerpt: source.excerpt || "本版本只保存了这条作品的来源关系。" }] : []; }) })}>核对 {refs.length} 条反例 ↗</button>;
}
function EvidenceButton({ value, onEvidence, title, text, citations, limitation }: Props & { title: string; text: string; citations: Citation[]; limitation: string }) {
  return <button type="button" className="dossier-evidence-button" onClick={() => onEvidence(evidence(value, title, text, citations, limitation))}>查看 {new Set(citations.map(item => item.ref)).size} 项依据 ↗</button>;
}
export function AccountResearchFindings({ value, onEvidence }: Props) {
  if (!value.report) return null;
  const { answer, facts } = value.report;
  return <div className="account-research-findings"><p className="account-research-lead">{answer.summary}</p><p className="dossier-footnote">本版本的内容研究基于 {facts.analyzedTextCount} 条正文；另有 {facts.analyzedTitleCount} 条只做标题级观察。基础统计使用 {facts.workCount} 条作品。</p>
    <div className="account-finding-list">{answer.findings.map(finding => <article key={finding.id}><header><h3>{finding.title}</h3><small>{basisLabel[finding.basis]} · AI 判断</small></header><p>{finding.statement}</p><p className="dossier-footnote">{finding.limitation}</p><EvidenceButton value={value} onEvidence={onEvidence} {...finding} text={finding.statement} />{finding.counterRefs.length ? <CounterEvidence value={value} onEvidence={onEvidence} refs={finding.counterRefs} /> : <span className="account-counter-note">尚缺充分反例，继续验证</span>}</article>)}</div>
  </div>;
}
export function AccountResearchChanges({ value, onEvidence }: Props) {
  if (!value.report) return null;
  const { facts, answer, delta, previousRunId } = value.report;
  return <div className="account-research-changes">
    {previousRunId ? <div className="account-version-change"><strong>正文证据 {delta.previousTextCount} → {delta.currentTextCount} 条</strong><span>本次分析 {value.report.analyzedCount} 条新增或变化内容，复用 {value.report.reusedCount} 条未变化分析。</span></div> : <p className="dossier-footnote">这是首次形成的持续研究版本。以后加入新证据时，会保留这里的判断再逐项复核。</p>}
    {previousRunId ? <><p>{answer.unchanged ? "新增样本没有明显改变当前主要判断。" : "本版根据新证据复核了已有判断："}</p><ul className="account-review-list">{answer.reviews.map((review, index) => <li key={index}><span>{({ NEW: "新增发现", STRENGTHENED: "得到加强", WEAKENED: "有所削弱", UNSUPPORTED: "当前不再支持", UNCHANGED: "保持不变" })[review.status]}</span><div><strong>{review.title}</strong><p>{review.explanation}</p></div></li>)}</ul></> : null}
    {facts.recent.count && facts.previous.count ? <><h3>最近 {facts.recent.count} 条与之前 {facts.previous.count} 条</h3><div className="dossier-table-scroll"><table aria-label="前后样本确定性对照"><thead><tr><th>系统计算</th><th>最近一组</th><th>之前一组</th></tr></thead><tbody><tr><td>作品记录</td><td>{facts.recent.count} 条</td><td>{facts.previous.count} 条</td></tr><tr><td>可读正文</td><td>{facts.recent.textCount} 条</td><td>{facts.previous.textCount} 条</td></tr>{facts.recent.likesKnown || facts.previous.likesKnown ? <tr><td>平均点赞</td><td>{number(facts.recent.likesMean)} · 有效 {facts.recent.likesKnown} 条</td><td>{number(facts.previous.likesMean)} · 有效 {facts.previous.likesKnown} 条</td></tr> : null}{facts.recent.durationKnown || facts.previous.durationKnown ? <tr><td>平均时长 / 秒</td><td>{number(facts.recent.durationMean === null ? null : facts.recent.durationMean / 1000)}</td><td>{number(facts.previous.durationMean === null ? null : facts.previous.durationMean / 1000)}</td></tr> : null}</tbody></table></div><p className="dossier-footnote">按实际发布时间分组。作品的指标累积时长不同，样本差异不能直接说明增长或因果。</p></> : <p className="dossier-footnote">当前有日期的样本还无法形成前后两组；其他研究仍正常进行。</p>}
    {answer.recentChanges.length ? answer.recentChanges.map((item, index) => <article className="account-text-observation" key={index}><h3>{item.title}<small>{basisLabel[item.basis]}</small></h3><p>{item.observation}</p><EvidenceButton value={value} onEvidence={onEvidence} {...item} text={item.observation} /></article>) : <p className="dossier-footnote">当前没有足以支持内容方向变化的判断，未强行生成变化。</p>}
  </div>;
}
export function AccountResearchComparisons({ value, onEvidence }: Props) {
  if (!value.report) return null;
  const { answer, facts } = value.report;
  return <div className="account-comparisons"><header><h3>高表现和普通样本，有什么不同？</h3><small>依据第 {value.latest?.version} 版的证据快照</small></header><p className="dossier-footnote">系统按本版本有效点赞中位数 {number(facts.highPerformance.baseline)} 分组：高于中位数 {facts.highPerformance.highRefs.length} 条，其他有效样本 {facts.highPerformance.typicalRefs.length} 条。缺失指标不参加分组。</p>
    {answer.comparisons.length ? answer.comparisons.map((item, index) => <article className="account-text-observation" key={index}><h3>{dimensionLabel[item.dimension]}对照<small>{basisLabel[item.basis]} · AI 判断</small></h3><p>{item.observation}</p><div className="account-comparison-sides"><span>高表现依据 {item.highRefs.length} 条</span><span>普通样本依据 {item.typicalRefs.length} 条</span><span>{item.counterRefs.length ? `反例线索 ${item.counterRefs.length} 条` : "反例仍需补充"}</span></div><p className="dossier-footnote">{item.limitation}</p><EvidenceButton value={value} onEvidence={onEvidence} title={`${dimensionLabel[item.dimension]}对照`} text={item.observation} citations={item.citations} limitation={item.limitation} /><CounterEvidence value={value} onEvidence={onEvidence} refs={item.counterRefs} /></article>) : <p className="dossier-footnote">本版本还没有可核验的两组内容对照，不把单个高表现作品概括成通用规律。</p>}
  </div>;
}
export function AccountResearchPatterns({ value, onEvidence, onTopic }: Props & { onTopic: (topic: string) => void }) {
  if (!value.report) return null;
  const { facts, workAnalyses } = value.report;
  const structures = new Map<string, typeof workAnalyses>();
  for (const item of workAnalyses.filter(item => item.basis === "TEXT" && item.progression.length)) { const key = item.progression.join(" → "); structures.set(key, [...(structures.get(key) ?? []), item]); }
  return <div className="account-patterns"><div><h3>正文里出现的内容主题</h3><p className="dossier-footnote">AI 分类、系统计数；只统计本版实际分析的 {facts.analyzedTextCount} 条正文。</p>{facts.contentTopics.length ? <ul>{facts.contentTopics.map(item => <li key={item.topic}><button type="button" onClick={() => onTopic(item.topic)}><span>{item.topic}</span><strong>{item.count} 条 →</strong></button></li>)}</ul> : <p className="dossier-empty-inline">当前没有可读正文，下面的标题观察不会冒充内容主题。</p>}{facts.titleTopics.length ? <details><summary>标题级观察 · {facts.analyzedTitleCount} 条</summary><ul>{facts.titleTopics.map(item => <li key={item.topic}><button type="button" onClick={() => onTopic(item.topic)}><span>{item.topic}</span><strong>{item.count} 条 →</strong></button></li>)}</ul></details> : null}</div>
    <div><h3>正文怎样向前推进</h3><p className="dossier-footnote">按实际分析中的推进方式归组，单条观察也会保留，不包装成普遍公式。</p>{[...structures].slice(0, 6).map(([pattern, items]) => <article className="account-text-observation" key={pattern}><h4>{pattern}</h4><small>{items.length > 1 ? `在 ${items.length} 条正文中出现` : "单条内容观察"}</small><EvidenceButton value={value} onEvidence={onEvidence} title="内容推进方式" text={pattern} citations={items.flatMap(item => item.citations)} limitation="这些方式来自当前正文样本，需要结合具体场景判断是否适用。" /></article>)}</div>
  </div>;
}
export function AccountResearchTemplates({ value, onEvidence }: Props) {
  const [copied, setCopied] = useState<number | null>(null); const [error, setError] = useState("");
  if (!value.report) return null;
  const copy = async (template: AccountResearchAnswer["templates"][number], index: number) => {
    const text = `${template.name}\n适用：${template.whenToUse}\n${template.steps.map((step, order) => `${order + 1}. 【${step.slot}】${step.purpose}`).join("\n")}\n需要自己的证据：${template.requiredOwnEvidence}\n不能照搬：${template.doNotCopy}\n适用边界：${template.limitation}`;
    try { await navigator.clipboard.writeText(text); setCopied(index); setError(""); } catch { setError("复制未获浏览器允许，可以直接选中下方模板文字复制。"); }
  };
  return <div className="account-templates">{value.report.answer.templates.length ? value.report.answer.templates.map((template, index) => <article key={index}><header><div><small>{template.basis === "TITLE" ? "标题模板 · 仅依据标题" : "内容模板 · 依据实际正文"}</small><h3>{template.name}</h3></div><button type="button" onClick={() => void copy(template, index)}>{copied === index ? "已复制" : "复制模板"}</button></header><p>{template.whenToUse}</p><ol>{template.steps.map((step, order) => <li key={order}><strong>【{step.slot}】</strong><span>{step.purpose}</span></li>)}</ol><div className="account-template-conditions"><p><strong>需要我们补充</strong>{template.requiredOwnEvidence}</p><p><strong>不能直接照搬</strong>{template.doNotCopy}</p></div><p className="dossier-footnote">{template.limitation}</p><EvidenceButton value={value} onEvidence={onEvidence} title={template.name} text={template.steps.map(step => `【${step.slot}】${step.purpose}`).join("\n")} citations={template.citations} limitation={template.limitation} /></article>) : <p className="dossier-footnote">本次证据还不足以提炼可靠模板。现有判断与原文已保留，可以继续补充对应内容。</p>}{error ? <p role="status">{error}</p> : null}</div>;
}
export function AccountResearchTakeaways({ value, onEvidence }: Props) {
  if (!value.report) return null;
  const labels = { LEARN: "值得学习", DO_NOT_COPY: "不能直接照搬", TEST: "值得测试", INSUFFICIENT: "证据不足" };
  return <div className="account-takeaway-grid">{(Object.keys(labels) as Array<keyof typeof labels>).map(kind => <section key={kind}><h3>{labels[kind]}</h3>{value.report!.answer.takeaways.filter(item => item.kind === kind).map((item, index) => <article key={index}><h4>{item.title}</h4><p>{item.statement}</p><p className="dossier-footnote">{basisLabel[item.basis]} · {item.limitation}</p><EvidenceButton value={value} onEvidence={onEvidence} {...item} text={item.statement} /></article>)}</section>)}</div>;
}
export function AccountResearchHistory({ value }: { value: View }) {
  return value.history.length ? <ul className="dossier-history">{value.history.map(item => <li key={item.id}><Link href={item.saved ? `/research/results/run/${item.id}` : `/research/session/${item.sessionId}?before=${item.version + 1}#run-${item.id}`}><strong>持续研究 · 第 {item.version} 版</strong><span>{item.works} 条基础记录 · {item.texts} 条正文 · {item.comments} 条评论样本 · {item.saved ? "已保存成果" : "研究版本已保留"}</span></Link><time>{new Date(item.at).toLocaleDateString("zh-CN")}</time></li>)}</ul> : null;
}

export function AccountResearchComments({ value, onEvidence }: Props) {
  return value.report?.answer.commentInsights.map((item, index) => <article className="account-text-observation" key={index}><h3>{item.title}</h3><p>{item.statement}</p><p className="dossier-footnote">{item.limitation}</p><EvidenceButton value={value} onEvidence={onEvidence} {...item} text={item.statement} /></article>);
}
export function AccountWorkPatterns({ value, workId, onEvidence }: Props & { workId: string }) {
  const ref = value.report?.works.find(work => work.id === workId)?.ref;
  const item = value.report?.workAnalyses.find(work => work.ref === ref);
  if (!item) return null;
  const fields = [["标题", item.titlePattern], ["开头", item.opening], ["推进方式", item.progression.join(" → ")], ["观点", item.viewpoint], ["冲突", item.conflict], ["案例", item.examples], ["证据", item.evidenceStyle], ["转折", item.turn], ["结尾", item.ending], ["行动引导", item.cta], ["信息密度", item.density]];
  return <details className="account-work-patterns"><summary>查看这条作品的研究 · 第 {value.latest?.version} 版 · {basisLabel[item.basis]}</summary><dl>{fields.filter(([, text]) => text).map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl><p className="dossier-footnote">{item.limitation}</p><EvidenceButton value={value} onEvidence={onEvidence} title="作品结构依据" text={item.progression.join(" → ") || item.titlePattern} citations={item.citations} limitation={item.limitation} /></details>;
}
