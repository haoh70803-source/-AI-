"use client";

import { ArrowUp, Box, Check, ChevronDown, FileText, Folder, Loader2, Plus, X, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { CreationModel } from "@/server/creation/models";
import "./home-composer.css";

type Attachment = { key: string; id?: string; title: string; state: "UPLOADING" | "READING" | "READY" | "FAILED"; message: string; requiresImage?: boolean; jobId?: string | null };
type Skill = { id: string; status: string; current: { id: string; title: string; steps: string[]; applicableScenarios: string[] } };
type FolderOption = { folderId: string; label: string };
type Models = { configured: boolean; provider: string | null; defaultModelId: string | null; defaultLabel: string; defaultImage: boolean; models: Array<CreationModel & { label: string; description: string; image: boolean }> };
type Panel = "models" | "skills" | "folders" | "library";
export type ComposerSelection = { sourceItemIds: string[]; methodVersionIds: string[]; folderId?: string; modelSelection: CreationModel | null };
const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.txt,.md,.markdown,.mp4,.mov,.mp3,.wav,.m4a";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "读取失败，请重试。");
  return body as T;
}

export function HomeComposer({ idea, onIdeaChange, inputRef, canCreate, busy, draftKey, error, onSubmit, initialSkillId }: {
  initialSkillId?: string; idea: string; onIdeaChange: (value: string) => void; inputRef: RefObject<HTMLTextAreaElement | null>; canCreate: boolean; busy: boolean; draftKey: string; error: string; onSubmit: (selection: ComposerSelection) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const files = useRef(new Map<string, File>());
  const attachmentsRef = useRef<Attachment[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchors = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 340, maxHeight: 360 });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [models, setModels] = useState<Models | null>(null);
  const [model, setModel] = useState<CreationModel | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  useEffect(() => { if (initialSkillId && skills.some(skill => skill.current.id === initialSkillId && skill.status !== "DISABLED")) setSkillIds([initialSkillId]); }, [initialSkillId, skills]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [library, setLibrary] = useState<Array<{ id: string; title: string | null }>>([]);
  const [notice, setNotice] = useState("");
  const [panelError, setPanelError] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const storageKey = `${draftKey}:composer-v2`;
  useLayoutEffect(() => {
    const form = formRef.current; const home = form?.closest<HTMLElement>(".xsj-home");
    if (!form || !home) return;
    const observer = new ResizeObserver(() => home.style.setProperty("--composer-extra", `${Math.max(0, form.offsetHeight - 146)}px`));
    observer.observe(form); return () => { observer.disconnect(); home.style.removeProperty("--composer-extra"); };
  }, []);
  const replaceAttachments = useCallback((update: (items: Attachment[]) => Attachment[]) => {
    const next = update(attachmentsRef.current); attachmentsRef.current = next; setAttachments(next);
  }, []);
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (stored) {
        replaceAttachments(() => Array.isArray(stored.attachments) ? stored.attachments.filter((item: Attachment) => item.id).slice(0, 8).map((item: Attachment) => ({ ...item, state: "READING", message: "正在检查资料…" })) : []);
        setModel(stored.model ?? null); setSkillIds(Array.isArray(stored.skillIds) ? stored.skillIds.slice(0, 1) : []); setFolderId(stored.folderId ?? null);
      }
    } catch { /* The current draft still works without browser storage. */ }
    setRestored(true);
    void request<Models>("/api/creation/models").then(setModels).catch(() => setNotice("模型配置暂时无法读取，请点击模型重试。"));
    void request<Skill[]>("/api/methods").then(setSkills).catch(() => undefined);
    void request<{ folders: FolderOption[] }>("/api/sidebar").then((data) => setFolders(data.folders)).catch(() => undefined);
  }, [replaceAttachments, storageKey]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ attachments, model, skillIds, folderId })); } catch { /* Selection remains usable in memory. */ }
  }, [attachments, model, skillIds, folderId, restored, storageKey]);
  const attachmentIds = attachments.map((item) => item.id).filter(Boolean).join(",");
  useEffect(() => {
    if (!attachmentIds) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await request<{ items: Array<{ id: string; title: string; state: "READING" | "READY" | "FAILED"; message: string; requiresImage: boolean; jobId: string | null }> }>("/api/creation/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceItemIds: attachmentIds.split(",") }) });
        if (!active) return;
        replaceAttachments((current) => current.map((item) => { const status = data.items.find((source) => source.id === item.id); return status ? { ...item, ...status, title: item.title } : item; }));
        if (data.items.some((item) => item.state === "READING")) timer = setTimeout(() => void poll(), 1800);
      } catch {
        if (active) { setNotice("资料状态暂时无法读取，正在重试。"); timer = setTimeout(() => void poll(), 4000); }
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [attachmentIds, replaceAttachments, sourceRefresh]);
  const close = useCallback(() => { if (panel) anchors.current[panel]?.focus({ preventScroll: true }); setPanel(null); }, [panel]);
  useEffect(() => {
    if (!panel) return;
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("input:not([type=checkbox]), .home-picker-row")?.focus({ preventScroll: true }), 100);
    const outside = (event: PointerEvent) => { if (!panelRef.current?.contains(event.target as Node) && !Object.values(anchors.current).some((anchor) => anchor?.contains(event.target as Node))) setPanel(null); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", keyboard);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keyboard); };
  }, [panel, close]);
  useLayoutEffect(() => {
    if (!panel) return;
    const positionPanel = () => {
      const anchor = anchors.current[panel]?.getBoundingClientRect(); if (!anchor) return;
      const width = Math.min(360, window.innerWidth - 24);
      const below = window.innerHeight - anchor.bottom - 20;
      const upward = below < 280 && anchor.top > below;
      const maxHeight = Math.min(400, upward ? anchor.top - 20 : below);
      const height = Math.min(panelRef.current?.scrollHeight || 360, maxHeight);
      setPosition({ left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)), top: upward ? anchor.top - height - 8 : anchor.bottom + 8, width, maxHeight });
    };
    positionPanel(); const observer = new ResizeObserver(positionPanel); if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", positionPanel); window.addEventListener("scroll", positionPanel, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", positionPanel); window.removeEventListener("scroll", positionPanel, true); };
  }, [panel]);
  useEffect(() => {
    if (!panel) return;
    let active = true; setPanelLoading(true); setPanelError("");
    const timer = setTimeout(() => {
      const load = panel === "models" ? request<Models>("/api/creation/models").then((data) => { if (active) setModels(data); })
        : panel === "skills" ? request<Skill[]>("/api/methods").then((data) => { if (active) setSkills(data); })
        : panel === "folders" ? request<{ folders: FolderOption[] }>("/api/sidebar").then((data) => { if (active) setFolders(data.folders); })
        : request<{ items: Array<{ id: string; title: string | null }> }>(`/api/source-items?pageSize=50&search=${encodeURIComponent(search)}`).then((data) => { if (active) setLibrary(data.items); });
      void load.catch((cause) => { if (active) setPanelError(cause.message); }).finally(() => { if (active) setPanelLoading(false); });
    }, panel === "library" ? 180 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [panel, search]);
  function open(next: Panel) { setSearch(""); setPanelError(""); setPanel(panel === next ? null : next); }
  async function upload(key: string, file: File) {
    replaceAttachments((current) => current.map((item) => item.key === key ? { ...item, state: "UPLOADING", message: "正在上传…" } : item));
    try {
      const form = new FormData(); form.append("files", file);
      const response = await fetch("/api/source-items/upload", { method: "POST", body: form });
      const data = await response.json(); const result = data.results?.[0];
      if (!result?.sourceItemId) throw new Error(result?.message || data.message || "上传失败，请重试。");
      replaceAttachments((current) => current.some((item) => item.key !== key && item.id === result.sourceItemId) ? current.filter((item) => item.key !== key) : current.map((item) => item.key === key ? { ...item, id: result.sourceItemId, state: "READING", message: "正在读取资料…" } : item));
    } catch (cause) { replaceAttachments((current) => current.map((item) => item.key === key ? { ...item, state: "FAILED", message: cause instanceof Error ? cause.message : "上传失败" } : item)); }
  }
  function addFiles(incoming: File[]) {
    if (!canCreate || busy) return;
    setNotice(""); const room = 8 - attachmentsRef.current.length;
    if (incoming.length > room) { setNotice("本地文件与资料库引用合计最多 8 条，请减少文件后重试。"); return; }
    const additions = incoming.map((file) => ({ key: crypto.randomUUID(), file }));
    additions.forEach(({ key, file }) => files.current.set(key, file));
    replaceAttachments((current) => [...current, ...additions.map(({ key, file }) => ({ key, title: file.name, state: "UPLOADING" as const, message: "准备上传…" }))]);
    void (async () => { for (const { key, file } of additions) await upload(key, file); })();
  }
  async function retry(item: Attachment) {
    if (item.jobId) {
      try { await request(`/api/ingest-jobs/${item.jobId}/retry`, { method: "POST" }); replaceAttachments((current) => current.map((source) => source.key === item.key ? { ...source, state: "READING", message: "重新读取中…" } : source)); setSourceRefresh((value) => value + 1); }
      catch (cause) { setNotice(cause instanceof Error ? cause.message : "重试失败"); }
    } else { const file = files.current.get(item.key); if (file) await upload(item.key, file); else setNotice("请移除该附件，再重新选择文件。"); }
  }
  function toggleSource(source: { id: string; title: string | null }) {
    replaceAttachments((current) => current.some((item) => item.id === source.id) ? current.filter((item) => item.id !== source.id) : current.length >= 8 ? current : [...current, { key: source.id, id: source.id, title: source.title || "未命名资料", state: "READING", message: "正在检查资料…" }]);
  }
  async function createFolder() {
    if (!newFolder.trim() || creatingFolder) return;
    setCreatingFolder(true); setPanelError("");
    try { const data = await request<{ folders: FolderOption[] }>("/api/sidebar/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newFolder.trim() }) }); const created = data.folders.find((item) => !folders.some((old) => old.folderId === item.folderId)); setFolders(data.folders); if (created) setFolderId(created.folderId); setNewFolder(""); close(); }
    catch (cause) { setPanelError(cause instanceof Error ? cause.message : "创建失败"); }
    finally { setCreatingFolder(false); }
  }
  const activeModel = models?.models.find((item) => item.modelId === (model?.modelId ?? models.defaultModelId) && item.provider === (model?.provider ?? models.provider));
  const invalidModel = Boolean(model && models && !activeModel);
  const imageMismatch = attachments.some((item) => item.requiresImage) && !(activeModel?.image ?? models?.defaultImage);
  const missingSkill = skillIds.some((id) => !skills.some((skill) => skill.current.id === id && skill.status !== "DISABLED"));
  const blocked = !models?.configured || invalidModel || imageMismatch || missingSkill || attachments.some((item) => item.state !== "READY");
  const statusMessage = invalidModel ? "所选模型已不可用，请重新选择。" : imageMismatch ? "这些图片需要支持图片的模型，请切换模型或移除图片。" : missingSkill ? "已选 Skill 有更新或已停用，请重新选择。" : attachments.some((item) => item.state === "FAILED") ? "请重试或移除失败的附件。" : attachments.some((item) => item.state !== "READY") ? "资料读好后即可发送。" : models && !models.configured ? "请先配置创作模型。" : "";
  function submit() { if (!blocked && !busy && canCreate && idea.trim()) onSubmit({ sourceItemIds: attachments.flatMap((item) => item.id ? [item.id] : []), methodVersionIds: skillIds, folderId: folderId ?? undefined, modelSelection: model }); }
  useLayoutEffect(() => { if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = `${Math.min(200, Math.max(82, inputRef.current.scrollHeight))}px`; } }, [idea, inputRef]);
  const keepOpen = Boolean(idea || attachments.length || skillIds.length || panel || busy);
  const matches = (value: string) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const popup = panel ? createPortal(<div ref={panelRef} role="dialog" aria-label={{ models: "选择模型", skills: "选择 Skill", folders: "选择项目文件夹", library: "从资料库选择" }[panel]} className="home-picker" style={{ ...position, position: "fixed" }}>
    <header><strong>{{ models: "选择模型", skills: "选择 Skill", folders: "选择项目文件夹", library: "从资料库选择" }[panel]}</strong><button type="button" aria-label="关闭选择框" onClick={close}><X size={16} /></button></header>
    {panel !== "models" ? <input autoFocus aria-label={{ skills: "搜索 Skill", folders: "搜索项目文件夹", library: "搜索已有资料" }[panel]} placeholder="搜索…" value={search} onChange={(event) => setSearch(event.target.value)} /> : null}
    {panelLoading ? <p role="status">正在读取…</p> : null}{panelError ? <p role="alert">{panelError}</p> : null}
    <div className="home-picker-list">
      {panel === "models" ? <>{models?.configured ? <button type="button" className="home-picker-row" aria-pressed={!model} onClick={() => { setModel(null); close(); }}><Box /><span><b>跟随工作区默认</b><small>{models.models.find((item) => item.modelId === models.defaultModelId)?.label || models.defaultLabel}</small></span>{!model ? <Check /> : null}</button> : <p>还没有配置可用模型。</p>}{models?.models.filter(item => item.modelId !== models.defaultModelId).map((item) => <button type="button" className="home-picker-row" key={item.modelId} aria-pressed={model?.modelId === item.modelId} onClick={() => { setModel({ provider: item.provider, modelId: item.modelId }); close(); }}><Box /><span><b>{item.label}</b><small>{item.description}</small></span>{model?.modelId === item.modelId ? <Check /> : null}</button>)}</> : null}
      {panel === "skills" ? skills.filter((skill) => skill.status !== "DISABLED" && matches(`${skill.current.title} ${skill.current.steps.join(" ")}`)).map((skill) => <label className="home-picker-row" key={skill.id}><input type="checkbox" checked={skillIds.includes(skill.current.id)} disabled={!skillIds.includes(skill.current.id) && skillIds.length >= 1} onChange={() => setSkillIds((current) => current.includes(skill.current.id) ? current.filter((id) => id !== skill.current.id) : [...current, skill.current.id])} /><span><b>{skill.current.title}</b><small>{skill.current.steps[0] || "用于本次创作"}</small></span></label>) : null}
      {panel === "skills" && !panelLoading && !skills.some((skill) => skill.status !== "DISABLED" && matches(`${skill.current.title} ${skill.current.steps.join(" ")}`)) ? <p>没有匹配的可用 Skill。</p> : null}
      {panel === "folders" ? <><button type="button" className="home-picker-row" aria-pressed={!folderId} onClick={() => { setFolderId(null); close(); }}><Folder /><span>未分组</span>{!folderId ? <Check /> : null}</button>{folders.filter((folder) => matches(folder.label)).map((folder) => <button type="button" className="home-picker-row" key={folder.folderId} aria-pressed={folderId === folder.folderId} onClick={() => { setFolderId(folder.folderId); close(); }}><Folder /><span>{folder.label}</span>{folderId === folder.folderId ? <Check /> : null}</button>)}</> : null}
      {panel === "library" ? library.map((source) => <label className="home-picker-row" key={source.id}><input type="checkbox" checked={attachments.some((item) => item.id === source.id)} disabled={!attachments.some((item) => item.id === source.id) && attachments.length >= 8} onChange={() => toggleSource(source)} /><span>{source.title || "未命名资料"}</span></label>) : null}
      {panel === "library" && !panelLoading && !library.length ? <p>没有匹配的资料。</p> : null}
    </div>
    <footer>{panel === "models" ? <Link href="/settings/integrations">管理模型服务</Link> : panel === "skills" ? <><span>已选 {skillIds.length}/1</span><Link href="/library/methods">管理 / 导入 Skill</Link></> : panel === "library" ? <><span>已选 {attachments.length}/8</span><Link href="/library">打开资料库</Link></> : <div className="home-new-folder"><input aria-label="新项目文件夹名称" placeholder="新建项目文件夹" maxLength={80} value={newFolder} onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }} /><button type="button" disabled={!newFolder.trim() || creatingFolder} onClick={() => void createFolder()}><Plus size={14} />创建</button></div>}</footer>
  </div>, document.body) : null;
  return <div className="home-composer-stack">
    <form ref={formRef} className={`xsj-composer home-composer ${keepOpen ? "is-expanded" : ""} ${panel ? "has-popover" : ""} ${dragging ? "is-dragging" : ""}`} onSubmit={(event) => { event.preventDefault(); submit(); }} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }} onPaste={(event) => { const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/")); if (pasted.length) { event.preventDefault(); addFiles(pasted); } }}>
      <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden aria-label="上传本地文件" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      {attachments.length ? <div className="home-attachments">{attachments.map((item) => <div className={`home-attachment is-${item.state.toLowerCase()}`} key={item.key}><FileText /><span><b title={item.title}>{item.title}</b><small>{item.message}</small></span>{item.state === "UPLOADING" || item.state === "READING" ? <Loader2 className="xsj-spin" /> : null}{item.state === "FAILED" ? <button type="button" onClick={() => void retry(item)}>重试</button> : null}<button type="button" aria-label={`移除附件 ${item.title}`} disabled={busy} onClick={() => { files.current.delete(item.key); replaceAttachments((current) => current.filter((source) => source.key !== item.key)); }}><X /></button></div>)}</div> : null}
      <label className="sr-only" htmlFor="workbench-idea">描述你想完成的事情</label>
      <textarea id="workbench-idea" ref={inputRef} value={idea} onChange={(event) => onIdeaChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode != 229) { event.preventDefault(); submit(); } }} disabled={!canCreate || busy} maxLength={2000} placeholder="描述你想完成的事情，也可以带上资料一起开始…" />
      {skillIds.length ? <div className="home-selected-skills">{skillIds.map((id) => <span key={id}><Zap size={12} />{skills.find((skill) => skill.current.id === id)?.current.title || "失效 Skill"}<button type="button" aria-label="移除 Skill" disabled={busy} onClick={() => setSkillIds((current) => current.filter((item) => item !== id))}><X size={12} /></button></span>)}</div> : null}
      <footer><div className="xsj-composer-tools">
        <button type="button" className="xsj-add" aria-label="添加本地文件" title="添加本地文件，也支持拖入或粘贴图片" disabled={!canCreate || busy || attachments.length >= 8} onClick={() => { setPanel(null); fileInput.current?.click(); }}><Plus /></button>
        <button ref={(node) => { anchors.current.library = node; }} type="button" aria-expanded={panel === "library"} disabled={!canCreate || busy} onClick={() => open("library")}><FileText /><span>资料库</span></button>
        <button ref={(node) => { anchors.current.models = node; }} type="button" aria-label="选择创作模型" aria-expanded={panel === "models"} disabled={!canCreate || busy} onClick={() => open("models")}><Box /><span title={activeModel?.label}>{activeModel?.label || "模型"}</span><ChevronDown size={13} /></button>
        <span className="xsj-tool-divider" /><button ref={(node) => { anchors.current.skills = node; }} type="button" aria-expanded={panel === "skills"} disabled={!canCreate || busy} onClick={() => open("skills")}><Zap /><span>Skill{skillIds.length ? ` · ${skillIds.length}` : ""}</span><ChevronDown size={13} /></button>
      </div><button className="xsj-send" aria-label="开始创作" type="submit" disabled={!canCreate || busy || blocked || !idea.trim()}>{busy ? <Loader2 className="xsj-spin" /> : <ArrowUp />}</button></footer>
      {statusMessage || notice || error ? <div className="home-composer-notice" role={error ? "alert" : "status"}>{error || notice || statusMessage}</div> : null}
    </form>
    <div className="home-project-bar"><button ref={(node) => { anchors.current.folders = node; }} type="button" aria-label="选择项目文件夹" aria-expanded={panel === "folders"} disabled={!canCreate || busy} onClick={() => open("folders")}><Folder size={14} /><span>{folderId ? folders.find((item) => item.folderId === folderId)?.label || "文件夹已失效，请重新选择" : "项目文件夹 · 未分组"}</span><ChevronDown size={13} /></button><Link href="/projects" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>打开已有项目</Link></div>
    <p className="home-composer-notice">发送会开始新工作；要继续已有项目，请先打开它。</p>
    {popup}
  </div>;
}
