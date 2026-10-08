"use client";

import { Badge, Button, Card } from "@content-center/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MaterialAnalysisDTO, MaterialAnalysisJobDTO } from "@/server/material-analysis/service";
import type { CurrentMaterialAnalysisOutput, MaterialAnalysisOutput } from "@/server/material-analysis/schemas";

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请重试。");
  return result;
}

export function MaterialAnalysisCard({ sourceId, current: initial, latestAttempt: latestInitial, job: jobInitial, history, canEdit, llmStatus, hasTranscript, contentLabel = "文字稿", embedded = false, showCreateAction = true, compact = false }: {
  sourceId: string;
  current: MaterialAnalysisDTO | null;
  latestAttempt: MaterialAnalysisDTO | null;
  job: MaterialAnalysisJobDTO | null;
  history: MaterialAnalysisDTO[];
  canEdit: boolean;
  llmStatus: string;
  hasTranscript: boolean;
  contentLabel?: string;
  embedded?: boolean;
  showCreateAction?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const analysisStarting = useRef(false);
  const [currentResult, setCurrentResult] = useState(initial);
  const [latestAttempt, setLatestAttempt] = useState(latestInitial);
  const [job, setJob] = useState(jobInitial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const configured = llmStatus === "CONFIGURED";
  const processing = latestAttempt?.status === "PROCESSING" || job?.status === "QUEUED" || job?.status === "RUNNING";
  const failed = !processing && latestAttempt?.status === "FAILED";
  const Container = embedded ? "section" : Card;

  useEffect(() => {
    setCurrentResult(initial);
    setLatestAttempt(latestInitial);
    setJob(jobInitial);
  }, [initial, latestInitial, jobInitial]);

  async function analyze() {
    if (analysisStarting.current) return;
    const needsConfirmation = Boolean(currentResult && latestAttempt?.id === currentResult.id && !processing);
    if (needsConfirmation && !confirming) { setConfirming(true); return; }
    analysisStarting.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(`/api/source-items/${sourceId}/material-analysis`, "POST") as MaterialAnalysisRequestDTO;
      setLatestAttempt({ ...result, status: "PROCESSING", errorCode: null, errorMessage: null });
      setJob({ id: result.jobId, status: "QUEUED", progress: 0, attempt: 0, maxAttempts: 3, errorCode: null, errorMessage: null, updatedAt: new Date().toISOString() });
      setConfirming(false);
      setNotice("已开始理解这条内容，你可以先离开页面，回来后继续查看。");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "内容理解没有完成，请重试。"); }
    finally { analysisStarting.current = false; setBusy(false); }
  }

  async function createContent() {
    setBusy(true); setError("");
    try { const result = await request(`/api/source-items/${sourceId}/material-analysis/project`, "POST") as { projectId: string }; router.push(`/dashboard?project=${result.projectId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法进入创作页面。"); setBusy(false); }
  }

  const statusLabel = processing ? (job?.status === "QUEUED" ? "等待" : "处理中") : failed ? "需要重试" : currentResult ? "已完成" : "尚未理解";
  const actionLabel = failed || currentResult ? "重新理解" : "内容理解";

  return <Container className={`${embedded ? "material-analysis-panel" : "p-5"}${compact ? " material-analysis-compact" : ""}`} data-testid="material-analysis-card">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{compact ? "AI 已帮你看完这条内容" : "内容理解"}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{compact ? "从主题、关键观点和可用信息里提炼重点。" : "先弄清这条到底在讲什么、面向谁，以及表达是怎样展开的。"}</p></div><Badge>{statusLabel}</Badge></div>
    {!hasTranscript && !currentResult ? <div className="material-feature-state"><p>完成{contentLabel}后，可以继续判断这条内容在讲什么、面向谁，以及表达怎样展开。</p><Button variant="secondary" disabled>完成{contentLabel}后可用</Button></div> : null}
    {hasTranscript && !configured && !currentResult ? <div className="material-feature-state">暂时没有可用的内容理解结果。</div> : null}
    {processing ? <div className="material-feature-state is-processing"><p className="font-medium">正在整理内容理解</p><p>可以继续阅读{contentLabel}，完成后结果会显示在这里。已有历史结果仍然保留。</p><div className="material-state-skeleton"><i /><i /><i /></div></div> : null}
    {failed ? <div className="material-feature-state is-failed"><p className="font-medium">这次没有处理成功，可以重新尝试。</p><p>已有的历史结果不会受到影响。</p></div> : null}
    {currentResult?.stale ? <div className="mt-4 rounded-xl border border-[var(--warning)] p-4 text-sm"><p className="font-medium text-[var(--warning)]">{contentLabel}已更新，当前内容理解基于旧版本。</p><p className="mt-1 text-[var(--text-secondary)]">旧结果仍可查看，重新理解后才会采用最新内容。</p></div> : null}
    {currentResult?.status === "COMPLETED" && currentResult.understanding ? compact ? <><CompactUnderstandingView value={currentResult.understanding} />{isCurrent(currentResult.understanding) && currentResult.understanding.methods.items.length ? <MethodRecoveryView analysisId={currentResult.id} value={currentResult.understanding} canSave={canEdit} /> : null}</> : <UnderstandingView value={currentResult.understanding} analysisId={currentResult.id} canSave={canEdit} /> : null}
    {history.filter((item) => item.status === "COMPLETED" && item.id !== currentResult?.id).length ? <details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">历史内容理解</summary><div className="mt-3 grid gap-3">{history.filter((item) => item.status === "COMPLETED" && item.id !== currentResult?.id).map((item) => <details key={item.id} className="rounded-lg bg-[var(--surface-elevated)] p-3 text-sm"><summary className="cursor-pointer font-medium">第 {item.version} 版 · {item.summary || "暂无摘要"}</summary>{item.understanding ? <div className="mt-3"><UnderstandingView value={item.understanding} /></div> : <p className="mt-2 text-[var(--text-secondary)]">暂无可展开的完整结果。</p>}</details>)}</div></details> : null}
    {confirming ? <div className="mt-4 rounded-xl border border-[var(--warning)] p-4 text-sm"><p>会生成一份新的内容理解结果，旧版本仍会保留。</p><div className="mt-3 flex gap-2"><Button disabled={busy} onClick={analyze}>确认重新理解</Button><Button variant="secondary" onClick={() => setConfirming(false)}>取消</Button></div></div> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}{notice ? <p role="status" className="mt-4 text-sm text-[var(--success)]">{notice}</p> : null}
    {canEdit ? <div className="mt-5 flex flex-wrap gap-2">{hasTranscript && configured && !processing ? <Button data-testid="material-analysis-action" variant="secondary" disabled={busy || confirming} onClick={analyze}>{busy ? "提交中…" : actionLabel}</Button> : null}{showCreateAction && currentResult?.status === "COMPLETED" ? <Button disabled={busy} onClick={createContent}>基于这条资料创作</Button> : null}</div> : null}
  </Container>;
}

function isCurrent(value: MaterialAnalysisOutput): value is CurrentMaterialAnalysisOutput {
  return "expression" in value && "methods" in value;
}

function MethodRecoveryView({ analysisId, value, canSave }: { analysisId: string; value: CurrentMaterialAnalysisOutput; canSave: boolean }) {
  return <details id="material-methods" className="material-methods-recovery"><summary>可复用的Skill <small>{value.methods.items.length} 条</small></summary><div>{value.methods.items.map((item, index) => <MethodCard key={`${item.title}-${index}`} value={item} analysisId={analysisId} methodIndex={index} canSave={canSave} />)}</div></details>;
}

type Evidence = { quote: string; startMs?: number; endMs?: number };
type MaterialAnalysisRequestDTO = Omit<MaterialAnalysisDTO, "status"> & { jobId: string; status: "QUEUED" };

function CompactUnderstandingView({ value }: { value: MaterialAnalysisOutput }) {
  if (!isCurrent(value)) return <div className="material-compact-understanding" data-testid="material-analysis-compact"><section className="material-summary-result"><h3>全文摘要</h3><p>{value.whatItSays.summary}</p></section><section className="material-key-points"><h3>关键观点</h3><ul>{value.whatItSays.keyPoints.slice(0, 6).map((point, index) => <li key={point}><span className="material-key-point-index">{index + 1}</span>{point}</li>)}</ul></section>{value.reusable.length ? <section className="material-reusable-preview"><h3>值得参考的表达</h3>{value.reusable.slice(0, 3).map((item) => <article key={item.content}><strong>{item.content}</strong><p>{item.whyUseful}</p></article>)}</section> : null}</div>;
  const expressionSections = [
    { title: "主要说给谁听", value: value.expression.audience.summary, evidence: value.expression.audience.evidence },
    { title: "开头怎么抓住人", value: value.expression.opening.summary, evidence: value.expression.opening.evidence },
    { title: "内容怎么往下推进", value: value.expression.progression.summary, evidence: value.expression.progression.evidence, steps: value.expression.progression.steps },
    { title: "用什么方式让人相信", value: value.expression.support.summary, evidence: value.expression.support.evidence },
    { title: "情绪和表达节奏", value: value.expression.emotionalOrRhetoricalShift.summary, evidence: value.expression.emotionalOrRhetoricalShift.evidence },
    { title: "怎么收尾", value: value.expression.ending.summary, evidence: value.expression.ending.evidence },
  ];
  return <div className="material-compact-understanding" data-testid="material-analysis-compact"><section className="material-summary-result"><h3>全文摘要</h3><p>{value.whatItSays.summary}</p><EvidenceDetails items={value.whatItSays.evidence} /></section><section className="material-key-points"><h3>关键观点</h3><ul>{value.whatItSays.keyPoints.slice(0, 6).map((point, index) => <li key={point}><span className="material-key-point-index">{index + 1}</span>{point}</li>)}</ul></section>{value.reusable.length ? <section className="material-reusable-preview"><h3>值得参考的表达</h3>{value.reusable.slice(0, 3).map((item) => <article key={item.content}><strong>{item.content}</strong><p>{item.whyUseful}</p></article>)}</section> : null}<section className="material-expression-preview"><header><h3>表达与结构拆解 <small>6 项</small></h3></header><div>{expressionSections.slice(0, 2).map((item) => <AnalysisSection key={item.title} {...item} />)}</div>{expressionSections.length > 2 ? <details><summary>展开全部</summary><div>{expressionSections.slice(2).map((item) => <AnalysisSection key={item.title} {...item} />)}</div></details> : null}</section>{(value.doNotCopy.length || value.uncertain.length) ? <details className="material-cautions-preview"><summary>需要留意的地方</summary><div><CautionList title="不建议照搬" items={value.doNotCopy} /><CautionList title="还需要确认" items={value.uncertain} /></div></details> : null}</div>;
}

function UnderstandingView({ value, analysisId, canSave = false }: { value: MaterialAnalysisOutput; analysisId?: string; canSave?: boolean }) {
  if (!isCurrent(value)) return <LegacyUnderstandingView value={value} />;
  return <div className="mt-5 grid gap-5" data-testid="material-analysis-result">
    <section aria-labelledby="expression-result-title"><h3 id="expression-result-title" className="text-base font-semibold">这条内容是怎么讲的</h3><p className="mt-2 text-sm leading-6">{value.whatItSays.summary}</p>{value.whatItSays.keyPoints.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">{value.whatItSays.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul> : null}<EvidenceDetails items={value.whatItSays.evidence} /></section>
    <section className="rounded-xl border bg-[var(--surface-elevated)] p-4"><h4 className="font-medium">表达拆解</h4><div className="mt-3 grid gap-4"><AnalysisSection title="主要说给谁听" value={value.expression.audience.summary} evidence={value.expression.audience.evidence} /><AnalysisSection title="开头怎么抓住人" value={value.expression.opening.summary} evidence={value.expression.opening.evidence} /><AnalysisSection title="内容怎么往下推进" value={value.expression.progression.summary} evidence={value.expression.progression.evidence} steps={value.expression.progression.steps} /><AnalysisSection title="用什么方式让人相信" value={value.expression.support.summary} evidence={value.expression.support.evidence} /><AnalysisSection title="情绪和表达节奏" value={value.expression.emotionalOrRhetoricalShift.summary} evidence={value.expression.emotionalOrRhetoricalShift.evidence} /><AnalysisSection title="怎么收尾" value={value.expression.ending.summary} evidence={value.expression.ending.evidence} /></div></section>
    <section aria-labelledby="method-result-title"><h3 id="method-result-title" className="text-base font-semibold">可以借鉴的Skill</h3>{value.methods.evidenceStatus === "INSUFFICIENT" || !value.methods.items.length ? <div className="mt-3 rounded-xl border border-dashed p-4 text-sm"><p className="font-medium">这部分暂时不总结成Skill</p><p className="mt-1 leading-6 text-[var(--text-secondary)]">目前相关内容太少，还不足以形成一个可靠的Skill。你可以先参考上面的表达拆解。</p></div> : <><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{value.methods.reason}</p><div className="mt-3 grid gap-3">{value.methods.items.map((item, index) => <MethodCard key={`${item.title}-${index}`} value={item} analysisId={analysisId} methodIndex={index} canSave={canSave} />)}</div></>}</section>
    {(value.doNotCopy.length || value.uncertain.length) ? <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">需要留意的地方</summary><div className="mt-3 grid gap-3"><CautionList title="不建议照搬" items={value.doNotCopy} /><CautionList title="还需要确认" items={value.uncertain} /></div></details> : null}
  </div>;
}

function AnalysisSection({ title, value, evidence, steps }: { title: string; value: string; evidence: Evidence[]; steps?: string[] }) {
  return <article><h5 className="text-sm font-medium">{title}</h5><p className="mt-1 text-sm leading-6">{value}</p>{steps?.length ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6">{steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}<EvidenceDetails items={evidence} /></article>;
}

function MethodCard({ value, analysisId, methodIndex, canSave = false }: { value: CurrentMaterialAnalysisOutput["methods"]["items"][number]; analysisId?: string; methodIndex?: number; canSave?: boolean }) {
  return <article className="mt-3 rounded-xl border p-4"><h4 className="font-medium">{value.title || "可尝试的Skill"}</h4><MethodList title="怎么用" items={value.howTo} /><MethodList title="适合什么时候用" items={value.applicable} /><MethodList title="什么时候不太适合" items={value.boundaries} /><p className="mt-4 rounded-lg bg-[var(--surface-elevated)] p-3 text-xs leading-5 text-[var(--text-secondary)]">仅根据这一条内容总结，建议先试用。</p><EvidenceDetails items={value.evidence} />{canSave && analysisId && methodIndex !== undefined && value.evidence.length ? <MethodSaveEditor analysisId={analysisId} methodIndex={methodIndex} value={value} /> : null}</article>;
}

function MethodSaveEditor({ analysisId, methodIndex, value }: { analysisId: string; methodIndex: number; value: CurrentMaterialAnalysisOutput["methods"]["items"][number] }) {
  const saving = useRef(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(value.title);
  const [steps, setSteps] = useState(value.howTo.join("\n"));
  const [applicable, setApplicable] = useState(value.applicable.join("\n"));
  const [boundaries, setBoundaries] = useState(value.boundaries.join("\n"));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError("");
    try {
      const response = await request("/api/methods", "POST", { materialAnalysisId: analysisId, methodIndex, title, steps: lines(steps), applicableScenarios: lines(applicable), boundaries: lines(boundaries) });
      if (!response?.id) throw new Error("无法保存Skill。");
      setSaved(true); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存Skill。"); }
    finally { saving.current = false; setBusy(false); }
  }

  if (saved) return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><p role="status" className="text-[var(--success)]">已保存为Skill</p><Link href="/library/methods" className="font-medium text-[var(--accent)]">查看Skill</Link></div>;
  if (!editing) return <Button className="mt-4" variant="secondary" disabled={!value.evidence.length} onClick={() => setEditing(true)}>保存为Skill</Button>;
  return <div className="mt-4 rounded-xl bg-[var(--surface-elevated)] p-4"><p className="text-sm font-medium">确认和修改Skill</p><div className="mt-3 grid gap-3"><label className="grid gap-1 text-sm">Skill名称<input aria-label="Skill名称" value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 rounded-[var(--radius)] border bg-[var(--surface)] px-3" /></label><label className="grid gap-1 text-sm">怎么用<textarea aria-label="怎么用" value={steps} onChange={(event) => setSteps(event.target.value)} className="min-h-20 rounded-[var(--radius)] border bg-[var(--surface)] p-2" /></label><label className="grid gap-1 text-sm">适合什么时候用<textarea aria-label="适合什么时候用" value={applicable} onChange={(event) => setApplicable(event.target.value)} className="min-h-20 rounded-[var(--radius)] border bg-[var(--surface)] p-2" /></label><label className="grid gap-1 text-sm">什么时候不太适合<textarea aria-label="什么时候不太适合" value={boundaries} onChange={(event) => setBoundaries(event.target.value)} className="min-h-20 rounded-[var(--radius)] border bg-[var(--surface)] p-2" /></label></div><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={save}>保存Skill</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>取消</Button></div>{error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}</div>;
}

function lines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }

function MethodList({ title, items }: { title: string; items: string[] }) { return items.length ? <div className="mt-4"><h5 className="text-xs font-medium text-[var(--text-secondary)]">{title}</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null; }

function EvidenceDetails({ items }: { items: Evidence[] }) {
  if (!items.length) return null;
  return <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium text-[var(--accent)]">查看原文依据（{items.length} 处）</summary><div className="mt-2 grid gap-2">{items.map((item, index) => <blockquote key={`${item.quote}-${index}`} className="rounded-lg bg-[var(--surface-elevated)] p-3 leading-5"><p>{item.quote}</p>{item.startMs !== undefined && item.endMs !== undefined ? <cite className="mt-1 block not-italic text-[var(--text-secondary)]">{formatTime(item.startMs)}–{formatTime(item.endMs)}</cite> : <cite className="mt-1 block not-italic text-[var(--text-secondary)]">对应文字</cite>}</blockquote>)}</div></details>;
}

function formatTime(milliseconds: number) { const seconds = Math.floor(milliseconds / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

function CautionList({ title, items }: { title: string; items: Array<{ content: string; reason: string }> }) { return items.length ? <section><h5 className="text-xs font-medium text-[var(--text-secondary)]">{title}</h5><div className="mt-2 grid gap-2">{items.map((item) => <article key={item.content} className="rounded-lg bg-[var(--surface-elevated)] p-3 text-sm"><p>{item.content}</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.reason}</p></article>)}</div></section> : null; }

function LegacyUnderstandingView({ value }: { value: Exclude<MaterialAnalysisOutput, CurrentMaterialAnalysisOutput> }) {
  return <div className="mt-5 grid gap-5" data-testid="compact-material-analysis"><section><h3 className="text-base font-semibold">这条内容是怎么讲的</h3><p className="mt-2 text-sm leading-6">{value.whatItSays.summary}</p>{value.whatItSays.keyPoints.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">{value.whatItSays.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul> : null}</section><section><h3 className="text-base font-semibold">可以借鉴的Skill</h3><div className="mt-3 grid gap-3">{value.reusable.length ? value.reusable.map((item) => <article key={item.content} className="rounded-xl border p-4"><p className="text-sm leading-6">{item.content}</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.whyUseful}</p></article>) : <p className="text-sm text-[var(--text-secondary)]">这部分暂时不总结成Skill。</p>}</div></section>{(value.doNotCopy.length || value.uncertain.length) ? <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">需要留意的地方</summary><div className="mt-3 grid gap-3"><CautionList title="不建议照搬" items={value.doNotCopy} /><CautionList title="还需要确认" items={value.uncertain} /></div></details> : null}</div>;
}
