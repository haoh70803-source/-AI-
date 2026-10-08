"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SidebarInteractionLock } from "../sidebar-state";

/** Menus live outside the scrolling sidebar and follow their actual trigger. */
export function CommandSurface({ open, anchor, label, onClose, onInteractionLockChange, children }: {
  open: boolean;
  anchor: HTMLElement | null;
  label: string;
  onClose: () => void;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const positionMenu = () => {
      const rect = anchor.getBoundingClientRect();
      const height = ref.current?.offsetHeight || 300;
      setPosition({ left: Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)), top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - height - 8)) });
    };
    positionMenu();
    const dismiss = () => closeRef.current();
    window.addEventListener("resize", dismiss);
    const onScroll = (event: Event) => { if (!document.querySelector("dialog[open]") && !ref.current?.contains(event.target as Node)) dismiss(); };
    document.addEventListener("scroll", onScroll, true);
    return () => { window.removeEventListener("resize", dismiss); document.removeEventListener("scroll", onScroll, true); };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    onInteractionLockChange("MENU", true);
    // Only one command menu can be open, including duplicated pinned/recent rows.
    const closeOther = () => closeRef.current();
    window.dispatchEvent(new Event("sidebar-command-open"));
    window.addEventListener("sidebar-command-open", closeOther);
    const outside = (event: PointerEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (!ref.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) closeRef.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); anchor?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), summary") || []).filter(element => element.getClientRects().length > 0);
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (event.key === "Tab") closeRef.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      onInteractionLockChange("MENU", false);
      window.removeEventListener("sidebar-command-open", closeOther);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open, anchor, onInteractionLockChange]);

  return open ? createPortal(<div ref={ref} className="sidebar-command-surface" role="dialog" aria-label={label} style={position}>{children}</div>, document.body) : null;
}
