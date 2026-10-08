"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export function ProjectFilterMenu({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [pathname, query]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current?.open) { ref.current.open = false; ref.current.querySelector<HTMLElement>("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={ref} className={className}>{children}</details>;
}
