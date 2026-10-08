"use client";

import { Button } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BenchmarkTopicGenerator } from "@/components/discovery/benchmark-topic-generator";

type NamedResource = { id: string; name: string };
type AvailableProject = { id: string; title: string };
type RelatedIdea = { id: string; title: string };
type SourceReference = { externalId: string; platform: "DOUYIN" | "XIAOHONGSHU"; contentType: "VIDEO" | "IMAGE" | "ARTICLE" | "UNKNOWN"; title: string | null; description: string | null; authorId: string | null; authorName: string | null; authorAvatarUrl: string | null; coverUrl: string | null; originalUrl: string; publishedAt: string | null; metrics: { views: number | null; likes: number | null; comments: number | null; shares: number | null; favorites: number | null }; durationMs: number | null; sourceProvider: "REDFOX" };

export function SourceActions({
  sourceId,
  status,
  failedJobId,
  tags,
  availableTags,
  collections,
  availableCollections,
  availableProjects,
  canManageProjects,
  mode = "ALL",
  relatedProjects = [],
  relatedIdeas = [],
  sourceTitle = "未命名资料",
  sourceReference,
  topicInspiration,
}: {
  sourceId: string;
  status: string;
  failedJobId?: string;
  tags: NamedResource[];
  availableTags: NamedResource[];
  collections: NamedResource[];
  availableCollections: NamedResource[];
  availableProjects: AvailableProject[];
  canManageProjects: boolean;
  mode?: "ALL" | "CLASSIFICATION" | "CREATION" | "DANGER";
  relatedProjects?: AvailableProject[];
  relatedIdeas?: RelatedIdea[];
  sourceTitle?: string;
  sourceReference?: SourceReference | null;
  topicInspiration?: { available: boolean; unavailableMessage: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || "操作失败");
    return data;
  }

  async function action(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-5">
      {mode === "ALL" || mode === "CLASSIFICATION" ? <>
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">归类</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">人工标签</p>
        <div className="mt-3 flex flex-wrap gap-2">{tags.length ? tags.map((tag) => <span key={tag.id} className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-sm">#{tag.name}<button disabled={busy} aria-label={`移除标签 ${tag.name}`} onClick={() => action(async () => { await call(`/api/source-items/${sourceId}/tags`, "DELETE", { tagId: tag.id }); })}>×</button></span>) : <span className="text-sm text-[var(--text-secondary)]">暂无标签</span>}</div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" action={(formData) => action(async () => {
          const name = String(formData.get("tagName") || "");
          const tag = await call("/api/tags", "POST", { name });
          await call(`/api/source-items/${sourceId}/tags`, "POST", { tagId: tag.id });
        })}>
          <input name="tagName" aria-label="新标签" required list="existing-tags" className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent px-3" placeholder="输入人工标签" />
          <datalist id="existing-tags">{availableTags.map((tag) => <option key={tag.id} value={tag.name} />)}</datalist>
          <Button disabled={busy}>添加标签</Button>
        </form>
      </section>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium">资料集</summary>
        <div className="mt-3 flex flex-wrap gap-2">{collections.length ? collections.map((collection) => <span key={collection.id} className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-sm">{collection.name}<button disabled={busy} aria-label={`移出资料集 ${collection.name}`} onClick={() => action(async () => { await call(`/api/source-items/${sourceId}/collections`, "DELETE", { collectionId: collection.id }); })}>×</button></span>) : <span className="text-sm text-[var(--text-secondary)]">尚未加入资料集</span>}</div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" action={(formData) => action(async () => {
          const collectionId = String(formData.get("collectionId") || "");
          await call(`/api/source-items/${sourceId}/collections`, "POST", { collectionId });
        })}>
          <select name="collectionId" aria-label="选择资料集" required defaultValue="" className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent px-3"><option value="" disabled>选择已有资料集</option>{availableCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>
          <Button variant="secondary" disabled={busy || availableCollections.length === 0}>加入资料集</Button>
        </form>
        <form className="mt-2 flex flex-col gap-2 sm:flex-row" action={(formData) => action(async () => {
          const name = String(formData.get("collectionName") || "");
          const collection = await call("/api/collections", "POST", { name });
          await call(`/api/source-items/${sourceId}/collections`, "POST", { collectionId: collection.id });
        })}>
          <input name="collectionName" aria-label="新资料集" required className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent px-3" placeholder="新建一级资料集" />
          <Button disabled={busy}>新建并加入</Button>
        </form>
      </details>
      </> : null}

      {(mode === "ALL" || mode === "CREATION") && canManageProjects ? (
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">进入创作</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">资料只建立引用关系，不会复制原始内容。</p>
          {topicInspiration ? <div className="mt-4"><BenchmarkTopicGenerator sourceType="VIDEO" sourceId={sourceId} available={topicInspiration.available} buttonLabel="用这条找选题" unavailableMessage={topicInspiration.unavailableMessage} /></div> : null}
          {relatedIdeas.length ? <div className="mt-4 grid gap-2 text-sm"><p className="font-medium">已生成 {relatedIdeas.length} 个选题方向</p>{relatedIdeas.map((idea) => <LinkButton key={idea.id} href={`/discovery/ideas/${idea.id}`}>查看选题：《{idea.title}》</LinkButton>)}</div> : sourceReference ? <Button className="mt-4 w-full" variant="secondary" disabled={busy} onClick={() => action(async () => { await call("/api/discovery/ideas", "POST", { title: sourceTitle, description: sourceReference.description || undefined, reference: sourceReference, sourceItemId: sourceId }); })}>加入选题</Button> : null}
          {relatedProjects.length ? <div className="mt-4 grid gap-2">{relatedProjects.map((project) => <LinkButton key={project.id} href={`/dashboard?project=${project.id}`}>加入当前创作 · {project.title}</LinkButton>)}</div> : <Button className="mt-4 w-full" disabled={busy} onClick={() => action(async () => { const result = await call(`/api/source-items/${sourceId}/material-analysis/project`, "POST"); router.push(`/dashboard?project=${result.projectId}`); })}>加入当前创作</Button>}
          <details className="mt-4"><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">加入其他已有创作</summary>
          <form className="mt-3 grid gap-2" action={(formData) => action(async () => {
            const projectId = String(formData.get("projectId") || "");
            await call(`/api/projects/${projectId}/sources`, "POST", { sourceItemId: sourceId, role: "REFERENCE" });
            router.push(`/dashboard?project=${projectId}`);
          })}>
            <select name="projectId" aria-label="选择创作" required defaultValue="" className="h-10 min-w-0 rounded-[var(--radius)] border bg-transparent px-3"><option value="" disabled>选择未关联的创作</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
            <Button variant="secondary" disabled={busy || availableProjects.length === 0}>加入已有创作</Button>
          </form>
          </details>
        </section>
      ) : null}

      {mode === "ALL" || mode === "DANGER" ? <section className="flex flex-wrap gap-2">
        {status === "FAILED" && failedJobId ? <Button disabled={busy} onClick={() => action(async () => { await call(`/api/ingest-jobs/${failedJobId}/retry`, "POST"); })}>重试采集</Button> : null}
        {status !== "ARCHIVED" ? <Button variant="secondary" disabled={busy} onClick={() => action(async () => { await call(`/api/source-items/${sourceId}`, "PATCH"); })}>归档</Button> : null}
        <Button variant="secondary" disabled={busy} className="text-[var(--danger)]" onClick={() => { if (window.confirm("确定永久删除这条资料、媒体文件、处理记录、标签和资料集关系吗？")) action(async () => { await call(`/api/source-items/${sourceId}`, "DELETE"); router.push("/library"); }); }}>删除</Button>
      </section> : null}
      {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) { return <a href={href} className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-[var(--surface-elevated)]">{children}</a>; }
