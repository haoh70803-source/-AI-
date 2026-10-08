"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export function SkillManagement({ id, title, disabled }: { id: string; title: string; disabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(remove: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/methods/${id}`, { method: remove ? "DELETE" : "PATCH", headers: { "content-type": "application/json" }, ...(remove ? {} : { body: JSON.stringify({ status: disabled ? "SAVED" : "DISABLED" }) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作失败，请重试。");
      setConfirming(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <div className="skill-management"><details><summary>管理</summary><div className="skill-management-actions"><Link href={`/library/methods/${id}`}>编辑名称与内容</Link><button type="button" disabled={busy} onClick={() => void change(false)}>{disabled ? "启用 Skill" : "停用 Skill"}</button><button type="button" disabled={busy} onClick={() => setConfirming(true)}>删除 Skill</button></div></details>{confirming ? <div role="alertdialog" aria-label="确认删除 Skill" className="skill-delete-confirm"><strong>删除“{title}”？</strong><p>将移除 Skill、版本和项目中的 Skill 选择及使用记录。已有对话和成果正文保留。此操作无法撤销。</p><button disabled={busy} onClick={() => void change(true)}>{busy ? "正在删除…" : "确认删除"}</button><button disabled={busy} onClick={() => setConfirming(false)}>取消</button></div> : null}{error ? <p role="alert">{error}</p> : null}</div>;
}
