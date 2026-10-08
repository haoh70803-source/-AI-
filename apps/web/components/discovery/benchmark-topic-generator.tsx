"use client";

import { Badge, Button } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StudioDrawer } from "@/components/projects/studio-drawer";

type Topic = { title: string; angle: string; why: string; ourTake: string; evidenceHint: string | null; evidenceStatus: "DIRECT" | "HYPOTHETICAL" | "NEEDS_CASE" | "NEEDS_DATA" };
type Result = { runId: string; projectId: string; summary: string; topics: Topic[] };
const evidenceLabels = { DIRECT: "可以直接讲", HYPOTHETICAL: "可以用假设场景", NEEDS_CASE: "建议补真实案例", NEEDS_DATA: "建议补真实数据" } as const;

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || "暂时无法生成选题。");
  return result;
}

export function BenchmarkTopicGenerator({ sourceType, sourceId, available, buttonLabel, unavailableMessage }: { sourceType: "VIDEO" | "CREATOR_PROFILE"; sourceId: string; available: boolean; buttonLabel: string; unavailableMessage: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function generate() {
    setOpen(true); setBusy(true); setError(""); setResult(null);
    try { setResult(await post("/api/benchmark-topics", { sourceType, sourceId }) as Result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法生成选题。"); }
    finally { setBusy(false); }
  }

  async function select(index: number) {
    if (!result) return;
    setSelecting(index); setError("");
    try { const selected = await post(`/api/benchmark-topics/${result.runId}/select`, { topicIndex: index }); router.push(`/dashboard?project=${selected.projectId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法进入创作。"); setSelecting(null); }
  }

  return <>
    <Button className="w-full" disabled={!available || busy} onClick={() => void generate()}>{busy ? "正在找选题…" : buttonLabel}</Button>
    {!available ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{unavailableMessage}</p> : null}
    <StudioDrawer title="我们可以做什么选题" open={open} onClose={() => setOpen(false)} width="max-w-[52rem]">
      {busy ? <p role="status" className="text-sm text-[var(--text-secondary)]">正在结合外部启发和我们的真实情况找不同角度…</p> : null}
      {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
      {result ? <><div className="topic-result-summary"><strong>当前稳定找到 {result.topics.length} 个方向</strong><p>{result.summary}</p></div><div className="topic-result-grid">{result.topics.map((topic, index) => <article key={`${topic.title}-${index}`} className="topic-result-card"><div className="flex items-start justify-between gap-3"><span className="topic-result-index">{index + 1}</span><Badge>{evidenceLabels[topic.evidenceStatus]}</Badge></div><h3>{topic.title}</h3><section><strong>为什么值得做</strong><p>{topic.why}</p></section><section className="topic-own-take"><strong>我们自己的切入</strong><p>{topic.ourTake}</p></section>{topic.evidenceHint ? <details><summary>查看依据建议</summary><p>{topic.evidenceHint}</p></details> : null}<Button className="mt-auto w-full" disabled={selecting !== null} onClick={() => void select(index)}>{selecting === index ? "正在进入创作…" : "选这个题去创作"}</Button></article>)}</div><Button className="mt-4" variant="secondary" disabled={busy || selecting !== null} onClick={() => void generate()}>换一批角度</Button></> : null}
    </StudioDrawer>
  </>;
}
