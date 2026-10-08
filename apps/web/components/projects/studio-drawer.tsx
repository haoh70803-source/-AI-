"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function StudioDrawer({ title, open, onClose, children, width = "max-w-[26rem]" }: { title: string; open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`h-full w-full overflow-y-auto border-l bg-[var(--surface)] p-5 shadow-2xl ${width}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-[var(--surface)] pb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" autoFocus aria-label="关闭" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--surface-elevated)]"><X size={18} /></button>
      </div>
      <div className="py-5">{children}</div>
    </section>
  </div>;
}
