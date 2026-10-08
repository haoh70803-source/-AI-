"use client";

import { Check, ChevronDown, Folder, FolderPlus, MoreHorizontal, Pin, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandSurface } from "./command-surface";
import { NameDialog } from "./name-dialog";
import type { FolderCommand, ProjectPreferenceCommand } from "@/server/sidebar/service";
import type { ProjectListItemView, ProjectListView } from "@/server/sidebar/view-model";
import type { SidebarInteractionLock } from "../sidebar-state";
import { SidebarFolderMenu } from "./folder-command-menu";
import { SidebarProjectRow } from "./project-command-menu";

type SortMode = "MANUAL" | "RECENT";

function recentOrder(items: ProjectListItemView[]) {
  return [...items].sort((left, right) => new Date(right.recentAt).getTime() - new Date(left.recentAt).getTime() || left.projectId.localeCompare(right.projectId));
}

export function SidebarProjectSections({ view, currentProjectId, onViewChange, onOpenNewProject, onInteractionLockChange }: {
  view: ProjectListView;
  currentProjectId: string | null;
  onViewChange: (view: ProjectListView) => void;
  onOpenNewProject: () => void;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
}) {
  const sortKey = `xsj-sidebar-project-sort:v1:${view.workspaceId}`;
  const foldersKey = `xsj-sidebar-folders:v1:${view.workspaceId}`;
  const [sortMode, setSortMode] = useState<SortMode>("MANUAL");
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"folder" | ProjectListItemView | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [ungroupedOpen, setUngroupedOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);

  useEffect(() => {
    const storedSort = window.localStorage.getItem(sortKey);
    setSortMode(storedSort === "RECENT" ? "RECENT" : "MANUAL");
    try {
      const storedFolders = JSON.parse(window.localStorage.getItem(foldersKey) || "[]") as unknown;
      setExpandedFolderIds(Array.isArray(storedFolders) ? storedFolders.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setExpandedFolderIds([]);
    }
  }, [foldersKey, sortKey]);

  const folderIds = useMemo(() => new Set(view.folders.map(({ folderId }) => folderId)), [view.folders]);
  const expanded = expandedFolderIds.filter((folderId) => folderIds.has(folderId));

  function setMode(mode: SortMode) {
    setSortMode(mode);
    window.localStorage.setItem(sortKey, mode);
  }

  function toggleFolder(folderId: string) {
    const next = expanded.includes(folderId) ? expanded.filter((id) => id !== folderId) : [...expanded, folderId];
    setExpandedFolderIds(next);
    window.localStorage.setItem(foldersKey, JSON.stringify(next));
  }

  async function requestView(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const result = await response.json().catch(() => ({})) as ProjectListView & { message?: string; error?: string };
    if (!response.ok) throw new Error(result.message || result.error || "操作失败，请重试。");
    onViewChange(result);
    window.dispatchEvent(new Event("project-list-changed"));
    return result;
  }

  function preference(projectId: string, command: ProjectPreferenceCommand) {
    if (["MOVE_UP", "MOVE_DOWN", "MOVE_TOP"].includes(command.action)) setMode("MANUAL");
    return requestView(`/api/sidebar/projects/${projectId}/preference`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
  }

  function folderCommand(folderId: string, command: FolderCommand) {
    if (["MOVE_UP", "MOVE_DOWN", "MOVE_TOP"].includes(command.action)) setMode("MANUAL");
    return requestView(`/api/sidebar/folders/${folderId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
  }

  function deleteFolder(folderId: string) {
    return requestView(`/api/sidebar/folders/${folderId}`, { method: "DELETE" });
  }

  async function renameProject(project: ProjectListItemView) {
    setDialog(project);
  }

  async function saveProjectName(project: ProjectListItemView, title: string) {
    const response = await fetch(`/api/projects/${project.projectId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    const result = await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (!response.ok) throw new Error(result.message || result.error || "项目重命名失败。");
    await requestView("/api/sidebar");
  }

  async function createFolder(name: string) {
    if (!name || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await requestView("/api/sidebar/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const created = next.folders.find((folder) => folder.label.toLocaleLowerCase("zh-CN") === name.toLocaleLowerCase("zh-CN"));
      if (created && !expanded.includes(created.folderId)) toggleFolder(created.folderId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法创建文件夹。");
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  const row = (project: ProjectListItemView, keyPrefix: string) => <SidebarProjectRow
    key={`${keyPrefix}:${project.projectId}`}
    project={project}
    active={currentProjectId === project.projectId}
    folders={view.folders}
    canRename={view.canRenameProject}
    onPreference={preference}
    onRename={renameProject}
    onInteractionLockChange={onInteractionLockChange}
  />;

  return <section className="app-sidebar-project-organization" aria-label="项目管理">
    <header className="app-sidebar-project-toolbar">
      <button className="sidebar-section-toggle" type="button" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(!groupsOpen)}>项目<ChevronDown size={13} /></button>
      <div>
        <button type="button" ref={optionsRef} aria-label="项目排序与分组" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)}><MoreHorizontal /></button>
        <button type="button" aria-label="创建项目文件夹" disabled={busy} onClick={() => setDialog("folder")}><FolderPlus /></button>
        {view.canCreateProject ? <button type="button" aria-label="创建项目" onClick={onOpenNewProject}><Plus /></button> : null}
      </div>
    </header>
    <CommandSurface open={optionsOpen} anchor={optionsRef.current} label="项目排序" onClose={() => setOptionsOpen(false)} onInteractionLockChange={onInteractionLockChange}>
      <small>排序方式</small>
      <button type="button" aria-pressed={sortMode === "MANUAL"} onClick={() => { setMode("MANUAL"); setOptionsOpen(false); }}>手动排序{sortMode === "MANUAL" ? <Check /> : null}</button>
      <button type="button" aria-pressed={sortMode === "RECENT"} onClick={() => { setMode("RECENT"); setOptionsOpen(false); }}>最近打开{sortMode === "RECENT" ? <Check /> : null}</button>
    </CommandSurface>
    {groupsOpen ? <>

    {view.pinned.length ? <section className="app-sidebar-project-group" aria-labelledby="sidebar-pinned-projects"><header><Pin /><strong id="sidebar-pinned-projects">置顶</strong><small>{view.pinned.length}</small></header><div>{view.pinned.map((project) => row(project, "pinned"))}</div></section> : null}
    {view.recent.length ? <section className="app-sidebar-project-group" aria-labelledby="sidebar-recent-projects"><header><button type="button" className="sidebar-section-toggle" aria-expanded={recentOpen} onClick={() => setRecentOpen(!recentOpen)}><RotateCcw /><strong id="sidebar-recent-projects">最近打开</strong><ChevronDown /></button></header>{recentOpen ? <div>{view.recent.map((project) => row(project, "recent"))}</div> : null}</section> : null}

    {view.folders.map((folder) => {
      const open = expanded.includes(folder.folderId);
      const projects = sortMode === "RECENT" ? recentOrder(folder.projects) : folder.projects;
      return <section className="app-sidebar-folder" key={folder.folderId}>
        <header>
          <button className="sidebar-folder-toggle" type="button" aria-label={`${open ? "折叠" : "展开"}文件夹：${folder.label}`} aria-expanded={open} onClick={() => toggleFolder(folder.folderId)}><ChevronDown /></button>
          <span className="sidebar-folder-link"><Folder /><strong>{folder.label}</strong><small>{folder.projects.length}</small></span>
          <SidebarFolderMenu folder={folder} onCommand={folderCommand} onDelete={deleteFolder} onInteractionLockChange={onInteractionLockChange} />
        </header>
        {open ? <div>{projects.length ? projects.map((project) => row(project, `folder:${folder.folderId}`)) : <p>文件夹为空</p>}</div> : null}
      </section>;
    })}

    <section className="app-sidebar-project-group" aria-labelledby="sidebar-ungrouped-projects">
      <header><button type="button" className="sidebar-section-toggle" aria-expanded={ungroupedOpen} onClick={() => setUngroupedOpen(!ungroupedOpen)}><strong id="sidebar-ungrouped-projects">未分组</strong><ChevronDown /></button></header>
      {ungroupedOpen ? <div>{view.ungrouped.length ? (sortMode === "RECENT" ? recentOrder(view.ungrouped) : view.ungrouped).map((project) => row(project, "ungrouped")) : <p className="sidebar-empty-group">还没有项目</p>}</div> : null}
    </section>
    </> : null}
    {currentProjectId ? <a className="app-sidebar-all-projects" href="/projects">查看全部项目</a> : null}
    {error ? <p className="app-sidebar-project-error" role="alert">{error}</p> : null}
    {dialog ? <NameDialog title={dialog === "folder" ? "新建文件夹" : "重命名项目"} initialValue={dialog === "folder" ? "" : dialog.label} onSave={(name) => dialog === "folder" ? createFolder(name) : saveProjectName(dialog, name)} onClose={() => setDialog(null)} onInteractionLockChange={onInteractionLockChange} /> : null}
  </section>;
}
