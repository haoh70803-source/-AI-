"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { ProjectListView } from "@/server/sidebar/view-model";

export function ProjectLibrarySync() {
  const router = useRouter();
  const folderId = useSearchParams().get("folder");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!folderId || folderId === "ungrouped") { router.refresh(); return; }
      void fetch("/api/sidebar").then(async (response) => {
        if (!response.ok) return;
        const view = await response.json() as ProjectListView;
        if (!active) return;
        if (!view.folders.some((folder) => folder.folderId === folderId)) router.replace("/projects");
        else router.refresh();
      }).catch(() => undefined);
    };
    window.addEventListener("project-list-changed", refresh);
    return () => { active = false; window.removeEventListener("project-list-changed", refresh); };
  }, [folderId, router]);
  return null;
}
