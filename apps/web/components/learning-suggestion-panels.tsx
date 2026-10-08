"use client";

import { Button } from "@content-center/ui";
import { Check, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type MethodSuggestion = { id: string; typeLabel: string; title: string; steps: string[]; applicableScenarios: string[]; boundaries: string[]; rationale: string; stabilityLabel: string; sampleCount: number; sourceRefs: string[]; status: "PENDING" | "ACCEPTED" | "REJECTED"; statusLabel: string; savedMethodAssetId: string | null };
type ProfileSuggestion = { id: string; typeLabel: string; currentValue: unknown; proposedValue: string; rationale: string; evidenceRefs: string[]; sampleCount: number; status: "PENDING" | "ACCEPTED" | "REJECTED"; statusLabel: string };

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "操作失败，请稍后再试。");
  return body;
}

export function MethodSuggestionPanel({ benchmarkAccountId, studyId, initial, editable }: { benchmarkAccountId: string; studyId: string | null; initial: MethodSuggestion[]; editable: boolean }) {
  const [items, setItems] = useState(initial); const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const started = useRef(false);
  async function generate() {
    if (!studyId || busy) return; setBusy("generate"); setMessage("");
    try { const body = await request(`/api/discovery/benchmarks/${benchmarkAccountId}/method-suggestions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ benchmarkStudyId: studyId }) }); setItems(body.items); }
    catch (error) { setMessage(error instanceof Error ? error.message : "暂时没整理出可复用的方法，可以稍后再试。"); }
    finally { setBusy(""); }
  }
  useEffect(() => { if (!editable || !studyId || initial.length || started.current) return; started.current = true; void generate(); }, [editable, studyId, initial.length]);
  async function decide(item: MethodSuggestion, decision: "SAVE" | "REJECT", content?: { title: string; steps: string[]; applicableScenarios: string[]; boundaries: string[] }) {
    setBusy(item.id); setMessage("");
    try { const body = await request(`/api/discovery/benchmarks/${benchmarkAccountId}/method-suggestions/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, ...content }) }); setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: body.status, statusLabel: body.status === "ACCEPTED" ? "已保存" : "不采用", savedMethodAssetId: body.method?.id ?? value.savedMethodAssetId } : value)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法处理这条建议。"); }
    finally { setBusy(""); }
  }
  return <section className="learning-suggestion-section" aria-labelledby="method-suggestion-title"><header><div><h2 id="method-suggestion-title">值得保存的方法</h2><p>从真实研究结果中挑出可复用的写法，保存前仍可修改。</p></div>{editable && studyId ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void generate()}>{busy === "generate" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}重新整理</Button> : null}</header>{message ? <p role="status" className="learning-suggestion-message">{message}</p> : null}{items.length ? <div className="learning-suggestion-list">{items.map((item) => <MethodSuggestionCard key={item.id} item={item} busy={busy === item.id} editable={editable} onDecide={decide} />)}</div> : busy === "generate" ? <p className="learning-suggestion-empty">正在整理值得保存的方法…</p> : <p className="learning-suggestion-empty">暂时没有形成值得保存的方法。</p>}</section>;
}

function MethodSuggestionCard({ item, busy, editable, onDecide }: { item: MethodSuggestion; busy: boolean; editable: boolean; onDecide: (item: MethodSuggestion, decision: "SAVE" | "REJECT", content?: { title: string; steps: string[]; applicableScenarios: string[]; boundaries: string[] }) => Promise<void> }) {
  const [editing, setEditing] = useState(false); const [title, setTitle] = useState(item.title); const [steps, setSteps] = useState(item.steps.join("\n")); const [applicable, setApplicable] = useState(item.applicableScenarios.join("\n")); const [boundaries, setBoundaries] = useState(item.boundaries.join("\n")); const lines = (value: string) => value.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
  return <article><div className="learning-suggestion-meta"><span>{item.typeLabel}</span><span>{item.stabilityLabel}</span><b>{item.statusLabel}</b></div><h3>{item.title}</h3><p>{item.rationale}</p><details><summary>查看怎么做和来源 <ChevronDown size={15} /></summary><div className="learning-suggestion-details"><section><b>怎么做</b><ul>{item.steps.map((step) => <li key={step}>{step}</li>)}</ul></section><section><b>适合</b><ul>{item.applicableScenarios.map((value) => <li key={value}>{value}</li>)}</ul></section><section><b>不适合</b><ul>{item.boundaries.map((value) => <li key={value}>{value}</li>)}</ul></section><small>依据：{item.sampleCount} 条研究样本，来源记录已保留</small></div></details>{item.status === "ACCEPTED" && item.savedMethodAssetId ? <footer><Link href={`/library/methods/${item.savedMethodAssetId}`}>查看已保存的Skill</Link></footer> : item.status === "PENDING" && editable ? editing ? <div className="learning-suggestion-editor"><label>Skill名称<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>怎么做<textarea value={steps} onChange={(event) => setSteps(event.target.value)} /></label><label>适合什么场景<textarea value={applicable} onChange={(event) => setApplicable(event.target.value)} /></label><label>不适合什么场景<textarea value={boundaries} onChange={(event) => setBoundaries(event.target.value)} /></label><div><Button disabled={busy} onClick={() => void onDecide(item, "SAVE", { title, steps: lines(steps), applicableScenarios: lines(applicable), boundaries: lines(boundaries) })}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}保存Skill</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>取消</Button></div></div> : <footer><Button variant="secondary" onClick={() => setEditing(true)}>保存为Skill</Button><button type="button" disabled={busy} onClick={() => void onDecide(item, "REJECT")}><X size={14} />不采用</button></footer> : null}</article>;
}

export function CreatorProfileSuggestionPanel({ initial, editable }: { initial: ProfileSuggestion[]; editable: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial); const [busy, setBusy] = useState(""); const [message, setMessage] = useState("");
  async function generate() { setBusy("generate"); setMessage(""); try { const body = await request("/api/creator-profile/suggestions", { method: "POST" }); setItems(body.items); setMessage(body.reason || (body.created ? "已整理最近的表达变化。" : "没有发现新的稳定变化。")); } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法整理最近的表达变化。"); } finally { setBusy(""); } }
  async function decide(item: ProfileSuggestion, decision: "ACCEPT" | "REJECT") { setBusy(item.id); setMessage(""); try { const body = await request(`/api/creator-profile/suggestions/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }); setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: body.status, statusLabel: body.status === "ACCEPTED" ? "已接受" : "不采用" } : value)); if (body.status === "ACCEPTED") router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法处理这条建议。"); } finally { setBusy(""); } }
  return <section className="learning-suggestion-section" aria-labelledby="profile-suggestion-title"><header><div><h2 id="profile-suggestion-title">最近发现的表达变化</h2><p>只比较已确认稿件，接受后才会更新创作画像。</p></div>{editable ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void generate()}>{busy === "generate" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}整理最近变化</Button> : null}</header>{message ? <p role="status" className="learning-suggestion-message">{message}</p> : null}{items.length ? <div className="learning-suggestion-list">{items.map((item) => <article key={item.id}><div className="learning-suggestion-meta"><span>{item.typeLabel}</span><span>依据 {item.sampleCount} 篇确认稿</span><b>{item.statusLabel}</b></div><h3>{item.proposedValue}</h3><p>{item.rationale}</p><div className="learning-suggestion-change"><small>当前</small><p>{Array.isArray(item.currentValue) ? item.currentValue.join("、") || "尚未设置" : String(item.currentValue || "尚未设置")}</p><small>建议修改后</small><p>{item.proposedValue}</p></div>{item.status === "PENDING" && editable ? <footer><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void decide(item, "ACCEPT")}><Check size={14} />接受更新</Button><button type="button" disabled={Boolean(busy)} onClick={() => void decide(item, "REJECT")}><X size={14} />不采用</button></footer> : null}</article>)}</div> : <p className="learning-suggestion-empty">积累至少 5 篇确认稿后，才能判断稳定变化。</p>}</section>;
}
