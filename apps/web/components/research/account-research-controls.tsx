"use client";
import Link from "next/link";
import { ResearchUseFindings } from "./research-use-findings";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { AccountResearchView } from "@/server/research/account-research-service";

const stages: Record<string, string> = { QUEUED: "准备研究", READING: "核对当前证据", ANALYZING: "分析新证据并复核旧判断", COMPLETED: "研究完成", FAILED: "本次研究未完成" };
export function AccountResearchControls({ accountId, value, canWrite, collectionRunId, from = "", to = "" }: { accountId: string; value: AccountResearchView; canWrite: boolean; collectionRunId: string; from?: string; to?: string }) {
  const router = useRouter(); const [active, setActive] = useState(value.active); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [stage, setStage] = useState("");
  const requestScope = useRef(""); const pending = useRef(false); const requestKey = useRef<string | null>(null);
  useEffect(() => { setActive(value.active); }, [value.active]);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let failures = 0; let timer: ReturnType<typeof setTimeout>; let controller: AbortController | null = null;
    const started = Date.now();
    const poll = async () => {
      controller = new AbortController(); const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch(`/api/research/sessions/${active.sessionId}/runs/${active.id}`, { cache: "no-store", signal: controller.signal });
        const state = await response.json(); if (!response.ok) throw new Error(state.message || "暂时无法读取状态");
        if (disposed) return; failures = 0; setStage(stages[state.stage] || "正在研究");
        if (!["QUEUED", "RUNNING"].includes(state.status)) { disposed = true; setActive(null); setMessage(state.status === "COMPLETED" ? "新版本已保留，历史研究没有被覆盖。" : state.errorMessage || "本次研究未完成，可以重试。"); router.refresh(); return; }
      } catch { if (!disposed && ++failures >= 5) { disposed = true; setMessage("状态暂时无法连接。稍后点击“检查证据”重新读取，已有研究仍然保留。"); } }
      finally { clearTimeout(timeout); if (!disposed && Date.now() - started < 16 * 60 * 1000) timer = setTimeout(poll, 3500); else if (!disposed) { disposed = true; setMessage("研究耗时较长，已暂停状态刷新。点击检查证据可重新查看进度。"); } }
    };
    void poll(); return () => { disposed = true; controller?.abort(); clearTimeout(timer); };
  }, [active?.id, active?.sessionId, router]);
  const changedScope = collectionRunId !== value.requestedScope.collectionRunId || from !== value.requestedScope.from || to !== value.requestedScope.to;
  const needsUpdate = !value.latest || value.update?.needed || changedScope;
  async function update() {
    if (pending.current || !canWrite) return;
    pending.current = true; setBusy(true); setMessage(""); const scopeKey = JSON.stringify([accountId, collectionRunId, from, to]); if (requestScope.current !== scopeKey) { requestKey.current = null; requestScope.current = scopeKey; } requestKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch(`/api/research/benchmarks/${accountId}/research`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestKey: requestKey.current, collectionRunId, ...(from ? { from } : {}), ...(to ? { to } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "研究未能开始。");
      requestKey.current = null;
      if (result.unchanged) { setMessage(`证据没有变化，沿用第 ${result.version} 版，没有重复调用模型。`); router.refresh(); }
      else { setActive({ id: result.runId, sessionId: result.sessionId, status: result.status, stage: result.status }); setStage(stages[result.status] || "准备研究"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "研究未能开始，请重试。"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function save() {
    if (!value.latest || busy) return;
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/research/sessions/${value.latest.sessionId}/runs/${value.latest.id}`, { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "保存失败"); setMessage("已保存为可引用的研究成果，可以加入项目。"); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <div className="account-research-controls"><div className="account-research-action-row"><button type="button" className="dossier-primary" disabled={!canWrite || busy || Boolean(active) || !value.update || !needsUpdate} onClick={() => void update()}>{busy || active ? <Loader2 size={14} className="research-spin" /> : value.latest ? <RefreshCw size={14} /> : <Sparkles size={14} />}{active ? stage || "正在研究" : value.latest ? needsUpdate ? "更新研究" : "研究已是最新" : "开始账号研究"}</button><button type="button" onClick={() => router.refresh()} disabled={busy}>检查证据</button>{value.sessionId ? <Link className="dossier-text-link" href={`/research/session/${value.sessionId}`}>继续提问 →</Link> : null}{value.latest ? value.latest.saved ? <Link className="dossier-text-link" href={`/research/results/run/${value.latest.id}`}>查看已保存研究 →</Link> : <button type="button" disabled={!canWrite || busy} onClick={() => void save()}>保存为研究成果</button> : null}</div>
    <p className="dossier-footnote">{active ? "可以离开页面，研究会作为新版本保留。" : value.latest && !needsUpdate ? "当前证据与已有研究一致，再次检查不会重复调用模型。" : "点击后才调用 AI。只重做新增或变更内容的逐条分析，并综合复核旧判断。"}</p>
    {value.update ? <p className="dossier-footnote">当前有 {value.update.metadata} 条基础记录、{value.update.readable} 条可读正文{value.update.comments ? `、${value.update.comments} 条评论样本` : ""}。{value.latest ? `新增作品 ${value.update.added} 条，正文变化 ${value.update.updatedText} 条，指标或标题变化 ${value.update.updatedMetadata} 条。` : "有多少真实证据，就从多少开始。"}</p> : <p className="dossier-footnote">当前范围还没有作品证据，先更新数据或扩大范围。</p>}
    {value.latest ? <ResearchUseFindings key={value.latest.id} resultId={value.latest.id} canWrite={canWrite} /> : null}
    {message ? <p role="status" className="account-research-message">{message}</p> : value.failure && needsUpdate ? <p role="status" className="account-research-message">{value.failure}</p> : null}
  </div>;
}
