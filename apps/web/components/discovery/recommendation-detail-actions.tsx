"use client";

import { Button } from "@content-center/ui";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecommendationDetailActions({ itemId, canWrite, contentIdeaId, projectId }: { itemId: string; canWrite: boolean; contentIdeaId: string | null; projectId: string | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function act(action: "SAVE_IDEA" | "START_RESEARCH" | "START_CREATION", collectMissing = false) {
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/discovery/recommendations/${itemId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, collectMissing }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "操作未完成。");
      if (body.status === "CONFIRM_COLLECTION") {
        if (window.confirm("该方向引用了尚未收录的外部内容。确认后会收录所需资料并启动处理，是否继续？")) return act("START_CREATION", true);
        return;
      }
      if (body.projectId) router.push(`/dashboard?project=${body.projectId}`);
      else if (body.ideaId) router.push(`/discovery/ideas/${body.ideaId}`);
      else router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作未完成。"); }
    finally { setBusy(""); }
  }
  if (!canWrite) return <p className="text-sm text-[var(--text-secondary)]">当前为只读权限，可查看依据但不能保存或启动创作。</p>;
  if (projectId) return <Button onClick={() => router.push(`/dashboard?project=${projectId}`)}>回到工作台</Button>;
  if (contentIdeaId) return <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => router.push(`/discovery/ideas/${contentIdeaId}`)}>查看选题</Button><Button disabled={Boolean(busy)} onClick={() => void act("START_CREATION")}>{busy ? <Loader2 size={15} className="animate-spin" /> : null}开始创作</Button>{error ? <p role="alert" className="w-full text-sm text-[var(--danger)]">{error}</p> : null}</div>;
  return <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act("SAVE_IDEA")}>加入选题</Button><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act("START_RESEARCH")}>开始研究</Button><Button disabled={Boolean(busy)} onClick={() => void act("START_CREATION")}>{busy ? <Loader2 size={15} className="animate-spin" /> : null}开始创作</Button>{error ? <p role="alert" className="w-full text-sm text-[var(--danger)]">{error}</p> : null}</div>;
}
