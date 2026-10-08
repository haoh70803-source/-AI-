"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResearchShare({ kind, resultId, projects, preview, canWrite }: { kind: "run" | "study"; resultId: string; projects: Array<{ id: string; title: string }>; preview: { body: string; sourceCount: number; blockCount: number; omitted: number }; canWrite: boolean }) {
  const router = useRouter(); const [projectId, setProjectId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [artifactId, setArtifactId] = useState(""); const [reviewed, setReviewed] = useState(false); const [previewOpened, setPreviewOpened] = useState(false);
  async function share(open: boolean) {
    if (!projectId || !preview.body || busy || !reviewed) return;
    setBusy(true); setError("");
    try {
      const url = kind === "run" ? `/api/research/results/${resultId}/share` : `/api/research/results/study/${resultId}/share`;
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "未能加入项目。");
      setArtifactId(body.artifactId);
      if (open) router.push(`/dashboard?project=${encodeURIComponent(projectId)}&node=artifact:${encodeURIComponent(body.artifactId)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "未能加入项目。"); }
    finally { setBusy(false); }
  }
  return <section className="research-section" id="share-result"><header><h2>把这份结论带到项目</h2><span>由你决定是否分享</span></header><p className="research-caption">项目成员会看到下方预览的内容。先检查结论和依据，再选择项目；整段会话和其他追问不会一起带过去。标明私人背景的段落已排除。</p>
    <details className="research-share-preview" onToggle={event => { if (event.currentTarget.open) setPreviewOpened(true); }}><summary>审阅将加入项目的完整内容 · {preview.blockCount} 个结论、{preview.sourceCount} 个来源</summary>{preview.body ? <pre>{preview.body}</pre> : <p>当前成果没有可共享的外部来源结论。</p>}</details>
    {preview.omitted ? <p className="research-caption">已排除 {preview.omitted} 个不适合共享的区块，包括私人背景来源和原始来源目录。</p> : null}
    {projects.length ? <div className="research-share-actions"><label>目标项目<select value={projectId} onChange={event => { setProjectId(event.target.value); setArtifactId(""); }}><option value="">选择项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label className="research-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} disabled={!previewOpened} />我已检查将共享的完整预览</label><button type="button" disabled={!canWrite || busy || !projectId || !preview.body || !reviewed} onClick={() => void share(false)}>{busy ? "正在加入…" : "加入项目"}</button><button type="button" className="research-primary" disabled={!canWrite || busy || !projectId || !preview.body || !reviewed} onClick={() => void share(true)}>加入项目并开始创作 →</button></div> : <p className="research-center-empty-inline">还没有可用项目。请先创建项目，再选择要分享的成果。</p>}
    {artifactId && projectId ? <p role="status">已加入项目。<Link href={`/dashboard?project=${encodeURIComponent(projectId)}&node=artifact:${encodeURIComponent(artifactId)}`}>打开项目产出 →</Link></p> : null}
    {error ? <p className="research-error" role="alert">{error}</p> : null}
  </section>;
}
