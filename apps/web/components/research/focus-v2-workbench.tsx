"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { focusV2Library } from "@/server/research/focus-v2-service";

type Library = Awaited<ReturnType<typeof focusV2Library>>;
export function FocusV2SaveButton({ sessionId, runId, canWrite }: { sessionId: string; runId: string; canWrite: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save() {
    if (!canWrite || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/research/sessions/${sessionId}/runs/${runId}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存失败，请重试。");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <div><button type="button" className="research-button research-primary" disabled={!canWrite || busy} onClick={() => void save()}>{busy ? "正在保存…" : "保存这版研究"}</button>{error ? <p role="alert" className="research-error">{error}</p> : null}</div>;
}
export function FocusV2Workbench({ library, initialAccountIds, canWrite }: { library: Library; initialAccountIds: string[]; canWrite: boolean }) {
  const router = useRouter();
  const [accountIds, setAccountIds] = useState(initialAccountIds.filter(id => library.accounts.some(item => item.id === id)).slice(0, 3));
  const [workIds, setWorkIds] = useState<string[]>([]);
  const [question, setQuestion] = useState(initialAccountIds.length > 1 ? "这些账号在选题、开头和证明方式上有什么真正不同？哪些做法可以迁移？" : "");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [active, setActive] = useState<{ id: string; sessionId: string } | null>(null);
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>; let failures = 0; const started = Date.now();
    const poll = async () => {
      try { const response = await fetch(`/api/research/sessions/${active.sessionId}/runs/${active.id}`, { cache: "no-store" });
        const run = await response.json(); if (!response.ok) throw new Error(run.message || "状态不可用");
        if (disposed) return; failures = 0;
        if (!["QUEUED", "RUNNING"].includes(run.status)) { disposed = true; setActive(null);
          setMessage(run.status === "COMPLETED" ? "专项研究完成，结果已形成独立版本。" : run.errorMessage || "本次研究未完成，已有成果仍保留。"); router.refresh(); return; }
      } catch { if (!disposed && ++failures >= 5) { disposed = true; setMessage("暂时无法连接研究状态，请稍后刷新。"); } }
      if (!disposed && Date.now() - started < 16 * 60_000) timer = setTimeout(poll, 4000);
      else if (!disposed) { disposed = true; setMessage("研究仍可能在后台继续，请稍后刷新查看。"); }
    };
    void poll(); return () => { disposed = true; clearTimeout(timer); };
  }, [active?.id, active?.sessionId, router]);
  function toggleAccount(id: string) { setAccountIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 3 ? [...current, id] : current); setWorkIds([]); }
  function toggleWork(id: string) { setWorkIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 30 ? [...current, id] : current); }
  async function start() {
    if (!canWrite || busy || active || !accountIds.length || question.trim().length < 2) return;
    setBusy(true); setMessage(""); requestKey.current ||= crypto.randomUUID();
    try { const response = await fetch("/api/research/focus-v2", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestKey: requestKey.current, question: question.trim(), accountIds, ...(workIds.length ? { workIds } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "暂时无法开始专项研究。");
      requestKey.current = null;
      if (result.unchanged) { setMessage("证据与问题都没有变化，沿用已完成的研究版本。"); router.refresh(); }
      else setActive({ id: result.runId, sessionId: result.sessionId });
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法开始研究。"); }
    finally { setBusy(false); }
  }
  const availableWorks = library.works.filter(work => accountIds.includes(work.accountId));
  return <div className="research-focus-workbench"><section className="research-section"><header><h2>我要研究的问题</h2><span>只分析与问题有关的维度</span></header>
    <label className="research-focus-question">例如：这个账号最近的开头为什么变了？<textarea value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} placeholder="写下你真正想弄清的问题" disabled={busy || Boolean(active)} /></label>
    <h3>选择对标账号</h3><div className="research-focus-accounts">{library.accounts.map(item => <label key={item.id}><input type="checkbox" checked={accountIds.includes(item.id)} onChange={() => toggleAccount(item.id)} disabled={busy || Boolean(active) || !accountIds.includes(item.id) && accountIds.length >= 3} /><span>{item.name}</span><small>{item.platform}</small></label>)}</div>
    <details className="research-focus-work-picker"><summary>指定要比较的作品（可选）</summary><p>默认使用所选账号已完成的新版作品深拆；勾选后只研究这些作品。任何其他作品都可先从账号作品库深拆，再加入这里。</p><div>{availableWorks.map(work => <label key={work.id}><input type="checkbox" checked={workIds.includes(work.id)} onChange={() => toggleWork(work.id)} disabled={busy || Boolean(active) || !workIds.includes(work.id) && workIds.length >= 30} /><span>{work.title}</span></label>)}</div></details>
    <div className="research-focus-actions"><button type="button" className="research-button research-primary" disabled={!canWrite || busy || Boolean(active) || !accountIds.length || question.trim().length < 2} onClick={() => void start()}>{busy ? "正在准备…" : active ? "正在研究…" : accountIds.length > 1 ? "比较这些账号" : "研究这个问题"}</button><p>点击后才调用模型；先复用现有作品深拆和账号 Pattern，未研究作品不会被当作已读正文。</p></div>
    {message ? <p role="status" className="research-caption">{message}</p> : null}
  </section>
  <section className="research-section"><header><h2>最近的专项研究</h2><span>每个问题保留自己的证据与版本</span></header>{library.studies.length ? <ul className="research-focus-history">{library.studies.map(item => <li key={item.id}><div><small>{item.accountNames.join(" · ")} · 第 {item.version} 版 · {new Date(item.at).toLocaleDateString("zh-CN")}</small><h3>{item.question}</h3>{item.directAnswer ? <p>{item.directAnswer}</p> : <p>{item.status === "FAILED" ? item.errorMessage || "本次未完成" : "正在形成研究结果"}</p>}</div>{item.status === "COMPLETED" ? <Link href={`/research/focus/${item.id}`}>阅读研究 →</Link> : null}</li>)}</ul> : <p className="research-center-empty-inline">还没有专项研究。先选一个账号，提出真正想解决的问题。</p>}</section>
  </div>;
}
