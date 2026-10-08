"use client";

import { Check, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { getMaterialKnowledge } from "@/server/material-knowledge/service";

type State = Awaited<ReturnType<typeof getMaterialKnowledge>>;

async function request(url: string, init?: RequestInit) { const response = await fetch(url, init); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || "整理失败，可以重新试一次。"); return result; }
function locator(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return "真实原文"; const row = value as Record<string, unknown>; if (typeof row.startMs === "number") { const seconds = Math.floor(row.startMs / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; } return "原文摘录"; }

export function MaterialKnowledgeCard({ sourceId, initial, editable }: { sourceId: string; initial: State; editable: boolean }) {
  const [state, setState] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [edits, setEdits] = useState<Record<string, string>>({}); const started = useRef(false);
  const extract = async () => { if (!editable || busy) return; setBusy(true); setError(""); try { const result = await request(`/api/source-items/${sourceId}/knowledge`, { method: "POST" }) as { state: State }; setState(result.state); } catch (cause) { setError(cause instanceof Error ? cause.message : "整理失败，可以重新试一次。"); } finally { setBusy(false); } };
  useEffect(() => { if (state.status === "READY_TO_EXTRACT" && editable && !started.current) { started.current = true; void extract(); } }, [editable, state.status]);
  const decide = async (candidateId: string, decision: "CONFIRM" | "REJECT", content?: string) => { setBusy(true); setError(""); try { await request(`/api/source-items/${sourceId}/knowledge/candidates/${candidateId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, ...(decision === "CONFIRM" ? { content: content?.trim() || state.candidates.find((candidate) => candidate.id === candidateId)?.content } : {}) }) }); const refreshed = await request(`/api/source-items/${sourceId}/knowledge`) as State; setState(refreshed); setEdits((current) => { const next = { ...current }; delete next[candidateId]; return next; }); } catch (cause) { setError(cause instanceof Error ? cause.message : "处理失败，请重试。"); } finally { setBusy(false); } };
  const candidates = state.candidates.filter(({ status }) => status !== "REJECTED");
  const confirmable = candidates.filter((candidate) => candidate.canConfirm);
  const references = candidates.filter((candidate) => !candidate.canConfirm);
  const renderCandidate = (candidate: State["candidates"][number]) => <article key={candidate.id}><div><span>{candidate.category}</span><i>{candidate.ownershipLabel}</i><b>{candidate.statusLabel}</b></div>{candidate.status === "PENDING" && editable && candidate.canConfirm ? <textarea aria-label={`编辑待确认内容 ${candidate.content}`} value={edits[candidate.id] ?? candidate.content} onChange={(event) => setEdits((current) => ({ ...current, [candidate.id]: event.target.value }))} /> : <p>{candidate.content}</p>}<small>来源：{state.source.title} · {locator(candidate.locator)}</small><details><summary>查看原文</summary><blockquote>{candidate.originalExcerpt}</blockquote></details>{candidate.status === "PENDING" && editable && candidate.canReject ? <footer>{candidate.canConfirm ? <button type="button" disabled={busy} onClick={() => void decide(candidate.id, "CONFIRM", edits[candidate.id])}><Check size={14} />确认</button> : null}<button type="button" disabled={busy} onClick={() => void decide(candidate.id, "REJECT")}><X size={14} />不采用</button></footer> : null}</article>;
  return <section className="material-knowledge-card" data-testid="material-knowledge-card"><header><div><h3>值得参考的信息</h3><p>{state.summary || "整理结果来自这条资料中的真实原文；外部内容仍保持参考边界。"}</p></div><span>{busy ? "正在整理内容" : state.employeeStatus}</span></header>
    {references.length ? <div className="material-knowledge-list">{references.map(renderCandidate)}</div> : null}
    {confirmable.length ? <section className="material-confirmable-section"><header><h3>可确认信息</h3><p>只有真实属于内部资料的信息才会进入确认流程。</p></header><div className="material-knowledge-list">{confirmable.map(renderCandidate)}</div></section> : null}
    {!references.length && !confirmable.length && state.status === "COMPLETE" ? <p className="material-knowledge-empty">这条资料没有需要人工确认的信息，外部内容仍可作为研究参考。</p> : null}
    {error || state.status === "FAILED" ? <div className="material-knowledge-error"><p>{error || "整理失败，可以重新试一次。"}</p>{editable ? <button type="button" disabled={busy} onClick={() => void extract()}><RefreshCw size={14} />重新整理</button> : null}</div> : null}
  </section>;
}
