"use client";

import { Badge, Button } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ProjectStatus = "DRAFT" | "RESEARCHING" | "BRIEF_READY" | "WRITING" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";

const statusLabels: Record<ProjectStatus, string> = {
  DRAFT: "草稿",
  RESEARCHING: "研究中",
  BRIEF_READY: "创作简报已就绪",
  WRITING: "写作中",
  IN_REVIEW: "审核中",
  APPROVED: "已批准",
  ARCHIVED: "已归档",
};

const primaryActions: Partial<Record<ProjectStatus, { to: ProjectStatus; label: string }>> = {
  DRAFT: { to: "RESEARCHING", label: "开始研究" },
  RESEARCHING: { to: "BRIEF_READY", label: "确认创作简报完成" },
  BRIEF_READY: { to: "WRITING", label: "开始写作" },
  WRITING: { to: "IN_REVIEW", label: "提交人工审核" },
  IN_REVIEW: { to: "APPROVED", label: "批准母稿" },
  APPROVED: { to: "WRITING", label: "退回修改" },
};

export function ProjectStatusPanel({
  project,
  editable,
}: {
  project: { id: string; title: string; status: ProjectStatus; description: string | null; goal: string | null; audience: string | null };
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const primary = primaryActions[project.status];

  async function request(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "操作失败");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">项目状态</h2><Badge>{statusLabels[project.status]}</Badge></div>
      <dl className="mt-4 grid gap-4 text-sm">
        <div><dt className="text-xs text-[var(--text-secondary)]">创作目标</dt><dd className="mt-1 whitespace-pre-wrap">{project.goal || "未填写"}</dd></div>
        <div><dt className="text-xs text-[var(--text-secondary)]">目标受众</dt><dd className="mt-1 whitespace-pre-wrap">{project.audience || "未填写"}</dd></div>
        <div><dt className="text-xs text-[var(--text-secondary)]">项目说明</dt><dd className="mt-1 whitespace-pre-wrap">{project.description || "未填写"}</dd></div>
      </dl>
      {editable && project.status !== "ARCHIVED" ? (
        <div className="mt-5 grid gap-2">
          {primary ? <Button disabled={busy} onClick={() => request(`/api/projects/${project.id}/transition`, "POST", { to: primary.to })}>{primary.label}</Button> : null}
          {project.status === "IN_REVIEW" ? <Button variant="secondary" disabled={busy} onClick={() => request(`/api/projects/${project.id}/transition`, "POST", { to: "WRITING" })}>退回修改</Button> : null}
          <Button variant="secondary" disabled={busy} onClick={() => { if (window.confirm("归档后项目将从默认列表隐藏，确定继续吗？")) void request(`/api/projects/${project.id}/transition`, "POST", { to: "ARCHIVED" }); }}>归档项目</Button>
          <Button variant="ghost" className="text-[var(--danger)]" disabled={busy} onClick={async () => {
            if (!window.confirm("确定永久删除这个项目吗？项目中的观点 / 证据、创作简报和母稿也会删除，但素材库原始素材会保留。")) return;
            await request(`/api/projects/${project.id}`, "DELETE");
            router.push("/projects");
          }}>删除项目</Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
