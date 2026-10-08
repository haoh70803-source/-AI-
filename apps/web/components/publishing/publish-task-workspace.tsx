"use client";

import { Badge, Button, Card, Input } from "@content-center/ui";
import { AlertTriangle, Check, Clipboard, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLATFORM_LABELS, type SupportedPlatform } from "@/lib/platforms";
import { publishStatusLabels } from "@/lib/content-labels";

type Status = "DRAFT" | "SCHEDULED" | "READY_TO_PUBLISH" | "PUBLISHED" | "FAILED" | "CANCELLED";
type Section = { key: string; label: string; content: string };
export type PublishTaskView = {
  id: string; projectId: string; platform: SupportedPlatform; status: Status; scheduledAt: string | null; publishedAt: string | null; externalUrl: string | null; externalPostId: string | null; note: string | null;
  project: { title: string; creatorName: string; motherVersion: number | null };
  publisher: { name: string } | null;
  snapshot: { variantVersion: number; motherVersion: number; createdAt: string };
  package: { sections: Section[]; fullText: string };
  contentChanged: boolean;
  canEdit: boolean;
};

function localInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso); const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
export function PublishTaskWorkspace({ initial }: { initial: PublishTaskView }) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState(localInput(initial.scheduledAt));
  const [publishedAt, setPublishedAt] = useState("");
  const [externalUrl, setExternalUrl] = useState(initial.externalUrl ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(path: string, body: unknown) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/publish-tasks/${initial.id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "操作失败");
      router.refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); return false; }
    finally { setBusy(false); }
  }

  async function copy(content: string, label: string) {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(content);
      const audit = await fetch(`/api/publish-tasks/${initial.id}/package/copied`, { method: "POST" });
      if (!audit.ok) throw new Error("内容已复制，但复制审计记录失败。");
      setMessage(`${label}已复制。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "浏览器未允许复制，请手动选择文本。"); }
  }

  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
    <div className="grid gap-5">
      {initial.contentChanged ? <Card className="border-[var(--warning)] p-5"><div className="flex gap-3"><AlertTriangle className="shrink-0 text-[var(--warning)]" size={20} /><div><h2 className="font-semibold">当前内容已经发生变化</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">该任务仍使用创建时固定的已审核内容快照，不会随最新平台草稿自动更新。</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => copy(initial.package.fullText, "当前发布包")}>继续使用当前发布包</Button><Button asChild><Link href={`/dashboard?project=${initial.projectId}`}>回到工作台重新审核</Link></Button></div></div></div></Card> : null}
      <Card className="p-5">
        <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge>{PLATFORM_LABELS[initial.platform]}</Badge><Badge>{publishStatusLabels[initial.status] || initial.status}</Badge></div><h2 className="mt-3 text-xl font-semibold">{initial.project.title}</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">发布包固定于平台版本 v{initial.snapshot.variantVersion} / 口播稿 v{initial.snapshot.motherVersion}</p></div><Button variant="secondary" onClick={() => copy(initial.package.fullText, "完整发布包")}><Clipboard size={16} />复制完整发布包</Button></header>
        <div className="mt-5 grid gap-4">{initial.package.sections.map((section) => <section key={section.key} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-medium">{section.label}</h3><Button aria-label={`复制${section.label}`} variant="ghost" onClick={() => copy(section.content, section.label)}><Clipboard size={15} />复制</Button></div><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7">{section.content}</pre></section>)}</div>
      </Card>
    </div>
    <div className="grid gap-5">
      <Card className="p-5"><h2 className="font-semibold">任务信息</h2><dl className="mt-4 grid gap-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-[var(--text-secondary)]">创作者</dt><dd>{initial.project.creatorName}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--text-secondary)]">计划时间</dt><dd>{initial.scheduledAt ? new Date(initial.scheduledAt).toLocaleString("zh-CN") : "未排期"}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--text-secondary)]">实际发布</dt><dd>{initial.publishedAt ? new Date(initial.publishedAt).toLocaleString("zh-CN") : "未发布"}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--text-secondary)]">发布人</dt><dd>{initial.publisher?.name ?? "—"}</dd></div></dl>{initial.externalUrl ? <a href={initial.externalUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--accent)]">查看外部内容<ExternalLink size={14} /></a> : null}</Card>
      {initial.canEdit && initial.status !== "PUBLISHED" ? <Card className="p-5"><h2 className="font-semibold">人工发布操作</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">系统只准备发布包；请在真实平台完成发布后再记录结果。</p><div className="mt-4 grid gap-4"><label className="text-sm">计划发布时间<Input aria-label="改期时间" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-2" /></label><Button variant="secondary" disabled={busy || !scheduledAt} onClick={async () => { if (await request("schedule", { scheduledAt: new Date(scheduledAt).toISOString() })) setMessage("排期已更新。"); }}>保存排期</Button><div className="border-t" /><label className="text-sm">实际发布时间（不填则使用当前时间）<Input aria-label="实际发布时间" type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="mt-2" /></label><label className="text-sm">外部发布链接<Input aria-label="外部发布链接" type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..." className="mt-2" /></label><label className="text-sm">备注<textarea aria-label="发布备注" value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border bg-transparent p-3" /></label><Button disabled={busy} onClick={async () => { if (await request("published", { publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined, externalUrl: externalUrl || null, note: note || null })) setMessage("已人工标记为发布。"); }}><Check size={16} />标记已发布</Button><div className="grid grid-cols-2 gap-2"><Button variant="secondary" disabled={busy || note.trim().length < 2} onClick={async () => { if (await request("failed", { note })) setMessage("已标记失败。"); }}>标记失败</Button><Button variant="ghost" disabled={busy} onClick={async () => { if (await request("cancel", { note: note || null })) setMessage("任务已取消。"); }}>取消任务</Button></div></div></Card> : initial.canEdit ? null : <Card className="p-5 text-sm text-[var(--text-secondary)]">当前账号只有查看权限，不能排期、取消或标记发布。</Card>}
      {error ? <p role="alert" className="rounded-xl border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}{message ? <p role="status" className="rounded-xl border border-[var(--success)] p-3 text-sm text-[var(--success)]">{message}</p> : null}
    </div>
  </div>;
}
