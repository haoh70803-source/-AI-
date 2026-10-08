"use client";

import { Badge, Button, Card } from "@content-center/ui";
import type { CreationFeedbackContext } from "@/server/creation-feedback/service";
import { useEffect, useRef, useState } from "react";

type Outcome = "DIRECTLY_USED" | "USED_AFTER_EDIT" | "NOT_USED";
type Rating = "HELPFUL" | "NEUTRAL" | "NOT_SUITABLE";
const outcomes: Array<{ value: Outcome; label: string }> = [{ value: "DIRECTLY_USED", label: "直接采用" }, { value: "USED_AFTER_EDIT", label: "修改后采用" }, { value: "NOT_USED", label: "没有采用" }];
const ratings: Array<{ value: Rating; label: string }> = [{ value: "HELPFUL", label: "有帮助" }, { value: "NEUTRAL", label: "一般" }, { value: "NOT_SUITABLE", label: "不适合这次内容" }];

async function request(url: string, body: unknown) {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "反馈保存失败，请稍后重试。");
  return result as CreationFeedbackContext;
}

export function CreationFeedback({ projectId, context, editable }: { projectId: string; context: CreationFeedbackContext; editable: boolean }) {
  const [outcome, setOutcome] = useState<Outcome | null>(context.feedback?.outcome ?? null);
  const [methodRatings, setMethodRatings] = useState<Record<string, Rating>>(() => Object.fromEntries((context.feedback?.methodFeedbacks ?? []).map((item) => [item.methodUsageId, item.rating]).filter((item): item is [string, Rating] => Boolean(item[1]))));
  const [feedback, setFeedback] = useState(context.feedback);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    setFeedback(context.feedback);
    setOutcome(context.feedback?.outcome ?? null);
    setMethodRatings(Object.fromEntries((context.feedback?.methodFeedbacks ?? []).map((item) => [item.methodUsageId, item.rating]).filter((item): item is [string, Rating] => Boolean(item[1]))));
    setError("");
    setNotice("");
  }, [context]);

  if (!context.available) return null;

  async function save() {
    if (!editable || !outcome || !context.motherContentVersion || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const next = await request(`/api/projects/${projectId}/feedback`, { motherContentVersion: context.motherContentVersion, outcome, methodFeedbacks: Object.entries(methodRatings).map(([methodUsageId, rating]) => ({ methodUsageId, rating })) });
      setFeedback(next.feedback); setNotice("已保存这次反馈。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "反馈保存失败，请稍后重试。"); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <Card className="p-5" data-testid="creation-feedback"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">这篇稿最后怎么样？</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">选一个最符合当前这版口播稿的结果，帮助你回看创作过程。</p></div>{feedback ? <Badge>已反馈</Badge> : <span className="text-xs text-[var(--text-secondary)]">尚未反馈</span>}</div><div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="稿件结果">{outcomes.map((item) => <button type="button" role="radio" aria-checked={outcome === item.value} key={item.value} disabled={!editable || busy} onClick={() => setOutcome(item.value)} className={`min-h-11 rounded-lg border px-3 text-sm ${outcome === item.value ? "border-[var(--accent)] bg-[var(--surface-elevated)] font-medium" : "text-[var(--text-secondary)] hover:border-[var(--accent)]"}`}>{item.label}</button>)}</div>{context.methods.length ? <section className="mt-5 border-t pt-4"><h3 className="text-sm font-medium">这次用了这些方法</h3><div className="mt-3 grid gap-3">{context.methods.map((method) => <div key={method.methodUsageId} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{method.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">第 {method.methodVersion} 版</p></div>{methodRatings[method.methodUsageId] ? <Badge>{ratings.find((item) => item.value === methodRatings[method.methodUsageId])?.label}</Badge> : null}</div><div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`${method.title}的本次反馈`}>{ratings.map((item) => <button type="button" role="radio" aria-checked={methodRatings[method.methodUsageId] === item.value} key={item.value} disabled={!editable || busy} onClick={() => setMethodRatings((current) => ({ ...current, [method.methodUsageId]: item.value }))} className={`min-h-11 rounded-lg border px-3 text-xs ${methodRatings[method.methodUsageId] === item.value ? "border-[var(--accent)] bg-[var(--surface-elevated)] font-medium" : "text-[var(--text-secondary)] hover:border-[var(--accent)]"}`}>{item.label}</button>)}</div></div>)}</div></section> : null}{editable ? <Button className="mt-5" disabled={!outcome || busy} onClick={() => void save()}>{busy ? "保存中…" : "保存反馈"}</Button> : null}{error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}{notice ? <p role="status" className="mt-3 text-sm text-[var(--success)]">{notice}</p> : null}</Card>;
}
