"use client";

import { Archive, ChevronRight, Folder, FolderPlus, Layers, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSidebarLockController } from "../app-shell";
import { NameDialog } from "../sidebar/name-dialog";
import { SidebarFolderMenu } from "../sidebar/folder-command-menu";
import type { ProjectFolderView, ProjectListView } from "@/server/sidebar/view-model";

export function FolderLibrary({ initialView, search = "", sort = "manual" }: { initialView: ProjectListView; search?: string; sort?: string }) {
  const router = useRouter();
  const lock = useSidebarLockController();
  const [view, setView] = useState(initialView);
  const [create, setCreate] = useState(false);
  useEffect(() => { setView(initialView); }, [initialView]);
  async function mutate(url: string, method: string, data?: unknown) {
    const response = await fetch(url, { method, ...(data ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}) });
    const result = await response.json().catch(() => ({})) as ProjectListView & { message?: string };
    if (!response.ok) throw new Error(result.message || "文件夹操作失败，请重试。");
    setView(result);
    window.dispatchEvent(new Event("project-list-changed"));
    router.refresh();
    return result;
  }
  const folders: ProjectFolderView[] = [...view.folders, { folderId: "ungrouped", label: "未分组", sortOrder: Number.MAX_SAFE_INTEGER, projects: view.ungrouped }];
  const visible = folders.filter((folder) => !search.trim() || `${folder.label} ${folder.projects.map((item) => item.label).join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  if (sort === "name") visible.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  if (sort === "updated") visible.sort((a, b) => Math.max(0, ...b.projects.map((p) => Date.parse(p.updatedAt))) - Math.max(0, ...a.projects.map((p) => Date.parse(p.updatedAt))));
  return <div className="folder-library">
    <header className="folder-library-header"><h1>项目库</h1><p>按文件夹整理创作，在项目中继续你的工作。</p><button className="project-create-button" onClick={() => setCreate(true)}><FolderPlus size={16} />新建文件夹</button></header>
    <div className="folder-library-toolbar"><nav aria-label="项目库视图"><span aria-current="page">我的文件夹</span><Link href="/projects?view=all"><Layers size={14} />全部创作</Link><Link href="/projects?view=all&status=ARCHIVED"><Archive size={14} />已归档</Link></nav><form method="get"><label><Search size={15} /><input name="search" defaultValue={search} aria-label="搜索文件夹或创作" placeholder="搜索文件夹或创作" /></label><select name="sort" aria-label="文件夹排序" defaultValue={sort} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="manual">手动排序</option><option value="updated">最近更新</option><option value="name">名称排序</option></select><button type="submit" className="sr-only">搜索</button></form></div>
    <div className="folder-library-grid">{visible.map((folder) => <article className="folder-library-card" key={folder.folderId}>
      <Link href={`/projects?folder=${encodeURIComponent(folder.folderId)}`} aria-label={`打开文件夹：${folder.label}`}><div className="folder-library-cover"><i /><span><Folder size={32} strokeWidth={1.3} /></span><b /></div><div className="folder-library-copy"><h2>{folder.label}</h2><p>{folder.projects.length} 个创作<ChevronRight size={12} /></p></div></Link>
      {folder.folderId !== "ungrouped" ? <SidebarFolderMenu folder={folder} onInteractionLockChange={lock} onCommand={(id, command) => mutate(`/api/sidebar/folders/${id}`, "PATCH", command)} onDelete={(id) => mutate(`/api/sidebar/folders/${id}`, "DELETE")} /> : null}
    </article>)}</div>
    {!visible.length ? <div className="folder-library-empty"><Folder size={36} /><h2>没有找到相关文件夹</h2><Link href="/projects">清除搜索</Link></div> : null}
    {!view.folders.length && !search ? <p className="folder-library-hint">现有创作都在“未分组”中。新建文件夹后，可从创作菜单选择“移动到文件夹”。文件夹仅组织你自己的视图。</p> : null}
    {create ? <NameDialog title="新建文件夹" onInteractionLockChange={lock} onClose={() => setCreate(false)} onSave={async (name) => { const next = await mutate("/api/sidebar/folders", "POST", { name }); const folder = next.folders.find((item) => item.label === name); if (folder) router.push(`/projects?folder=${folder.folderId}`); }} /> : null}
  </div>;
}
