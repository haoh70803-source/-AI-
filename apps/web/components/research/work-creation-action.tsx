"use client";

import Link from "next/link";
import { ResearchUseFindings } from "./research-use-findings";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactSummaryView } from "@/lib/contracts/artifacts";
import { ArtifactEditor, ArtifactUnsavedDialog } from "../projects/artifact-editor";
import { useArtifactEditor } from "../projects/use-artifact-editor";
import { BORROW_PARTS, researchCreationPrompt } from "./creation-prompt";

export type WorkCreationChoices = {
  projects: Array<{ id: string; title: string; audience: string | null; sourceItemIds: string[] }>;
  materials: Array<{ id: string; title: string; sourceType: string }>;
};
type AgentEvent = { type: "status"; status: { message: string } } | { type: "delta"; delta: string } |
  { type: "done"; message: { id: string; content: string } } | { type: "stopped" } | { type: "error"; message: string };

async function jsonRequest(url: string, body?: unknown, method = "POST", signal?: AbortSignal) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "暂时无法完成，请稍后重试。");
  return data;
}

export function WorkCreationAction({ choices, accountId, workId, runId, sessionId, saved, canWrite, showHandoff = true }: {
  choices: WorkCreationChoices; accountId?: string; workId?: string; runId: string; sessionId: string; saved: boolean; canWrite: boolean; showHandoff?: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [projects, setProjects] = useState(choices.projects);
  const [projectId, setProjectId] = useState(choices.projects[0]?.id ?? "");
  const [materialIds, setMaterialIds] = useState<string[]>(choices.projects[0]?.sourceItemIds.filter(id => choices.materials.some(item => item.id === id)).slice(0, 8) ?? []);
  const [audience, setAudience] = useState(choices.projects[0]?.audience ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [format, setFormat] = useState("短视频");
  const [borrow, setBorrow] = useState<string[]>(["选题角度", "内容结构"]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [existing, setExisting] = useState<ArtifactSummaryView[]>([]);
  const lock = useRef(false), controller = useRef<AbortController | null>(null);
  const projectRequest = useRef<{ signature: string; key: string } | null>(null);
  const editor = useArtifactEditor({ projectId, canWrite, externalBusy: busy, onSaved: () => { setStatus("成果已保存，旧版本保留。可以继续编辑或稍后重新打开。"); router.refresh(); } });
  const { artifact, messageId } = editor;
  const protect = editor.protect;
  const visibleMaterials = useMemo(() => choices.materials.filter(item => !search.trim() || item.title.toLocaleLowerCase("zh-CN").includes(search.trim().toLocaleLowerCase("zh-CN"))).slice(0, 30), [choices.materials, search]);
  useEffect(() => {
    setExisting([]); if (!projectId) return;
    const aborter = new AbortController();
    void jsonRequest(`/api/projects/${projectId}/artifacts`, undefined, "GET", aborter.signal).then(data => { if (!aborter.signal.aborted) setExisting(data.items ?? []); }).catch(() => undefined);
    return () => aborter.abort();
  }, [projectId, artifact?.artifactId, artifact?.version]);
  useEffect(() => () => controller.current?.abort(), []);
  function begin(message: string, readOnly = false) {
    if (lock.current || editor.busy || !canWrite && !readOnly) return false;
    lock.current = true; setBusy(true); setError(""); setStatus(message); return true;
  }
  function finish() { lock.current = false; setBusy(false); controller.current = null; }
  function failure(cause: unknown) { setError(cause instanceof Error ? cause.message : "操作未完成，请重试。"); }
  function chooseProject(id: string) {
    setProjectId(id); const project = projects.find(item => item.id === id);
    setAudience(project?.audience ?? ""); setMaterialIds(project?.sourceItemIds.filter(sourceId => choices.materials.some(item => item.id === sourceId)).slice(0, 8) ?? []);
    editor.clear(); setResult(""); setStatus("");
  }
  async function newProject() {
    if (!newTitle.trim() || !begin("正在创建项目…")) return;
    const input = { title: newTitle.trim(), audience: audience.trim(), sourceItemIds: materialIds };
    const signature = JSON.stringify(input);
    if (projectRequest.current?.signature !== signature) projectRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const project = await jsonRequest("/api/projects", { ...input, clientRequestId: projectRequest.current.key });
      if (typeof project.id !== "string") throw new Error("项目返回不完整，请重新打开项目列表。");
      setProjects(current => [...current.filter(item => item.id !== project.id), { id: project.id, title: project.title, audience: audience.trim(), sourceItemIds: materialIds }]);
      setProjectId(project.id); editor.clear(); setResult(""); setStatus("项目已创建，可以继续创作。"); router.refresh();
    } catch (cause) { failure(cause); } finally { finish(); }
  }
  async function create() {
    if (!projectId || !begin("正在准备研究与资料…")) return;
    const aborter = new AbortController(); controller.current = aborter;
    try {
      if (accountId && workId) await jsonRequest(`/api/research/benchmarks/${accountId}/works/${workId}/analysis/${runId}/prepare-creation`, { projectId, materialIds }, "POST", aborter.signal);
      if (!saved) await jsonRequest(`/api/research/sessions/${sessionId}/runs/${runId}`, undefined, "POST", aborter.signal);
      const content = researchCreationPrompt({ audience, goal, format, borrow, hasOwnMaterial: materialIds.length > 0 });
      const response = await fetch(`/api/projects/${projectId}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, references: [{ sourceType: "RESEARCH", sourceId: runId }], sourceItemIds: materialIds }), signal: aborter.signal });
      if (!response.ok || !response.body) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "生成暂时不可用，请稍后重试。"); }
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "", terminal = false;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.split("\n").find(part => part.startsWith("data: ")); if (!line) continue;
          const event = JSON.parse(line.slice(6)) as AgentEvent;
          if (event.type === "status") setStatus(event.status.message);
          else if (event.type === "delta") setStatus("正在生成…");
          else if (event.type === "done") {
            if (!event.message.id) throw new Error("回复已生成，请到项目中查看并保存。");
            terminal = true; editor.setGenerated(event.message.id, event.message.content); setResult(event.message.content); setStatus("已生成。保存为成果后，可以编辑、导出和再次打开。");
          } else if (event.type === "stopped") { terminal = true; throw new Error("生成已停止，可到项目中查看已保存的对话。"); }
          else if (event.type === "error") { terminal = true; throw new Error(event.message); }
        }
      }
      if (!terminal) throw new Error("连接中断，请先到项目中查看已有对话，再决定是否重试。");
    } catch (cause) { failure(cause); } finally { finish(); }
  }
  async function reopen(id: string) {
    if (!begin("正在打开成果…", true)) return;
    try { editor.showArtifact(await jsonRequest(`/api/projects/${projectId}/artifacts/${id}`, undefined, "GET")); setStatus("已打开保存的成果。"); }
    catch (cause) { failure(cause); } finally { finish(); }
  }
  return <section className="work-creation-action" aria-label="用研究创作" data-ready={ready} inert={!ready}>
    {showHandoff ? <ResearchUseFindings key={runId} resultId={runId} canWrite={canWrite} /> : null}
    <ArtifactUnsavedDialog editor={editor} canWrite={canWrite} />
    <details className="research-legacy-creation"><summary>原有创作与已保存成果</summary>
    <h3>把研究变成我的内容</h3>

    <div className="work-creation-form"><label>我的项目<select aria-label="我的项目" value={projectId} onChange={event => { const id = event.target.value; protect(() => chooseProject(id)); }} disabled={busy}>{!projects.length ? <option value="">先创建一个项目</option> : null}{projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>给谁看<input value={audience} onChange={event => setAudience(event.target.value)} maxLength={160} placeholder="选填，例如：正在带新老师的校长" disabled={busy} /></label></div>
    <details open={!projects.length}><summary>创建新项目</summary><label>项目名称<input aria-label="项目名称" value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={200} disabled={busy} /></label><button className="research-button" type="button" onClick={() => protect(() => void newProject())} disabled={!canWrite || busy || !newTitle.trim()}>创建并使用</button></details>
    <div className="work-creation-form"><label>内容形式<select aria-label="内容形式" value={format} onChange={event => setFormat(event.target.value)} disabled={busy}><option>短视频</option><option>图文</option><option>文章</option></select></label><label>我想达到什么目标<input value={goal} onChange={event => setGoal(event.target.value)} placeholder="选填，例如：解释一个问题，让读者愿意进一步了解" maxLength={500} disabled={busy} /></label></div>
    <div className="research-creation-parts" aria-label="我想借鉴的部分">{BORROW_PARTS.map(part => <label key={part}><input type="checkbox" checked={borrow.includes(part)} disabled={busy} onChange={() => setBorrow(current => current.includes(part) ? current.filter(item => item !== part) : [...current, part])} />{part}</label>)}</div>
    <details><summary>加入我的资料（选填，已选 {materialIds.length} 份）</summary><input aria-label="搜索我的资料" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索项目或业务资料" disabled={busy} /><div className="work-creation-materials">{visibleMaterials.map(item => <label key={item.id}><input type="checkbox" checked={materialIds.includes(item.id)} disabled={busy || !materialIds.includes(item.id) && materialIds.length >= 8} onChange={() => setMaterialIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />{item.title}</label>)}</div><p>不添加也可以开始。缺少业务事实时会留下问题，不编造你的经历和效果。</p></details>
    <div className="work-creation-submit"><button type="button" className="research-button research-primary" onClick={() => protect(() => void create())} disabled={!canWrite || busy || !projectId}>生成我的版本</button>{busy && controller.current ? <button className="research-button" type="button" onClick={() => controller.current?.abort()}>停止生成</button> : null}<Link href={`/dashboard?project=${projectId}`}>到项目继续</Link></div>
    {existing.length ? <details className="research-existing-artifacts"><summary>重新打开项目成果</summary>{existing.map(item => <button className="research-button" key={item.artifactId} type="button" disabled={busy} onClick={() => protect(() => void reopen(item.artifactId))}>{item.title}</button>)}</details> : null}
    {status ? <p role="status">{status}</p> : null}{error ? <p className="research-error" role="alert">{error}</p> : null}
    <p className="research-caption">这里是原有创作方式，点击生成会调用 AI；保存为项目成果后，工作空间有读取权限的有效成员（含只读成员）可见。</p>
    {result && !artifact ? <div className="work-creation-result"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>{messageId ? <ArtifactEditor editor={editor} canWrite={canWrite} /> : null}</div> : null}
    {artifact ? <><ArtifactEditor editor={editor} canWrite={canWrite} /><Link href={"/dashboard?project=" + projectId + "&node=artifact:" + artifact.artifactId}>在项目中打开</Link></> : null}
    </details>
  </section>;
}
