"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectArchiveButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function archive() {
    if (!window.confirm("归档后项目将从默认列表隐藏，确定继续吗？")) return;
    setBusy(true);
    const response = await fetch(`/api/projects/${projectId}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: "ARCHIVED" }) });
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return <button type="button" className="project-list-action" disabled={busy} onClick={() => void archive()}><Archive size={15} />{busy ? "归档中" : "归档"}</button>;
}
