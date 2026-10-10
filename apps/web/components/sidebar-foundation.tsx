"use client";

import { ChartNoAxesCombined, ChevronDown, BookOpen, House, LayoutGrid, PanelLeftClose, PanelLeftOpen, Sparkles, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type RefObject } from "react";
import type { ProjectListView } from "@/server/sidebar/view-model";
import { LogoutButton } from "./logout-button";
import { NewProjectDialog } from "./sidebar/new-project-dialog";
import { isResearchPath } from "./research/navigation";
import { SidebarProjectSections } from "./sidebar/project-sections";
import { GlobalSearch } from "./global-search";
import type { SidebarInteractionLock, SidebarVisualState } from "./sidebar-state";

export const mainNavigation = [
 { label: "首页", href: "/home", icon: House },
 { label: "AI 创作", href: "/projects", icon: Sparkles },
 { label: "内容中心", href: "/library", icon: LayoutGrid },
 { label: "研究", href: "/research/new", icon: BookOpen },
 { label: "数据中台", href: "/short-video", icon: ChartNoAxesCombined },
];
function primaryDestination(pathname: string, currentProjectId: string | null) {
 if (pathname === "/short-video") return "/short-video";
 if (currentProjectId || pathname.startsWith("/projects") || ["/topics", "/content-review", "/short-video/tasks"].some(path => pathname === path || pathname.startsWith(path + "/"))) return "/projects";
 if (pathname.startsWith("/library") || pathname.startsWith("/knowledge") || pathname.startsWith("/ip-context")) return "/library";
 if (isResearchPath(pathname) || pathname.startsWith("/discovery") || pathname.startsWith("/recommendations")) return "/research/new";
 return ["/home", "/dashboard", "/short-video"].includes(pathname) ? "/home" : null;
}

type SidebarProps = {
  visualState: SidebarVisualState;
  hoverCapable: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onTogglePinned: () => void;
  onToggleTouch: () => void;
  onCloseTouch: () => void;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
  currentProjectId: string | null;
  activeNavigation: string | null;
  projectListView: ProjectListView;
  onProjectListViewChange: (view: ProjectListView) => void;
  onRefreshProjectList: () => Promise<void>;
  userName: string;
  workspaceName: string;
  isSystemAdmin: boolean;
  accountRef: RefObject<HTMLDetailsElement | null>;
};

export function SidebarFoundation({
  visualState,
  hoverCapable,
  onPointerEnter,
  onPointerLeave,
  onTogglePinned,
  onToggleTouch,
  onCloseTouch,
  onInteractionLockChange,
  currentProjectId,

  projectListView,
  onProjectListViewChange,
  onRefreshProjectList,
  userName,
  workspaceName,
  isSystemAdmin,
  accountRef,
}: SidebarProps) {
  const pathname=usePathname();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const collapsed = visualState === "COLLAPSED";
  const pinned = visualState === "PINNED_EXPANDED";
  const temporary = visualState === "TEMP_EXPANDED";
  const toggle = hoverCapable ? onTogglePinned : onToggleTouch;
  const controlLabel = hoverCapable
    ? pinned ? "取消固定侧栏" : "固定展开侧栏"
    : temporary ? "关闭侧栏" : "临时展开侧栏";

  return <aside
    className={`xsj-app-sidebar ${collapsed ? "is-collapsed" : ""} ${temporary ? "is-temporary" : ""} ${pinned ? "is-pinned" : ""}`}
    data-shell-part="sidebar"
    data-sidebar-state={visualState}
    aria-label="应用导航"
    onPointerEnter={onPointerEnter}
    onPointerLeave={onPointerLeave}
    onClickCapture={(event) => {
      if (!hoverCapable && (event.target as HTMLElement).closest("a")) onCloseTouch();
    }}
  >
    <header className="app-sidebar-header">
      <div className="app-sidebar-brand-row">
        <Link href="/home" aria-label="鑫世界工作台" className="app-sidebar-brand">
          <span className="app-sidebar-icon-slot"><img src="/brand/xin-world-mark-dark.svg" alt="" /></span>
          <span className="app-sidebar-copy"><strong>鑫世界工作台</strong><small className="fusion-brand-caption">CONTENT OS · 1.2</small></span>
        </Link>
        <button type="button" className="app-sidebar-pin app-sidebar-icon-slot" aria-label={controlLabel} aria-pressed={pinned} onClick={toggle}>
          {pinned ? <PanelLeftClose /> : <PanelLeftOpen />}
        </button>
      </div>
    </header>

    <nav className="app-sidebar-navigation" aria-label="主导航">
      {mainNavigation.map(item => <Link key={item.href} href={item.href} aria-label={item.label} title={collapsed ? item.label : undefined} aria-current={primaryDestination(pathname, currentProjectId) === item.href ? "page" : undefined}><span className="app-sidebar-icon-slot"><item.icon strokeWidth={1.8}/></span><span className="app-sidebar-copy">{item.label}</span></Link>)}
      <div className="app-sidebar-search"><GlobalSearch compact onOpenChange={open => onInteractionLockChange("SEARCH", open)} /></div>
    </nav>

    <details className="sidebar-recent-fold" open><summary>最近项目</summary><SidebarProjectSections view={projectListView} currentProjectId={currentProjectId} onViewChange={onProjectListViewChange} onOpenNewProject={() => setNewProjectOpen(true)} onInteractionLockChange={onInteractionLockChange} /></details>



    <Link href="/settings" className="app-sidebar-settings" aria-label="设置与服务" title="设置与服务"><Settings size={19}/><span className="app-sidebar-copy">设置与服务</span></Link>
    <details
      ref={accountRef}
      className="app-sidebar-account"
      onToggle={(event) => onInteractionLockChange("MENU", event.currentTarget.open)}
    >
      <summary aria-label="账户菜单">
        <span className="app-sidebar-icon-slot"><span className="app-sidebar-account-avatar">{userName.slice(0, 1)}</span></span>
        <span className="app-sidebar-copy"><strong>{userName}</strong><small>{workspaceName}</small></span>
        <ChevronDown />
      </summary>
      <div className="app-sidebar-account-menu">
        <header><strong>{userName}</strong><small>{workspaceName}</small></header>
        <span className="app-sidebar-account-divider" />
        <Link href="/settings/account" onClick={() => { if (accountRef.current) accountRef.current.open = false; }}>我的账号</Link>
        <Link href="/settings" onClick={() => { if (accountRef.current) accountRef.current.open = false; }}>设置</Link>
        <Link href="/settings/members" onClick={() => { if (accountRef.current) accountRef.current.open = false; }}>成员与权限</Link>
        {isSystemAdmin ? <><span className="app-sidebar-account-divider" /><Link href="/admin">系统管理</Link></> : null}
        <span className="app-sidebar-account-divider" />
        <LogoutButton />
      </div>
    </details>
    <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} onInteractionLockChange={onInteractionLockChange} onCreated={onRefreshProjectList} />
  </aside>;
}
