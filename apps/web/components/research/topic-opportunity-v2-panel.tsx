"use client";

import Link from "next/link";
import { ResearchUseFindings } from "./research-use-findings";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { topicOpportunityV2View } from "@/server/research/topic-opportunity-v2-service";

type View = Awaited<ReturnType<typeof topicOpportunityV2View>>;
export function TopicOpportunityV2Panel({ stableKey, view, canWrite }: { stableKey: string; view: View; canWrite: boolean }) {
  const [ready, setReady] = useState(false); useEffect(() => setReady(true), []);
  const pending = useRef(false);
  const router = useRouter(); const [projectId, setProjectId] = useState(view.choices.projects[0]?.id ?? "");
  const [materialIds, setMaterialIds] = useState<string[]>(view.choices.projects[0]?.sourceItemIds.filter(id => view.choices.materials.some(item => item.id === id)).slice(0, 8) ?? []);
  const [active, setActive] = useState(view.active); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const requestKey = useRef<string | null>(null);
  useEffect(() => setActive(view.active), [view.active]);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>; let failures = 0; const started = Date.now();
    const poll = async () => {
      try { const response = await fetch(`/api/research/sessions/${active.sessionId}/runs/${active.id}`, { cache: "no-store" });
        const result = await response.json(); if (!response.ok) throw new Error(result.message || "状态不可用");
        if (disposed) return; failures = 0;
        if (!["QUEUED", "RUNNING"].includes(result.status)) { disposed = true; setActive(null);
          setMessage(result.status === "COMPLETED" ? "选题机会研究完成。" : result.errorMessage || "本次研究未完成，旧结果仍保留。"); router.refresh(); return; }
      } catch { if (!disposed && ++failures >= 5) { disposed = true; setMessage("状态暂时不可用，请稍后刷新查看。"); } }
      if (!disposed && Date.now() - started < 16 * 60_000) timer = setTimeout(poll, 4000);
      else if (!disposed) { disposed = true; setMessage("研究仍可能在后台继续，请稍后刷新查看。"); }
    };
    void poll(); return () => { disposed = true; clearTimeout(timer); };
  }, [active?.id, active?.sessionId, router]);
  function chooseProject(id: string) { setProjectId(id); setMaterialIds(view.choices.projects.find(item => item.id === id)?.sourceItemIds.filter(
    sourceId => view.choices.materials.some(item => item.id === sourceId)).slice(0, 8) ?? []); }
  function toggleMaterial(id: string) { setMaterialIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 8 ? [...current, id] : current); }
  async function start(force: boolean) {
    if (pending.current || busy || active || !canWrite || !projectId || !materialIds.length) return;
    pending.current = true; setBusy(true); setMessage(""); requestKey.current ||= crypto.randomUUID();
    try { const response = await fetch(`/api/research/trends/${stableKey}/opportunity-v2`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestKey: requestKey.current, projectId, materialIds, force }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "暂时无法开始选题研究。");
      requestKey.current = null;
      if (result.unchanged) { setMessage("趋势、相关内容和自有资料没有变化，沿用上一版研究。"); router.refresh(); }
      else setActive({ id: result.runId, sessionId: result.sessionId });
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法开始研究。"); }
    finally { pending.current = false; setBusy(false); }
  }
  const latest = view.latest; const answer = latest?.state.answer;
  const related = new Map(latest?.state.related.map(item => [item.ref, item]));
  const refs = (ids: string[]) => <span className="topic-v2-refs">{ids.map(ref => {
    const item = related.get(ref); return item ? <span key={ref}>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title.slice(0, 28)} ↗</a> : item.title.slice(0, 28)}{!item.bodyExcerpt ? <small> · 仅标题，未读正文</small> : null}</span> : null;
  })}</span>;
  return <div className="topic-v2-panel" data-ready={ready} inert={!ready}>
    <details className="research-specialist-inputs" open={!latest}><summary>{latest ? "补充自己的资料，继续研究" : "选择自己的项目与资料"}</summary><div className="topic-v2-controls"><div><label>结合哪个项目<select value={projectId} onChange={event => chooseProject(event.target.value)} disabled={busy || Boolean(active)}>{view.choices.projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p>从自己的资料出发判断能否参与这个话题。</p></div>
      <div><strong>自有资料</strong><div className="topic-v2-materials">{view.choices.materials.slice(0, 60).map(item => <label key={item.id}><input type="checkbox" checked={materialIds.includes(item.id)} onChange={() => toggleMaterial(item.id)} disabled={busy || Boolean(active) || !materialIds.includes(item.id) && materialIds.length >= 8} /><span>{item.title}</span></label>)}</div></div></div>
    <div className="topic-v2-actions"><button type="button" className="research-button research-primary" disabled={!canWrite || !projectId || !materialIds.length || busy || Boolean(active)} onClick={() => void start(false)}>{busy ? "正在核对…" : active ? "正在研究趋势与选题…" : latest ? "用新数据更新选题机会" : "研究趋势并找选题机会"}</button>{latest && canWrite ? <button type="button" disabled={busy || Boolean(active) || !projectId || !materialIds.length} onClick={() => void start(true)}>主动重新研究</button> : null}</div>
    <p className="research-caption">点击后主动查询相关作品并调用研究模型。只分析本次取得的候选内容，缺少正文或自有证明时会明确标出。</p>
    {view.choices.projects.length && !view.choices.materials.length ? <p className="research-caption">还没有可选的自有资料。先在材料中加入真实案例或业务记录，再结合趋势研究。</p> : null}
    {view.choices.projects.length && view.choices.materials.length && !materialIds.length ? <p className="research-caption">选择至少一条真实资料后，才能更新或重新研究。</p> : null}
    {!view.choices.projects.length ? <p className="research-error">当前没有可用项目。先到<Link href="/projects">项目</Link>创建一个。</p> : null}
    </details>
    {message || view.failure ? <p role="status" className="research-caption">{message || view.failure}</p> : null}
    {answer && latest ? <div className="topic-v2-report"><header><span>第 {latest.version} 版 · {latest.state.project.title}</span><h2>{answer.trendMeaning.replaceAll("当前榜单", "该次快照榜单")}</h2><p>{answer.whyNow}</p><small>{answer.whyNowLimit}</small><p className="research-snapshot-note">依据保存于 {new Date(latest.state.trend.observedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 的榜单快照，以及 {latest.state.related.length} 条相关候选内容；未自动实时更新。</p></header>
      <section className="research-specialist-fit"><h3>这件事与你的内容有什么关系</h3><p>{answer.businessFit.reason}</p><p>目标受众：{answer.businessFit.audience}</p><p className="research-caption">{answer.businessFit.canSpeak === "YES" ? "已有可引用的自有资料，仍需核实具体表达。" : answer.businessFit.canSpeak === "PARTIAL" ? "可以先准备方向；补齐自己的证据后再发布。" : "当前自有资料不足，先补资料再判断是否参与。"}</p>{answer.businessFit.missingEvidence.length ? <p>待补证据：{answer.businessFit.missingEvidence.join("；")}</p> : null}</section>
      <section className="research-specialist-opportunities"><h3>{answer.opportunities.length} 个可继续验证的内容方向</h3>{answer.opportunities.length ? <div className="topic-v2-opportunities">{answer.opportunities.map((item, index) => <article key={index}><h4>{item.topic}</h4><p>{item.angle}</p><dl><div><dt>为什么现在讲</dt><dd>{item.whyNow}</dd></div><div><dt>与别人不同</dt><dd>{item.difference}</dd></div><div><dt>自己的证明</dt><dd>{item.ownProof}</dd></div></dl><p className="topic-v2-flow">{item.flow.join(" → ")}</p><small>{item.limitation}</small><div className="research-nearby-works"><small>对照本次相关内容</small>{refs(item.trendContentRefs)}</div><button type="button" className="research-button" onClick={event=>window.dispatchEvent(new CustomEvent("research:select-finding",{detail:{resultId:latest.id,kind:"run",blockId:"topic-v2-opportunity-"+index,trigger:event.currentTarget}}))}>选这个角度用于创作</button></article>)}</div> : <p>当前项目与资料尚不足以形成可靠的选题机会。</p>}</section>
      <details className="research-specialist-details"><summary>对照本次看到的内容与重复角度</summary>      <section><h3>这次看到的讨论角度</h3>{answer.speakers.length ? <ul>{answer.speakers.map((item, index) => <li key={index}><strong>{item.author}</strong><p>{item.observation}</p>{refs(item.contentRefs)}</li>)}</ul> : <p>本次搜索没有可确认的作者信息。</p>}<div className="topic-v2-grid">{answer.angleClusters.map((item, index) => <article key={index}><h4>{item.angle}</h4><p>{item.howItIsTold}</p>{refs(item.contentRefs)}</article>)}</div></section>
      <section><h3>哪些方向已经重复，哪些值得试探</h3><div className="topic-v2-grid"><div><h4>本次样本中重复</h4>{answer.crowded.map((item, index) => <article key={index}><p>{item.direction}</p>{refs(item.contentRefs)}<small>{item.limitation}</small></article>)}</div><div><h4>当前样本里较少见</h4>{answer.underused.map((item, index) => <article key={index}><p>{item.possibleAngle}</p><small>{item.whyUnderused} · {item.limitation}</small></article>)}</div></div></section>
</details>
      {answer.researchLimits.length ? <details className="research-specialist-details"><summary>这次研究读到了什么、还缺什么</summary><ul>{answer.researchLimits.map((limit,index)=><li key={index}>{limit}</li>)}</ul></details> : null}<ResearchUseFindings key={latest.id} resultId={latest.id} canWrite={canWrite} /><footer>{latest.saved ? <Link className="research-button research-primary" href={`/research/results/run/${latest.id}`}>打开私人保存版本 →</Link> : <span className="research-caption">私人保存或分享给项目，请使用上方选项。</span>}<Link href={`/research/results/run/${latest.id}`}>查看完整版本 →</Link></footer>
    </div> : null}
  </div>;
}
