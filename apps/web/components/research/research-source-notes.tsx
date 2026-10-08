"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
export function ResearchSourceNotes({ sourceId, title, canWrite, readable, clippings, topics }: { sourceId: string; title: string; canWrite: boolean; readable: boolean; clippings: Array<{ id: string; title: string }>; topics: Array<{ id: string; title: string; projectId: string | null }> }) {
  const router = useRouter(), pending = useRef(false), controller = useRef<AbortController | null>(null), request = useRef<{ signature: string; key: string } | null>(null);
  const [ready, setReady] = useState(false), [mode, setMode] = useState<"clip" | "topic" | null>(null), [quote, setQuote] = useState(""), [note, setNote] = useState(""), [topicNote, setTopicNote] = useState(""), [topicTitle, setTopicTitle] = useState(title);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [savedHref, setSavedHref] = useState("");
  useEffect(() => { setReady(true); return () => controller.current?.abort(); }, [sourceId]);
  function close() { controller.current?.abort(); setMode(null); setError(""); setConfirmed(false); }
  function chooseText() {
    const selection = window.getSelection(), parent = selection?.anchorNode?.parentElement;
    if (!selection?.toString().trim() || !parent?.closest(".research-source-original")) { setError("请先在上面的原内容中选择一段文字，或将原文复制到摘录框。"); return; }
    setQuote(selection.toString().trim().slice(0,8000)); setError("");
  }
  async function save() {
    if (!canWrite || pending.current || !mode || mode === "clip" && !quote.trim() || mode === "topic" && (!topicTitle.trim() || !confirmed)) return;
    const aborter = new AbortController(); controller.current = aborter; pending.current = true; setBusy(true); setError(""); setNotice("");
    const signature = JSON.stringify({ sourceId, quote, note });
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    try {
      const body = mode === "clip" ? { requestKey: request.current.key, quote, note } : { title: topicTitle, note: topicNote, confirmWorkspaceVisibility: confirmed };
      const response = await fetch("/api/research/sources/" + sourceId + (mode === "clip" ? "/clippings" : "/topic"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: aborter.signal });
      const value = await response.json(); if (!response.ok) throw Error(value.message || "保存未完成，当前输入保留。");
      if (aborter.signal.aborted) return;
      setNotice(mode === "clip" ? "摘录与备注已保存在私人研究中，未调用 AI、未分享、未发送创作消息。" : "选题已保存到既有选题库；相同来源和同名选题保留已有记录，没有生成稿件。");
      setSavedHref(mode === "clip" ? "/research/results/run/" + value.id : value.href); setMode(null); setConfirmed(false); router.refresh();
    } catch (cause) { if (!aborter.signal.aborted) setError(cause instanceof Error ? cause.message : "保存失败。"); }
    finally { pending.current = false; if (!aborter.signal.aborted) setBusy(false); }
  }
  return <section className="research-source-card" aria-label="摘录与选题" data-ready={ready} inert={!ready}>
    <h2>把有用的部分留下</h2><p>摘录与自己的备注默认仅本人可见。入选题是另一个明确动作，会保存到工作空间既有选题库。</p>
    <div className="research-source-actions"><button className="research-button" type="button" disabled={!canWrite || !readable || busy} onClick={() => { setMode("clip"); setError(""); }}>保存原文摘录 / 写备注</button><button className="research-button" type="button" disabled={!canWrite || busy} onClick={() => { setMode("topic"); setConfirmed(false); setError(""); }}>作为候选选题</button></div>
    {mode ? <div className="research-findings-panel"><h3>{mode === "clip" ? "我的私人摘录" : "确认候选选题"}</h3>
      {mode === "clip" ? <><button type="button" className="research-button" onClick={chooseText}>带入已选原文</button><label>原文摘录<textarea aria-label="原文摘录" value={quote} maxLength={8000} rows={4} onChange={event => setQuote(event.target.value)} disabled={busy} placeholder="从上面已保存的原内容中选择或复制片段" /></label><p className="research-caption">服务端会核对这段文字仍存在于原件。手工摘录不会伪装成 AI 分析。</p></> : <><label>候选选题<input aria-label="候选选题" value={topicTitle} maxLength={300} onChange={event => setTopicTitle(event.target.value)} disabled={busy} /></label><p>只引用当前来源与下方手工说明，不携带私人研究或完整聊天。</p></>}
      <label>{mode === "clip" ? "我的备注" : "入选题理由"}<textarea aria-label={mode === "clip" ? "我的备注" : "入选题理由"} value={mode === "clip" ? note : topicNote} maxLength={mode === "clip" ? 8000 : 2000} rows={3} onChange={event => mode === "clip" ? setNote(event.target.value) : setTopicNote(event.target.value)} disabled={busy} /></label>
      {mode === "topic" ? <label className="research-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />我确认选题标题、理由与当前来源将对本工作空间有读取权限的成员可见</label> : <p className="research-caption">仅本人可见。未确认前取消不会新增记录。</p>}
      <div className="research-source-actions"><button className="research-button research-primary" type="button" onClick={() => void save()} disabled={busy || mode === "clip" && !quote.trim() || mode === "topic" && (!confirmed || !topicTitle.trim())}>{busy ? "正在保存…" : mode === "clip" ? "确认保存私人摘录" : "确认入选题"}</button><button className="research-button" type="button" disabled={busy} onClick={close}>取消本次保存</button></div>
    </div> : null}
    {error ? <p className="research-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice} {savedHref ? <Link href={savedHref}>打开保存记录 →</Link> : null}</p> : null}
    {clippings.length ? <details><summary>这份来源的私人摘录 · {clippings.length} 项</summary>{clippings.map(item => <p key={item.id}><Link href={"/research/results/run/" + item.id}>{item.title}</Link></p>)}</details> : null}
    {topics.length ? <details><summary>已有候选选题 · {topics.length} 项，先查看以免重复</summary>{topics.map(item => <p key={item.id}><Link href={item.projectId ? "/dashboard?project=" + item.projectId : "/discovery/ideas/" + item.id}>{item.title}</Link></p>)}</details> : null}
  </section>;
}
