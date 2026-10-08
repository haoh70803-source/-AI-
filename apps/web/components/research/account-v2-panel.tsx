"use client";

import Link from "next/link";
import { ResearchUseFindings } from "./research-use-findings";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { accountV2Overview } from "@/server/research/account-v2-service";

type Overview = Awaited<ReturnType<typeof accountV2Overview>>;
type Props = { accountId: string; value: Overview & { currentWorkCount: number; workIds: string[] };
  canWrite: boolean; collectionRunId: string; from: string; to: string; nextWorkId: string | null };

export function AccountV2Panel({ accountId, value, canWrite, collectionRunId, from, to, nextWorkId }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const router = useRouter(); const [active, setActive] = useState(value.active); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const requestKey = useRef<string | null>(null); const pending = useRef(false);
  useEffect(() => setActive(value.active), [value.active]);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>; let failures = 0; const started = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/research/sessions/${active.sessionId}/runs/${active.id}`, { cache: "no-store" });
        const result = await response.json(); if (!response.ok) throw new Error(result.message || "状态不可用");
        if (disposed) return; failures = 0;
        if (!["QUEUED", "RUNNING"].includes(result.status)) {
          disposed = true; setActive(null); setMessage(result.status === "COMPLETED" ? "账号综合研究完成。" : result.errorMessage || "本次研究未完成，旧结果仍保留。"); router.refresh(); return;
        }
      } catch { if (!disposed && ++failures >= 5) { disposed = true; setMessage("暂时无法连接研究状态，请稍后刷新。"); } }
      if (!disposed && Date.now() - started < 16 * 60_000) timer = setTimeout(poll, 4000);
      else if (!disposed) { disposed = true; setMessage("研究仍可能在后台继续，请稍后刷新查看。"); }
    };
    void poll(); return () => { disposed = true; clearTimeout(timer); };
  }, [active?.id, active?.sessionId, router]);
  async function start(force: boolean) {
    if (!canWrite || value.currentWorkCount < 2 || pending.current || active) return;
    pending.current = true; setBusy(true); setMessage(""); requestKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch(`/api/research/benchmarks/${accountId}/research-v2`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestKey: requestKey.current, ...(collectionRunId && collectionRunId !== "history" ? { collectionRunId } : {}),
          ...(from ? { from } : {}), ...(to ? { to } : {}), force }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "账号综合研究暂时无法开始。");
      requestKey.current = null;
      if (result.unchanged) { setMessage("作品研究和数据都没有变化，沿用已保存的研究版本。"); router.refresh(); }
      else setActive({ id: result.runId, sessionId: result.sessionId, stage: result.status });
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法开始研究。"); }
    finally { pending.current = false; setBusy(false); }
  }
  const latest = value.latest; const answer = latest?.state.answer;
  const sampleDates = latest?.state.selected.flatMap(work => work.publishedAt ? [new Date(work.publishedAt).getTime()] : []).filter(Number.isFinite) ?? [];
  const sampleDate = (value: number) => new Date(value).toLocaleDateString("zh-CN", {timeZone:"Asia/Shanghai"});
  const workByRef = new Map(latest?.state.selected.map(work => [work.ref, work]));
  const workLinks = (refs: string[]) => <span className="account-v2-work-links">{refs.map(ref => {
    const work = workByRef.get(ref); return work ? <Link key={ref} href={`/research/benchmarks/${accountId}/works/${work.workId}`} title={work.title}>{work.title.slice(0, 26)} →</Link> : null;
  })}</span>;
  return <div className="account-v2-panel" data-ready={ready} inert={!ready}>
    <div className="account-v2-intro"><div><h3>从作品里，看懂这个账号</h3><p>已读懂 {value.currentWorkCount} 条作品。比较它们反复怎样选题、展开和证明；加入新作品后，再主动更新研究。更新数据用于获取作品记录；下方按钮运行AI研究，主动重新研究会生成新版本。</p></div>
      <div className="account-v2-actions"><button type="button" className="dossier-primary" disabled={!canWrite || value.currentWorkCount < 2 || busy || Boolean(active)} onClick={() => void start(false)}>{active ? "正在比较作品…" : latest ? "依据新增作品更新" : "开始账号综合研究"}</button>{latest && canWrite ? <button type="button" disabled={busy || Boolean(active)} onClick={() => void start(true)}>主动重新研究</button> : null}</div></div>
    {value.currentWorkCount < 2 ? <p className="dossier-footnote">跨作品模式需要不同作品互相印证。{nextWorkId ? <Link href={`/research/benchmarks/${accountId}/works/${nextWorkId}`}>继续研究下一条作品 →</Link> : "先到作品库选择另一条有正文的作品。"}</p> : null}
    {message || value.failure ? <p role="status" className="dossier-footnote">{message || value.failure}</p> : null}
    {answer && latest ? <div className="account-v2-report">
      <div className="account-v2-lead"><span>这次对账号的理解</span><h3>{answer.inOneSentence}</h3><p>{answer.whatItDoes}</p><small>第 {latest.version} 版 · 本版实际比较 {latest.state.selected.length} 条作品研究，不代表账号全量。</small><p className="research-snapshot-note">{sampleDates.length ? "研究样本发布于 " + sampleDate(Math.min(...sampleDates)) + " — " + sampleDate(Math.max(...sampleDates)) : "研究样本缺少发布日期，不能判断内容新鲜度"}；采集时间不等于发布时间。</p><div className="research-nearby-works"><strong>对照本版读过的作品</strong>{workLinks(latest.state.selected.slice(0,4).map(work => work.ref))}{latest.state.selected.length > 4 ? <details><summary>其余 {latest.state.selected.length-4} 条作品</summary>{workLinks(latest.state.selected.slice(4).map(work=>work.ref))}</details> : null}</div></div>
      {answer.contentMap.length ? <section><h3>它主要围绕哪些内容展开</h3><ul className="account-v2-map">{answer.contentMap.map((item, index) => <li key={index}><strong>{item.direction}</strong><p>{item.meaning}</p><details><summary>查看相关作品</summary>{workLinks(item.workRefs)}</details></li>)}</ul></section> : null}
      {answer.patterns.length ? <section><h3>反复出现的内容方法</h3><div className="account-v2-patterns">{answer.patterns.map((item, index) => <article key={item.id}><span>跨作品观察 · {item.workRefs.length} 条作品</span><h4>{item.name}</h4><p>{item.howUsed}</p><dl><div><dt>后面怎么接</dt><dd>{item.continuation}</dd></div>{item.proofPairing ? <div><dt>证明方式</dt><dd>{item.proofPairing}</dd></div> : null}</dl><p><strong>怎样用于自己的内容：</strong>{item.transferable}</p><div className="research-nearby-works"><small>对照这些作品</small>{workLinks(item.workRefs)}</div><button type="button" className="research-button" onClick={event => window.dispatchEvent(new CustomEvent("research:select-finding", { detail: { resultId: latest.id, kind: "run", blockId: "account-v2-pattern-"+index, trigger: event.currentTarget } }))}>选这个方法用于创作</button><p className="research-caption">{item.limitation}</p>{item.counterRefs.length ? <details><summary>对照反例作品</summary>{workLinks(item.counterRefs)}</details> : null}</article>)}</div></section> : <p>当前作品还不足以确认稳定做法；可以继续深拆其他方向。</p>}
      <section><h3>值得学与不能照搬</h3><div className="account-v2-lessons"><div><h4>值得学</h4><ul>{answer.learn.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h4>不要照搬</h4><ul>{answer.doNotCopy.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div></section>
      <ResearchUseFindings key={latest.id} resultId={latest.id} canWrite={canWrite} />
      <details className="research-specialist-details"><summary>继续看选题、开头与证明的具体做法</summary><section><h3>选题、表达与可信度</h3><dl className="account-v2-method"><div><dt>怎么选题</dt><dd>{answer.topicLogic}</dd></div><div><dt>怎么开头</dt><dd>{answer.openingLogic}</dd></div><div><dt>怎么推进</dt><dd>{answer.structureLogic}</dd></div><div><dt>靠什么证明</dt><dd>{answer.proofLogic}</dd></div><div><dt>表达习惯</dt><dd>{answer.expressionDNA}</dd></div><div><dt>行动引导</dt><dd>{answer.ctaLogic}</dd></div></dl></section></details>
      <details><summary>作品表现、反例与分析细节</summary>
      <section><h3>高表现与普通作品有什么不同</h3><p>{answer.highVsTypical.observation}</p><div className="account-v2-comparison"><div><strong>较高表现样本</strong>{workLinks(answer.highVsTypical.highRefs)}</div><div><strong>普通样本</strong>{workLinks(answer.highVsTypical.typicalRefs)}</div></div><p className="dossier-footnote">{answer.highVsTypical.limitation}</p></section>
      {answer.counterExamples.length ? <section><h3>需要一起看的反例</h3><ul>{answer.counterExamples.map((item, index) => <li key={index}><strong>{item.observation}</strong><p>{item.whyItMatters}</p><details><summary>查看相关作品</summary>{workLinks(item.workRefs)}</details></li>)}</ul></section> : null}
      </details>
      {answer.evolution.length ? <details className="research-specialist-details"><summary>样本之间的变化（按需对照）</summary><section><h3>最近发生的变化</h3><ul>{answer.evolution.map((item, index) => <li key={index}><strong>{item.dimension}</strong><p>{item.earlier} → {item.later}</p><p>{item.observation}</p><p className="research-caption">{item.limitation}</p>{workLinks([...item.earlierRefs, ...item.laterRefs])}</li>)}</ul></section></details> : null}

      {answer.skillCandidates.length ? <section><h3>选一个适合自己的写法</h3><p>按你的内容需要借鉴步骤，用自己的观点和材料展开。</p><div className="account-v2-skills">{answer.skillCandidates.map((item, index) => <details key={index}><summary>{item.name}<span>{item.whenToUse}</span></summary><p>{item.goal}</p><p><strong>先准备：</strong>{item.inputs.join("、")}</p><ol>{item.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol><p><strong>需要自己的证明：</strong>{item.proofRequired}</p><p><strong>需要留意：</strong>{item.cautions}</p><p><strong>禁止：</strong>{item.prohibited}</p></details>)}</div></section> : null}
      {answer.researchLimits.length ? <details className="research-specialist-details"><summary>这次研究的资料边界</summary><ul>{answer.researchLimits.map((limit,index)=><li key={index}>{limit}</li>)}</ul></details> : null}<footer>{latest.saved ? <Link className="dossier-primary" href={`/research/results/run/${latest.id}`}>打开私人保存版本 →</Link> : <span className="research-caption">私人保存或分享给项目，请使用上方选项。</span>}<Link href={`/research/results/run/${latest.id}`}>查看完整版本 →</Link></footer>
    </div> : null}
  </div>;
}
