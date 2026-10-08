"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { methodStatusLabels } from "@/lib/content-labels";
import type { ProjectMethodAvailableDTO, ProjectMethodSelectedDTO, ProjectMethodStateDTO } from "@/server/project-methods/service";
import { StudioDrawer } from "./studio-drawer";

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请重试。");
  return result;
}

export function StudioMethodSelector({ projectId, initial, editable, compact = false, openRequest = 0, onOpenRequestHandled, onChange }: { projectId: string; initial: ProjectMethodStateDTO; editable: boolean; compact?: boolean; openRequest?: number; onOpenRequestHandled?: () => void; onChange: (state: ProjectMethodStateDTO) => void }) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState(initial.selected.map(({ methodVersionId }) => methodVersionId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setState(initial);
    setDraftIds(initial.selected.map(({ methodVersionId }) => methodVersionId));
  }, [initial]);
  useEffect(() => { if (openRequest && editable) { setError(""); setOpen(true); onOpenRequestHandled?.(); } }, [editable, onOpenRequestHandled, openRequest]);

  const visibleAvailable = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("zh-CN");
    return state.available.filter((method) => !needle || [method.title, method.summary, ...method.applicableScenarios].join(" ").toLocaleLowerCase("zh-CN").includes(needle));
  }, [search, state.available]);

  async function save(ids = draftIds) {
    if (!editable) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await request(`/api/projects/${projectId}/methods`, "PUT", { methodVersionIds: ids }) as ProjectMethodStateDTO;
      setState(next); setDraftIds(next.selected.map(({ methodVersionId }) => methodVersionId)); onChange(next); setNotice("本次使用的方法已保存。"); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存本次使用的方法。"); }
    finally { setBusy(false); }
  }

  function toggle(method: ProjectMethodAvailableDTO) {
    setError("");
    if (draftIds.includes(method.methodVersionId)) { setDraftIds((ids) => ids.filter((id) => id !== method.methodVersionId)); return; }
    if (draftIds.length >= 3) { setError("当前版本最多加载 3 个 Skill（兼容限制），后续将由 Resolver 判断适用性。"); return; }
    setDraftIds((ids) => [...ids, method.methodVersionId]);
  }

  function remove(methodVersionId: string) { void save(state.selected.map(({ methodVersionId: id }) => id).filter((id) => id !== methodVersionId)); }

  function replaceLatest(method: ProjectMethodSelectedDTO) {
    const ids = state.selected.map(({ methodVersionId: id }) => id === method.methodVersionId ? method.latestVersionId : id);
    void save([...new Set(ids)]);
  }

  const picker = <StudioDrawer title="选择创作方法" open={open} onClose={() => setOpen(false)}><p className="text-sm text-[var(--text-secondary)]">当前项目已加载 {draftIds.length} 个 Skill。当前版本最多 3 个是兼容限制；新项目不会自动继承这组 Skill。</p><label className="studio-skill-picker-search"><Search size={14} aria-hidden="true" /><span className="sr-only">搜索 Skill</span><input aria-label="搜索 Skill" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、说明或适用场景" /></label><div className="mt-4 grid gap-3">{visibleAvailable.map((method) => { const selected = draftIds.includes(method.methodVersionId); const outdatedSelected = state.selected.some((item) => item.methodAssetId === method.methodAssetId && item.methodVersionId !== method.methodVersionId && draftIds.includes(item.methodVersionId)); return <AvailableMethod key={method.methodVersionId} method={method} selected={selected} disabled={outdatedSelected || (!selected && draftIds.length >= 3)} onToggle={() => toggle(method)} onView={() => setOpen(false)} />; })}{!visibleAvailable.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">没有找到匹配的 Skill。</p> : null}</div>{error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}<div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存选择"}</Button><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>取消</Button></div></StudioDrawer>;

  if (compact) return <section className="studio-skill-pool" data-testid="studio-skill-pool" aria-label="已加载 Skill"><header><div><p>当前项目能力</p><strong>已加载 Skill</strong></div>{editable ? <Button variant="secondary" disabled={busy} onClick={() => { setDraftIds(state.selected.map(({ methodVersionId }) => methodVersionId)); setSearch(""); setError(""); setOpen(true); }}><Plus size={14} aria-hidden="true" />添加 Skill</Button> : null}</header>{state.selected.length ? <div className="studio-skill-chips">{state.selected.map((method) => <span className="studio-skill-chip" key={method.selectionId}><span>{method.title}</span>{editable ? <button type="button" aria-label={`移除 Skill ${method.title}`} disabled={busy} onClick={() => remove(method.methodVersionId)}>×</button> : null}</span>)}</div> : <p className="studio-skill-empty">当前项目还没有加载 Skill，Agent 会根据你的任务直接处理。</p>}{notice ? <p role="status" className="studio-skill-notice">{notice}</p> : null}{error && !open ? <p role="alert" className="studio-skill-error">{error}</p> : null}{picker}</section>;

  return <Card className="p-5" data-testid="studio-method-selector"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-[var(--text-secondary)]">我的创作方法</p><h2 className="mt-1 font-semibold">本次补充使用的创作方法</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">可选。当前项目可以加载多个 Skill；当前版本最多 3 个是兼容限制。</p></div>{editable ? <Button variant="secondary" disabled={busy} onClick={() => { setDraftIds(state.selected.map(({ methodVersionId }) => methodVersionId)); setSearch(""); setError(""); setOpen(true); }}>选择创作方法</Button> : null}</div>{state.selected.length ? <div className="mt-4 grid gap-3">{state.selected.map((method) => <SelectedMethod key={method.selectionId} method={method} editable={editable} busy={busy} onRemove={() => remove(method.methodVersionId)} onReplace={() => replaceLatest(method)} />)}</div> : <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">当前项目没有额外加载 Skill；特定口播任务仍可能使用公司默认方法。</p>}{notice ? <p role="status" className="mt-3 text-sm text-[var(--success)]">{notice}</p> : null}{error && !open ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}{picker}</Card>;
}

function SelectedMethod({ method, editable, busy, onRemove, onReplace }: { method: ProjectMethodSelectedDTO; editable: boolean; busy: boolean; onRemove: () => void; onReplace: () => void }) {
  return <article className="rounded-xl border bg-[var(--surface-elevated)] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{method.title}</p><Badge>{method.isDisabled ? "已停用" : methodStatusLabels[method.status]}</Badge></div><p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{method.summary}</p>{method.isDisabled ? <p className="mt-2 text-sm text-[var(--warning)]">这个创作方法已经停用，下一次生成会忽略它。</p> : method.isOutdated ? <p className="mt-2 text-sm text-[var(--warning)]">这个创作方法后来修改过，当前创作仍使用你之前选择的版本。</p> : null}{editable && method.isDisabled ? <div className="mt-2 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={onRemove}>移除</Button><Link href={`/library/methods/${method.methodAssetId}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--accent)]">去我的创作方法调整</Link></div> : editable && method.isOutdated ? <div className="mt-2 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={onReplace}>换用最新版</Button><Button variant="ghost" disabled={busy} onClick={onRemove}>移除</Button></div> : editable ? <Button variant="ghost" className="mt-2" disabled={busy} onClick={onRemove}>移除</Button> : null}</article>;
}

function AvailableMethod({ method, selected, disabled, onToggle, onView }: { method: ProjectMethodAvailableDTO; selected: boolean; disabled: boolean; onToggle: () => void; onView: () => void }) {
  return <article className={`rounded-xl border p-4 ${disabled ? "opacity-50" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{method.title}</p><p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{method.summary}</p>{method.applicableScenarios.length ? <p className="mt-2 text-xs text-[var(--text-tertiary)]">适合：{method.applicableScenarios.slice(0, 2).join("、")}</p> : null}</div><Badge>{methodStatusLabels[method.status]}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button variant={selected ? "secondary" : "primary"} disabled={disabled} onClick={onToggle}>{selected ? "已选择" : "选择"}</Button><Link href={`/library/methods/${method.methodAssetId}`} onClick={onView} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--accent)]">查看详情</Link></div></article>;
}
