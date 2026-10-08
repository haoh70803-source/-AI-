"use client";

import { Badge, Button, Card } from "@content-center/ui";
import type { MaterialDistillationDTO, MaterialDistillationJobDTO } from "@/server/material-distillation/service";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Mode = "COMPREHENSIVE" | "COPYWRITING";
type Output = NonNullable<MaterialDistillationDTO["output"]>;
type Highlight = Output["highlights"][number];

const modeLabels: Record<Mode, string> = { COMPREHENSIVE: "综合看看有什么值得学", COPYWRITING: "重点看看这条文案怎么写" };
const qualityLabels: Record<Highlight["quality"], string> = { WORTH_KEEPING: "值得留下", OBSERVE: "可以先观察", CASE_ONLY: "只是一个不错的案例", DO_NOT_KEEP: "暂时不用沉淀" };
const typeLabels: Record<Highlight["type"], string> = { method: "方法", principle: "原则", process: "流程", framework: "框架", checklist: "清单", decision_rule: "判断规则", hypothesis: "待验证假设", case_reference: "案例参考", copy_structure: "文案结构", other: "其他" };
const keepTypes = new Set(["method", "process", "framework", "checklist", "decision_rule", "copy_structure"]);

async function request(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请重试。");
  return result;
}

function list(value: string[]) { return value.join("\n"); }
function lines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }

export function MaterialDistillationCard({ sourceId, current: initial, latestAttempt: latestInitial, job: jobInitial, history, canEdit, llmStatus, hasTranscript, contentLabel = "文字稿" }: { sourceId: string; current: MaterialDistillationDTO | null; latestAttempt: MaterialDistillationDTO | null; job: MaterialDistillationJobDTO | null; history: MaterialDistillationDTO[]; canEdit: boolean; llmStatus: string; hasTranscript: boolean; contentLabel?: string }) {
  const router = useRouter();
  const starting = useRef(false);
  const [current, setCurrent] = useState(initial);
  const [latestAttempt, setLatestAttempt] = useState(latestInitial);
  const [job, setJob] = useState(jobInitial);
  const [mode, setMode] = useState<Mode | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { setCurrent(initial); setLatestAttempt(latestInitial); setJob(jobInitial); }, [initial, latestInitial, jobInitial]);

  const processing = latestAttempt?.status === "PROCESSING" || job?.status === "QUEUED" || job?.status === "RUNNING";
  const failed = !processing && latestAttempt?.status === "FAILED";
  const configured = llmStatus === "CONFIGURED";
  const unavailable = canEdit && hasTranscript && !configured && !processing;

  async function start() {
    if (starting.current || !mode || !canEdit) return;
    starting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("/api/source-items/" + sourceId + "/distillation", { mode }) as Omit<MaterialDistillationDTO, "status"> & { jobId: string; status: "QUEUED" };
      const { jobId, ...distillation } = result;
      setLatestAttempt({ ...distillation, status: "PROCESSING" }); setJob({ id: jobId, status: "QUEUED", progress: 0, attempt: 0, maxAttempts: 3, errorCode: null, errorMessage: null, updatedAt: new Date().toISOString() }); setChoosing(false); setNotice("已开始提炼，你可以先离开页面，回来后继续查看。"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "精华提炼失败，请重试。"); }
    finally { starting.current = false; setBusy(false); }
  }

  const statusLabel = processing ? (job?.status === "QUEUED" ? "等待中" : "正在提炼") : failed ? "需要重试" : current ? "已完成" : "尚未提炼";
  const actionLabel = current || failed ? "重新提炼" : "开始提炼";
  return <Card className="material-distillation-panel p-5" data-testid="material-distillation-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">提炼值得学的东西</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">从观点、结构、表达、Skill、经验和边界中，判断哪些值得拿走。</p></div><Badge>{statusLabel}</Badge></div>{!hasTranscript && !current ? <div className="material-feature-state"><p>完成{contentLabel}后，可以从观点、结构、表达、Skill、经验和边界中继续判断。</p><Button variant="secondary" disabled>完成{contentLabel}后可用</Button></div> : null}{unavailable ? <div className="material-feature-state"><p>内容提炼暂不可用，请联系管理员检查 AI 服务。</p><Button variant="secondary" disabled>暂时无法提炼</Button></div> : null}{processing ? <div className="material-feature-state is-processing"><p className="font-medium">正在提炼值得学的东西</p><p>可以先查看{contentLabel}或已有内容理解，完成后结果会显示在这里。</p><div className="material-state-skeleton"><i /><i /><i /></div></div> : null}{failed ? <div className="material-feature-state is-failed"><p className="font-medium">这次没有处理成功，可以重新尝试。</p><p>之前完成的结果不会受到影响。</p></div> : null}{current?.stale ? <div className="mt-4 rounded-xl border border-[var(--warning)] p-4 text-sm"><p className="font-medium text-[var(--warning)]">{contentLabel}已更新，之前的提炼仍然保留。</p><p className="mt-1 text-[var(--text-secondary)]">重新提炼后才会采用最新内容。</p></div> : null}{current?.status === "COMPLETED" && current.output ? <DistillationOutput current={current} canEdit={canEdit} /> : null}{history.filter((item) => item.status === "COMPLETED" && item.id !== current?.id).length ? <details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">历史提炼</summary><div className="mt-3 grid gap-3">{history.filter((item) => item.status === "COMPLETED" && item.id !== current?.id).map((item) => <details key={item.id} className="rounded-lg bg-[var(--surface-elevated)] p-3 text-sm"><summary className="cursor-pointer font-medium">第 {item.version} 版 · {modeLabels[item.mode]}</summary>{item.output ? <DistillationOutput current={item} canEdit={false} /> : null}</details>)}</div></details> : null}{choosing ? <div className="mt-4 rounded-xl border border-[var(--warning)] p-4 text-sm"><p className="font-medium">你想从哪个角度看看这条资料？</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{(Object.keys(modeLabels) as Mode[]).map((value) => <button type="button" key={value} onClick={() => setMode(value)} className={mode === value ? "min-h-11 rounded-xl border border-[var(--accent)] bg-[var(--surface-elevated)] p-3 text-left" : "min-h-11 rounded-xl border p-3 text-left hover:border-[var(--accent)]"}>{modeLabels[value]}</button>)}</div><div className="mt-3 flex gap-2"><Button disabled={!mode || busy} onClick={() => void start()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}确认并开始</Button><Button variant="secondary" onClick={() => setChoosing(false)}>取消</Button></div></div> : null}{error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}{notice ? <p role="status" className="mt-4 text-sm text-[var(--success)]">{notice}</p> : null}{canEdit && hasTranscript && configured && !processing ? <Button className="mt-5" variant="secondary" disabled={busy || choosing} onClick={() => setChoosing(true)}><RefreshCw size={14} />{actionLabel}</Button> : null}</Card>;
}

function DistillationOutput({ current, canEdit }: { current: MaterialDistillationDTO; canEdit: boolean }) {
  const output = current.output!;
  if (current.mode === "COPYWRITING") return <div className="mt-5 grid gap-4"><p className="text-sm leading-6">{output.message || "暂无补充说明。"}</p>{output.copywriting ? <CopywritingView value={output.copywriting} /> : <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">这条内容暂时没有发现特别值得学习的文案结构。</p>}</div>;
  return <div className="mt-5 grid gap-5"><section><h3 className="text-base font-semibold">这条资料最值得学什么</h3><p className="mt-2 text-sm leading-6">{output.message || "暂无补充说明。"}</p>{!output.hasLongTermValue ? <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">这条内容有参考价值，但暂时没有发现特别值得长期留下的Skill或框架。</p> : null}{output.highlights.length ? <div className="mt-4 grid gap-3">{output.highlights.map((item, index) => <HighlightCard key={item.title + "-" + index} item={item} index={index} distillationId={current.id} canEdit={canEdit} />)}</div> : null}</section></div>;
}

function HighlightCard({ item, index, distillationId, canEdit }: { item: Highlight; index: number; distillationId: string; canEdit: boolean }) {
  const saving = useRef(false);
  const [editing, setEditing] = useState(false); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [title, setTitle] = useState(item.title); const [steps, setSteps] = useState(list(item.howTo)); const [applicable, setApplicable] = useState(list(item.applicable)); const [boundaries, setBoundaries] = useState(list(item.boundaries));
  const keep = item.quality === "WORTH_KEEPING" && keepTypes.has(item.type);
  async function save() { if (saving.current) return; saving.current = true; setBusy(true); setError(""); try { await request("/api/methods", { materialDistillationId: distillationId, methodIndex: index, title, steps: lines(steps), applicableScenarios: lines(applicable), boundaries: lines(boundaries) }); setSaved(true); setEditing(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Skill保存失败，请重试。"); } finally { saving.current = false; setBusy(false); } }
  return <article className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap gap-2"><Badge>{typeLabels[item.type]}</Badge><Badge>{qualityLabels[item.quality]}</Badge></div><h4 className="mt-2 font-medium">{item.title}</h4></div>{keep && canEdit && !saved ? <Button variant="secondary" disabled={busy} onClick={() => setEditing((value) => !value)}>留下这个</Button> : saved ? <span className="text-sm text-[var(--success)]">已保存为Skill</span> : null}</div><p className="mt-3 text-sm leading-6">{item.essence}</p>{item.whyWorthAttention ? <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{item.whyWorthAttention}</p> : null}<MethodList title="怎么用" items={item.howTo} /><MethodList title="适合什么时候用" items={item.applicable} /><MethodList title="什么时候不太适合" items={item.boundaries} /><EvidenceDetails items={item.evidence} />{editing ? <div className="mt-4 rounded-xl bg-[var(--surface-elevated)] p-4"><p className="mb-3 text-sm text-[var(--text-secondary)]">保存前，请把这条发现补充成你真正会使用的Skill。</p><div className="grid gap-3"><label className="grid gap-1 text-sm">Skill名称<input aria-label="Skill名称" value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 rounded-lg border bg-[var(--surface)] px-3" /></label><Field label="怎么用" value={steps} onChange={setSteps} /><Field label="适合什么时候用" value={applicable} onChange={setApplicable} /><Field label="什么时候不太适合" value={boundaries} onChange={setBoundaries} /></div><div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存Skill"}</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>取消</Button></div>{error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}</div> : null}</article>;
}

function CopywritingView({ value }: { value: NonNullable<Output["copywriting"]> }) { return <section className="rounded-xl border bg-[var(--surface-elevated)] p-4"><h3 className="text-base font-semibold">这条文案怎么组织</h3><FieldView label="核心命题" value={value.coreProposition} /><FieldView label="切口" value={value.angle} /><FieldView label="开头逻辑" value={value.openingLogic} /><MethodList title="推进顺序" items={value.progression} /><MethodList title="文案骨架" items={value.skeleton} /><FieldView label="论据作用" value={value.evidenceFunction} /><MethodList title="可复用策略" items={value.reusableStrategies} /><MethodList title="不照搬的内容" items={value.doNotCopy} /><MethodList title="二改方向" items={value.secondEditDirections} /><MethodList title="可重写骨架" items={value.rewriteSkeleton} /><EvidenceDetails items={value.evidence} /></section>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-sm">{label}<textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-20 rounded-lg border bg-[var(--surface)] p-2" /></label>; }
function FieldView({ label, value }: { label: string; value: string }) { return <div className="mt-3"><h4 className="text-xs font-medium text-[var(--text-secondary)]">{label}</h4><p className="mt-1 text-sm leading-6">{value}</p></div>; }
function MethodList({ title, items }: { title: string; items: string[] }) { return items.length ? <div className="mt-4"><h4 className="text-xs font-medium text-[var(--text-secondary)]">{title}</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">{items.map((item, index) => <li key={item + "-" + index}>{item}</li>)}</ul></div> : null; }
function EvidenceDetails({ items }: { items: Array<{ quote?: string; segmentIndex?: number }> }) { return items.length ? <details className="mt-4 text-xs"><summary className="cursor-pointer font-medium text-[var(--accent)]">为什么这么总结 · 查看 {items.length} 处原文依据</summary><div className="mt-2 grid gap-2">{items.map((item, index) => <blockquote key={(item.quote || "依据") + "-" + index} className="rounded-lg bg-[var(--surface-elevated)] p-3 leading-5"><p>{item.quote || "对应文字片段"}</p>{item.segmentIndex !== undefined ? <cite className="mt-1 block not-italic text-[var(--text-secondary)]">对应第 {item.segmentIndex + 1} 段</cite> : null}</blockquote>)}</div></details> : null; }
