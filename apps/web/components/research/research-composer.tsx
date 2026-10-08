"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, FileText, Loader2, Plus, X } from "lucide-react";
import { researchSourceLabel } from "./research-labels";
import { RESEARCH_ENTRY_LABELS } from "@content-center/core";
import type { ResearchScope } from "@/server/research/contracts";
type Material = { id: string; title: string | null; sourceType: string };
async function post(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "请求未完成，请重试。"); return result; }
export function ResearchComposer({ sessionId, projectId, canWrite, initialMaterials = [], initialAccounts = [], initialTrends = [], initialScope, initialQuestion = "", initialEntry = "DIRECT", onStarted }: { sessionId?: string; projectId?: string; canWrite: boolean; initialMaterials?: Material[]; initialAccounts?: Array<{ id: string; name: string }>; initialTrends?: Array<{ key: string; title: string }>; initialScope?: ResearchScope; initialQuestion?: string; initialEntry?: keyof typeof RESEARCH_ENTRY_LABELS; onStarted?: () => void }) {
  const router = useRouter();
  const entryLabels = { DIRECT: "主题研究", BREAKDOWN: "单条内容", OPPORTUNITY: "趋势选题", BENCHMARK: "对标账号" };
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [question, setQuestion] = useState(initialQuestion);
  const [entry, setEntry] = useState<keyof typeof RESEARCH_ENTRY_LABELS>(initialEntry);
  const [scope, setScope] = useState<ResearchScope>(initialScope ?? { materialIds: [], benchmarkAccountIds: [], trendKeys: [], notes: "", useCreatorProfile: false, useOwnArtifacts: false });
  const [materials, setMaterials] = useState(initialMaterials);
  const [known, setKnown] = useState(initialMaterials);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const request = useRef<{ value: string; key: string; sessionId?: string } | null>(null);
  useEffect(() => {
    if (!picking) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => { setLoading(true); try { const response = await fetch(`/api/research/materials?q=${encodeURIComponent(search)}`, { signal: controller.signal }); if (!response.ok) throw new Error("资料列表暂时无法读取。"); const data = await response.json() as { items: Material[] }; setMaterials(data.items); setKnown(current => [...new Map([...current, ...data.items].map(item => [item.id, item])).values()]); } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "资料读取失败"); } finally { if (!controller.signal.aborted) setLoading(false); } }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [picking, search]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending.current || !canWrite || !question.trim() || entry === "BREAKDOWN" && !scope.materialIds.length || entry === "BENCHMARK" && !scope.benchmarkAccountIds.length) return;
    pending.current = true; setBusy(true); setError("");
    const value = JSON.stringify({ question: question.trim(), scope, entry, projectId });
    if (request.current?.value !== value) request.current = { value, key: crypto.randomUUID(), sessionId };
    try {
      if (!request.current.sessionId) { const created = await post("/api/research/sessions", { title: question.trim().slice(0, 200), entryTemplate: entry, requestKey: request.current.key, ...(projectId ? { projectId } : {}) }); request.current.sessionId = created.id; }
      const target = request.current.sessionId!;
      await post(`/api/research/sessions/${target}/runs`, { question, scope, requestKey: request.current.key });
      request.current = null; setQuestion(""); setPicking(false); onStarted?.();
      if (!sessionId) router.push(`/research/session/${target}`); else router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "研究未能开始，请重试。"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form className="research-composer" data-ready={ready} inert={!ready} onSubmit={submit} aria-label={sessionId ? "继续研究" : "开始研究"}>
    {!sessionId ? <div className="research-entry-tabs">{Object.entries(entryLabels).filter(([key]) => key !== "OPPORTUNITY" || initialEntry === "OPPORTUNITY").map(([key, label]) => <button key={key} type="button" aria-pressed={entry === key} onClick={() => setEntry(key as typeof entry)}>{label}</button>)}</div> : null}
    <label className="research-question-label" htmlFor="research-question">{sessionId ? "继续追问" : "你想研究什么？"}</label>
    <textarea id="research-question" maxLength={10000} value={question} onChange={event => setQuestion(event.target.value)} placeholder={sessionId ? "换一个角度、比较资料，或继续核实这个判断…" : entry === "DIRECT" ? "比如：我想解释一个行业问题，需要哪些资料和观点？" : "比如：它选了什么题，如何开头和推进？哪些方法适合我的内容？"} rows={sessionId ? 2 : 3} disabled={!canWrite || busy} />
    {scope.materialIds.length ? <div className="research-attachments">{scope.materialIds.map(id => <span key={id}><FileText size={13} />{known.find(item => item.id === id)?.title || "已选择资料"}<button type="button" aria-label="移除这条资料" disabled={busy} onClick={() => setScope(current => ({ ...current, materialIds: current.materialIds.filter(value => value !== id) }))}><X size={12} /></button></span>)}</div> : null}
    {scope.benchmarkAccountIds.length ? <div className="research-attachments">{scope.benchmarkAccountIds.map(id => <span key={id}>对标账号：{initialAccounts.find(item => item.id === id)?.name || "已选择账号"}<button type="button" aria-label="移除这个对标账号" disabled={busy} onClick={() => setScope(current => ({ ...current, benchmarkAccountIds: current.benchmarkAccountIds.filter(value => value !== id) }))}><X size={12} /></button></span>)}</div> : null}
    {scope.trendKeys.length ? <div className="research-attachments">{scope.trendKeys.map(key => <span key={key}>趋势：{initialTrends.find(item => item.key === key)?.title || "已选择趋势"}<button type="button" aria-label="移除这个趋势" disabled={busy} onClick={() => setScope(current => ({ ...current, trendKeys: current.trendKeys.filter(value => value !== key) }))}><X size={12} /></button></span>)}</div> : null}
    <div className="research-composer-actions"><button type="button" aria-expanded={picking} disabled={!canWrite || busy} onClick={() => setPicking(!picking)}><Plus size={15} />添加资料</button><details><summary>研究范围</summary><label>用户补充<textarea value={scope.notes} maxLength={20000} onChange={event => setScope(current => ({ ...current, notes: event.target.value }))} disabled={busy} /></label><label className="research-check"><input type="checkbox" checked={scope.useCreatorProfile} onChange={event => setScope(current => ({ ...current, useCreatorProfile: event.target.checked }))} disabled={busy} />使用我的私人创作者背景</label>{entry === "OPPORTUNITY" ? <label className="research-check"><input type="checkbox" checked={scope.useOwnArtifacts} onChange={event => setScope(current => ({ ...current, useOwnArtifacts: event.target.checked }))} disabled={busy} />参考我已保存的项目产出标题，帮助发现重复选题（不读取正文）</label> : null}<p>背景仅用于当前私人研究；分享结论时需要你明确选择和确认，完整会话不会自动共享。</p></details><button type="submit" className="research-primary" disabled={!canWrite || busy || !question.trim() || entry === "BREAKDOWN" && !scope.materialIds.length || entry === "BENCHMARK" && !scope.benchmarkAccountIds.length}>{busy ? <Loader2 size={16} className="research-spin" /> : <ArrowUp size={16} />}{busy ? "正在提交" : sessionId ? "继续研究" : "开始研究"}</button></div>
    {picking ? <div className="research-material-picker"><label>查找已保存资料<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="按标题查找" /></label><small>最多选择 10 条；没有正文的资料会明确提示缺口。</small>{loading ? <p role="status">正在读取资料列表…</p> : materials.length ? <div>{materials.map(item => <label key={item.id}><input type="checkbox" checked={scope.materialIds.includes(item.id)} disabled={!scope.materialIds.includes(item.id) && scope.materialIds.length >= 10} onChange={event => setScope(current => ({ ...current, materialIds: event.target.checked ? [...current.materialIds, item.id] : current.materialIds.filter(id => id !== item.id) }))} /><span>{researchSourceLabel(item.title, item.sourceType)}</span></label>)}</div> : <p>没有找到资料。可先到资料库导入，也可直接输入问题。</p>}</div> : null}
    {!sessionId ? <div className="research-object-shortcuts"><span>选择研究对象</span><Link href="/research/benchmarks">选择对标账号 →</Link><Link href="/research/trends">浏览趋势 →</Link></div> : null}
    <p className="research-composer-note">{entry === "BREAKDOWN" && !scope.materialIds.length ? "先添加要研究的内容，再问一个你关心的问题，不限定分析维度。" : entry === "BENCHMARK" && !scope.benchmarkAccountIds.length ? "先选择对标账号，再提出你想弄清的问题。" : "研究无需先选专业技能。发送才调用 AI，可能产生费用；结果会标明来源和缺口。"}</p>
    {!canWrite ? <p role="status">当前为只读权限，可阅读已有研究。</p> : null}{error ? <p className="research-error" role="alert">{error}</p> : null}
  </form>;
}
