"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { SettingsNavigation } from "./settings-navigation";
import "./settings-v1.css";

export function SettingsWindow({ children, name, intercepted = false }: { children: ReactNode; name: string; intercepted?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
  useEffect(() => {
    if (!active) return;
    const element = dialog.current;
    const originalOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    element?.showModal(); element?.focus({ preventScroll: true }); document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = originalOverflow; document.documentElement.style.overflow = htmlOverflow; document.querySelector<HTMLElement>('[aria-label="账户菜单"]')?.focus(); };
  }, [active]);
  useEffect(() => { content.current?.scrollTo(0, 0); }, [pathname]);
  function close() { if (intercepted) router.back(); else router.replace("/dashboard"); }
  if (!active) return null;
  return <dialog ref={dialog} tabIndex={-1} className="settings-window settings-v1" aria-label="设置" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }}>
    <aside className="settings-window-sidebar"><div className="settings-window-label">设置</div><SettingsNavigation name={name} /></aside>
    <div ref={content} className="settings-window-content settings-content">{children}</div>
    <button type="button" className="settings-window-close" aria-label="关闭设置" onClick={close}><X size={20}/></button>
  </dialog>;
}
