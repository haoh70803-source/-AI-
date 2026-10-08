"use client";

import { Maximize2, Minus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import {
  SIDEBAR_PIN_COOKIE,
  initialSidebarState,
  sidebarMachineReducer,
  sidebarVisualState,
  type SidebarInteractionLock,
} from "./sidebar-state";
import { SidebarFoundation } from "./sidebar-foundation";
import type { ProjectListView } from "@/server/sidebar/view-model";
import "./app-shell.css";

export type AppShellProps = {
  userName: string;
  workspaceName: string;
  isSystemAdmin: boolean;
  initialPinned: boolean;
  initialProjectListView: ProjectListView;
};

const SidebarInteractionContext = createContext<(lock: SidebarInteractionLock, active: boolean) => void>(() => undefined);

export function useSidebarLockController() { return useContext(SidebarInteractionContext); }

export function useSidebarInteractionLock(lock: SidebarInteractionLock, active: boolean) {
  const setInteractionLock = useContext(SidebarInteractionContext);
  useEffect(() => {
    if (!active) return;
    setInteractionLock(lock, true);
    return () => setInteractionLock(lock, false);
  }, [active, lock, setInteractionLock]);
}

function writePinnedCookie(pinned: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIDEBAR_PIN_COOKIE}=${pinned ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function AppShell({ userName, workspaceName, isSystemAdmin, initialPinned, initialProjectListView }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentProjectId = pathname === "/dashboard" ? searchParams.get("project") : null;
  const activeNavigation = currentProjectId ? "项目" : pathname === "/dashboard" ? "开始工作" : pathname.startsWith("/projects") ? "项目" : pathname.startsWith("/library/methods") ? "Skill" : pathname.startsWith("/library") ? "资料" : pathname.startsWith("/discovery") || pathname.startsWith("/research") ? "研究" : null;
  const [machine, dispatch] = useReducer(sidebarMachineReducer, initialPinned, initialSidebarState);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [projectListView, setProjectListView] = useState(initialProjectListView);
  useEffect(() => { setProjectListView(initialProjectListView); }, [initialProjectListView]);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const lockCounts = useRef<Record<SidebarInteractionLock, number>>({ MENU: 0, SEARCH: 0, DIALOG: 0 });
  const visualState = sidebarVisualState(
    hoverCapable ? machine : { ...machine, pinned: false, pointerInside: false },
    hoverCapable,
  );

  const setInteractionLock = useCallback((lock: SidebarInteractionLock, active: boolean) => {
    lockCounts.current[lock] = Math.max(0, lockCounts.current[lock] + (active ? 1 : -1));
    dispatch({ type: lockCounts.current[lock] > 0 ? "LOCK" : "UNLOCK", lock });
    if (!active) {
      window.requestAnimationFrame(() => {
        const sidebar = document.querySelector(".xsj-app-sidebar");
        if (!sidebar?.matches(":hover")) dispatch({ type: "POINTER_LEAVE" });
      });
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 701px) and (hover: hover) and (pointer: fine)");
    const update = () => setHoverCapable(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!menu) return;
    setInteractionLock("MENU", true);
    return () => setInteractionLock("MENU", false);
  }, [menu, setInteractionLock]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu(null);
      setNotice("");
      accountRef.current?.removeAttribute("open");
      dispatch({ type: "CLOSE_TOUCH" });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) accountRef.current.removeAttribute("open");
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  const refreshProjectList = useCallback(async () => {
    const response = await fetch("/api/sidebar");
    const result = await response.json().catch(() => ({})) as ProjectListView & { message?: string; error?: string };
    if (!response.ok) throw new Error(result.message || result.error || "无法刷新项目列表。");
    setProjectListView(result);
  }, []);

  useEffect(() => {
    const refresh = () => { void refreshProjectList().catch(() => undefined); };
    window.addEventListener("project-list-changed", refresh);
    return () => window.removeEventListener("project-list-changed", refresh);
  }, [refreshProjectList]);

  useEffect(() => {
    if (!currentProjectId) return;
    const key = `xsj-sidebar-opened:v1:${projectListView.workspaceId}:${currentProjectId}`;
    const lastSentAt = Number(window.sessionStorage.getItem(key) || 0);
    if (Date.now() - lastSentAt < 5 * 60 * 1_000) return;
    window.sessionStorage.setItem(key, String(Date.now()));
    void fetch(`/api/sidebar/projects/${currentProjectId}/opened`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json() as { updated?: boolean };
        if (result.updated) await refreshProjectList();
      })
      .catch(() => window.sessionStorage.removeItem(key));
  }, [currentProjectId, projectListView.workspaceId, refreshProjectList]);

  function setPinned(pinned: boolean) {
    writePinnedCookie(pinned);
    dispatch({ type: pinned ? "PIN" : "UNPIN" });
  }

  function toggleRail() {
    if (hoverCapable) setPinned(!machine.pinned);
    else dispatch({ type: "TOGGLE_TOUCH" });
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice("当前浏览器不支持全屏，请使用浏览器的全屏功能。");
    }
  }

  useEffect(() => {
    // Editing belongs to the focused field, not canvas or window-level commands.
    const protectEditing = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : document.activeElement;
      if (!target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) return;
      if (!event.isComposing && !event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") return;
      if (event.isComposing || event.key.length === 1 || ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", protectEditing);
    document.addEventListener("keyup", protectEditing);
    return () => { document.removeEventListener("keydown", protectEditing); document.removeEventListener("keyup", protectEditing); };
  }, []);

  return <SidebarInteractionContext.Provider value={setInteractionLock}>
    {!pathname.startsWith("/settings") && !pathname.startsWith("/admin") ? <span hidden className="apple-workspace-marker" /> : null}
    <a className="xsj-skip" href="#main-content">跳到主要内容</a>
    <AppTopbar visualState={visualState} menu={menu} setMenu={setMenu} toggleRail={toggleRail} fullscreen={fullscreen} setNotice={setNotice} />
    <SidebarFoundation
      visualState={visualState}
      hoverCapable={hoverCapable}
      onPointerEnter={() => dispatch({ type: "POINTER_ENTER" })}
      onPointerLeave={() => dispatch({ type: "POINTER_LEAVE" })}
      onTogglePinned={() => setPinned(!machine.pinned)}
      onToggleTouch={() => dispatch({ type: "TOGGLE_TOUCH" })}
      onCloseTouch={() => dispatch({ type: "CLOSE_TOUCH" })}
      onInteractionLockChange={setInteractionLock}
      currentProjectId={currentProjectId}
      activeNavigation={activeNavigation}
      projectListView={projectListView}
      onProjectListViewChange={setProjectListView}
      onRefreshProjectList={refreshProjectList}
      userName={userName}
      workspaceName={workspaceName}
      isSystemAdmin={isSystemAdmin}
      accountRef={accountRef}
    />
    {visualState === "TEMP_EXPANDED" && !hoverCapable ? <button className="xsj-sidebar-backdrop" type="button" aria-label="关闭侧栏" onClick={() => dispatch({ type: "CLOSE_TOUCH" })} /> : null}
    {notice ? <div className="xsj-browser-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}><X /></button></div> : null}
  </SidebarInteractionContext.Provider>;
}

function AppTopbar({ visualState, menu, setMenu, toggleRail, fullscreen, setNotice }: {
  visualState: "COLLAPSED" | "TEMP_EXPANDED" | "PINNED_EXPANDED";
  menu: string | null;
  setMenu: (value: string | null) => void;
  toggleRail: () => void;
  fullscreen: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const expanded = visualState !== "COLLAPSED";
  return <header className="xsj-app-topbar" data-shell-part="topbar">
    <div className="app-topbar-traffic" aria-hidden="true"><i /><i /><i /></div>
    <Link href="/home" className="app-topbar-name">鑫世界工作台</Link>
    <nav aria-label="工作台菜单">{["文件", "编辑", "视图", "窗口", "帮助"].map((label) => <button key={label} type="button" aria-expanded={menu === label} onClick={() => setMenu(menu === label ? null : label)}>{label}</button>)}</nav>
    <div className="app-topbar-window-controls">
      <button type="button" aria-label={expanded ? "收起侧栏" : "展开侧栏"} title="切换侧栏" onClick={toggleRail}><Minus /></button>
      <button type="button" aria-label="切换全屏" onClick={() => void fullscreen()}><Maximize2 /></button>
      <button type="button" aria-label="关闭浮层" title="关闭浮层" onClick={() => { setMenu(null); setNotice(""); }}><X /></button>
    </div>
    {menu ? <><button className="app-topbar-menu-backdrop" aria-label="关闭菜单" onClick={() => setMenu(null)} /><section className="app-topbar-menu" aria-label={menu}>
      {menu === "文件" ? <><Link href="/dashboard">开始工作</Link><Link href="/projects">打开已有项目</Link><Link href="/library">打开资料</Link></>
        : menu === "编辑" ? <><button onClick={() => { document.getElementById("workbench-idea")?.focus(); setMenu(null); }}>编辑创作描述</button><span>选中文本后，可使用系统复制与粘贴快捷键。</span></>
          : menu === "视图" || menu === "窗口" ? <><button onClick={() => { toggleRail(); setMenu(null); }}>{expanded ? "收起侧栏" : "展开侧栏"}</button><button onClick={() => { void fullscreen(); setMenu(null); }}>切换全屏</button><button onClick={() => { window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); setMenu(null); }}>回到顶部</button></>
            : <><strong>鑫世界工作台</strong><span>输入任务开始工作，或从资料与研究中寻找方向。</span><Link href="/settings">设置与服务</Link></>}
    </section></> : null}
  </header>;
}
