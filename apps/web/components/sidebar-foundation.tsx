"use client";

import { ChevronDown, Compass, House, FileText, Folder, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type RefObject } from "react";
import type { ProjectListView } from "@/server/sidebar/view-model";
import { LogoutButton } from "./logout-button";
import { NewProjectDialog } from "./sidebar/new-project-dialog";
import { SidebarProjectSections } from "./sidebar/project-sections";
import type { SidebarInteractionLock, SidebarVisualState } from "./sidebar-state";

const groups=[
 {label:"内容创作",icon:Folder,items:[{label:"今日任务",href:"/short-video/tasks"},{label:"项目管理",href:"/projects"},{label:"选题中心",href:"/topics"},{label:"内容审核",href:"/content-review"}]},
 {label:"知识与资料",icon:FileText,items:[{label:"资料库",href:"/library"},{label:"知识中心",href:"/knowledge"},{label:"事实确认",href:"/knowledge/facts"},{label:"创作方法",href:"/library/methods"},{label:"IP 背景信息",href:"/ip-context"}]},
 {label:"研究与洞察",icon:Compass,items:[{label:"开始研究",href:"/research/new"},{label:"对标研究",href:"/research/benchmarks"},{label:"热点趋势",href:"/research/trends"},{label:"研究成果",href:"/research/results"},{label:"研究总览",href:"/research"}]},
];

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
  const [openGroups,setOpenGroups]=useState<Record<string,boolean>>({});
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
      <Link href="/home" aria-label="首页" aria-current={pathname==="/home"||pathname==="/short-video"?"page":undefined}><span className="app-sidebar-icon-slot"><House/></span><span className="app-sidebar-copy">首页</span></Link>
      <Link href="/dashboard" aria-label="工作台" aria-current={pathname==="/dashboard"&&!currentProjectId?"page":undefined}><span className="app-sidebar-icon-slot"><Plus/></span><span className="app-sidebar-copy">工作台</span></Link>
      {groups.map(group=>{const active=group.items.some(item=>pathname===item.href);const open=openGroups[group.label]??active;return <div className="nav-group" key={group.label}><button aria-label={group.label} aria-expanded={open&&!collapsed} aria-controls={"nav-"+group.label} title={collapsed?group.label:undefined} onClick={()=>{if(collapsed)toggle();setOpenGroups(prev=>({...prev,[group.label]:!open}));}}><span className="app-sidebar-icon-slot"><group.icon strokeWidth={1.8}/></span><span className="app-sidebar-copy">{group.label}</span><ChevronDown className="nav-chevron"/></button>{open&&<div id={"nav-"+group.label} className="nav-group-items">{group.items.map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined}>{item.label}</Link>)}</div>}</div>})}

      {currentProjectId && !collapsed ? <Link href={`/research?projectId=${encodeURIComponent(currentProjectId)}`} aria-label="从此项目开始研究" title={collapsed ? "从此项目开始研究" : undefined}><span className="app-sidebar-icon-slot"><Compass strokeWidth={1.8} /></span><span className="app-sidebar-copy">从此项目开始研究</span></Link> : null}
    </nav>

    <details className="sidebar-recent-fold" open><summary>最近项目</summary><SidebarProjectSections view={projectListView} currentProjectId={currentProjectId} onViewChange={onProjectListViewChange} onOpenNewProject={() => setNewProjectOpen(true)} onInteractionLockChange={onInteractionLockChange} /></details>



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
