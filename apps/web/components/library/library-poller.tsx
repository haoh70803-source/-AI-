"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LibraryPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 2500);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return null;
}
