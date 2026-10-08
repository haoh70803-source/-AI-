"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button } from "@content-center/ui";
import { BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { methodStatusLabels, sourcePlatformLabels } from "@/lib/content-labels";
import type { MethodDTO, MethodVersionDTO } from "@/server/methods/service";

const statuses = ["SAVED", "TRIAL", "CORE", "DISABLED"] as const;

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请重试。");
  return result;
}

export function MethodDetail({ initial, editable }: { initial: MethodDTO; editable: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initial.current.title);
  const [steps, setSteps] = useState(initial.current.steps.join("\n"));
  const [applicable, setApplicable] = useState(initial.current.applicableScenarios.join("\n"));
  const [boundaries, setBoundaries] = useState(initial.current.boundaries.join("\n"));
  const [markdown, setMarkdown] = useState(initial.current.workflowContract?.rawMarkdown || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function startEditing() {
    setTitle(method.current.title);
    setMarkdown(method.current.workflowContract?.rawMarkdown || "");
    setSteps(method.current.steps.join("\n"));
    setApplicable(method.current.applicableScenarios.join("\n"));
    setBoundaries(method.current.boundaries.join("\n"));
    setError("");
    setNotice("");
    setEditing(true);
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await request(`/api/methods/${method.id}`, "PUT", { title, steps: lines(steps), applicableScenarios: lines(applicable), boundaries: lines(boundaries), expectedVersion: method.current.version, ...(method.current.workflowContract?.rawMarkdown !== undefined ? { markdown } : {}) }) as MethodDTO;
      setMethod(updated); setEditing(false); setNotice("Skill 已保存，新版本已经保留。"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存 Skill。"); }
    finally { setBusy(false); }
  }

  async function changeStatus(status: typeof statuses[number]) {
    if (status === method.status) return;
    setBusy(true); setError(""); setNotice("");
    try { setMethod(await request(`/api/methods/${method.id}`, "PATCH", { status }) as MethodDTO); setNotice("Skill 状态已更新。"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法更新 Skill 状态。"); }
    finally { setBusy(false); }
  }

  return <div className="v3-method-detail" data-testid="method-detail">
    <header className="v3-method-detail-header">
      <div className="v3-method-detail-icon"><BookOpenCheck size={25} /></div>
      <div className="v3-method-detail-title"><div><Badge>{methodStatusLabels[method.status]}</Badge><span>仅自己可见</span></div><h1>{method.current.title}</h1><p>这个 Skill 会在你主动选择时加入工作区，帮助 AI 按稳定规则完成任务。</p></div>
      <div className="v3-method-detail-actions"><Link href={`/dashboard?skill=${encodeURIComponent(method.current.id)}`}>去创作</Link>{editable ? <Button variant="secondary" disabled={busy || editing} onClick={startEditing}>编辑 Skill</Button> : null}</div>
    </header>

    {method.current.source.stale && method.current.source.sourceItemId ? <div className="v3-method-stale"><p>来源内容后来更新过，建议重新核对当前原文。</p><Link href={`/library/${method.current.source.sourceItemId}`}>查看当前来源</Link></div> : null}

    <div className="v3-method-detail-layout">
      <main>
        {editing ? <section className="v3-method-editor"><h2>确认和修改 Skill</h2><p>修改会保存为新版本，不覆盖历史记录。</p><div><label>Skill 名称<input aria-label="Skill 名称" value={title} onChange={(event) => setTitle(event.target.value)} /></label>{method.current.workflowContract?.rawMarkdown !== undefined ? <Field label="Markdown 正文" value={markdown} onChange={setMarkdown}/> : <><Field label="怎么用" value={steps} onChange={setSteps} /><Field label="适合什么时候用" value={applicable} onChange={setApplicable} /><Field label="什么时候不太适合" value={boundaries} onChange={setBoundaries} /></>}</div><footer><Button disabled={busy} onClick={save}>保存 Skill</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>取消</Button></footer></section>
          : <section className="v3-method-current"><header><div><span>当前版本</span><h2>Skill 文件内容</h2></div><strong>V{method.current.version}</strong></header><VersionContent version={method.current} showSource={false} /></section>}
      </main>

      <aside className="v3-method-detail-aside">
        <section className="v3-method-status"><h2>Skill 状态</h2><p>状态只会在你主动选择后改变。</p>{editable ? <div>{statuses.map((status) => <button type="button" key={status} disabled={busy} onClick={() => void changeStatus(status)} aria-pressed={method.status === status}>{methodStatusLabels[status]}</button>)}</div> : <Badge>{methodStatusLabels[method.status]}</Badge>}</section>
        <section className="v3-method-source"><h2>依据内容</h2><SourceReference source={method.current.source} /><EvidenceDetails items={method.current.evidence} /></section>
        <section className="v3-method-history"><h2>历史版本</h2><div>{method.history.map((version) => <details key={version.id}><summary>{version.version === 1 ? "首次保存" : `第 ${version.version} 次修改`}<span>{new Date(version.createdAt).toLocaleDateString("zh-CN")}</span></summary><VersionContent version={version} /></details>)}</div></section>
      </aside>
    </div>

    {error ? <p role="alert" className="v3-method-message is-error">{error}</p> : null}{notice ? <p role="status" className="v3-method-message is-success">{notice}</p> : null}
  </div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1.5 text-sm">{label}<textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 resize-y rounded-[var(--radius)] border bg-transparent p-3 leading-6" /></label>; }
function lines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
function VersionContent({ version, showSource = true }: { version: MethodVersionDTO; showSource?: boolean }) {
  const raw = version.workflowContract?.rawMarkdown;
  if (raw !== undefined) return <div className="v3-method-version"><article className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({alt}) => <span>{alt || "图片引用"}</span> }}>{raw}</ReactMarkdown></article><details><summary>查看 Markdown 源码</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{raw}</pre></details></div>;
  return <div className="v3-method-version"><p>此历史 Skill 未保存 Markdown 原文件，以下为已保存的内容。</p><section><h3>怎么用</h3><List items={version.steps} /></section><section><h3>适合什么时候用</h3><List items={version.applicableScenarios} /></section><section><h3>什么时候不太适合</h3><List items={version.boundaries} /></section>{showSource ? <section><h3>依据内容</h3><SourceReference source={version.source} /></section> : null}<EvidenceDetails items={version.evidence} /><p className="v3-method-editor-note">修改人：{version.editedBy}</p></div>; }
function SourceReference({ source }: { source: MethodVersionDTO["source"] }) { return <div className="mt-2"><p className="font-medium">{source.title}</p>{source.platform ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{sourcePlatformLabels[source.platform] || source.platform}</p> : null}{source.sourceItemId ? <Link href={`/library/${source.sourceItemId}`} className="mt-2 inline-flex text-sm font-medium text-[var(--accent)]">查看当前来源</Link> : null}{source.benchmarkStudyId && source.samples.length ? <div className="mt-3 grid gap-2"><p className="text-xs text-[var(--text-secondary)]">涉及的代表内容（{source.sampleCount} 条）</p>{source.samples.map((sample) => <Link key={sample.sourceItemId} href={`/library/${sample.sourceItemId}`} className="text-sm text-[var(--accent)]">{sample.title}</Link>)}</div> : null}</div>; }
function List({ items }: { items: string[] }) { return items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-[var(--text-secondary)]">暂无内容</p>; }
function EvidenceDetails({ items }: { items: MethodVersionDTO["evidence"] }) { return items.length ? <details className="text-xs"><summary className="cursor-pointer font-medium text-[var(--accent)]">为什么这么总结 · 查看 {items.length} 处原文依据</summary><div className="mt-2 grid gap-2">{items.map((item, index) => <blockquote key={`${item.quote}-${index}`} className="rounded-lg bg-[var(--surface-elevated)] p-3 leading-5"><p>{item.quote}</p>{item.startMs !== undefined && item.endMs !== undefined ? <cite className="mt-1 block not-italic text-[var(--text-secondary)]">{formatTime(item.startMs)}–{formatTime(item.endMs)}</cite> : <cite className="mt-1 block not-italic text-[var(--text-secondary)]">对应文字</cite>}</blockquote>)}</div></details> : null; }
function formatTime(milliseconds: number) { const seconds = Math.floor(milliseconds / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
