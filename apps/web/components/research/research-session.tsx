"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchBlock, ResearchCoverage } from "@content-center/core";
import type { ResearchScope } from "@/server/research/contracts";
import { ResearchBlocks } from "./research-blocks";
import type { WorkCreationChoices } from "./work-creation-action";
import { ResearchUseFindings } from "./research-use-findings";
import { ResearchComposer } from "./research-composer";
export type ResearchRunView = { id: string; question: string; version: number; status: string; stage: string; savedAt: string | null; createdAt: string; errorMessage: string | null; blocks: ResearchBlock[]; scope: ResearchScope; coverage: ResearchCoverage | null };
const stageLabels: Record<string, string> = { QUEUED: "等待执行", READING: "正在读取选定资料", ANALYZING: "正在基于来源分析", COMPLETED: "研究已完成", FAILED: "本次研究失败" };
export function ResearchSessionWorkspace({ session, runs, materials, choices, canWrite, hasOlder }: { session: { id: string; title: string; entryTemplate: string; project: { id: string; title: string } | null }; runs: ResearchRunView[]; materials: Array<{ id: string; title: string | null; sourceType: string }>; choices?: WorkCreationChoices; canWrite: boolean; hasOlder: boolean }) {
  const router = useRouter();
  const active = runs.find(run => run.status === "QUEUED" || run.status === "RUNNING");
  const [stage, setStage] = useState(""); const [notice, setNotice] = useState(""); const [pollingVersion, setPollingVersion] = useState(0);
  useEffect(() => {
    if (!active) { setStage(""); return; }
    let stopped = false; let failures = 0; let timer: ReturnType<typeof setTimeout>; let controller: AbortController;
    const started = Date.now();
    const poll = async () => {
      controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/research/sessions/${session.id}/runs/${active.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) { if ([401, 403, 404].includes(response.status)) { stopped = true; setNotice("当前研究不可访问，请重新登录或返回研究首页。"); return; } throw new Error(); }
        const state = await response.json(); failures = 0;
        if (stopped) return;
        setStage(state.errorMessage || stageLabels[state.stage] || "研究正在进行");
        if (!["QUEUED", "RUNNING"].includes(state.status)) { stopped = true; setNotice(state.errorMessage || "研究已完成。"); router.refresh(); return; }
      } catch { if (!stopped && ++failures >= 5) { stopped = true; setNotice("进度暂时无法连接。后台结果仍会保存，可点击刷新状态重连。"); } }
      finally { clearTimeout(abortTimer); if (!stopped) { if (Date.now() - started > 16 * 60 * 1000) { stopped = true; setNotice("本次等待已结束，请刷新查看最终状态。"); } else timer = setTimeout(poll, Math.min(10000, 2500 + (Date.now() - started) / 30)); } }
    };
    void poll(); return () => { stopped = true; controller?.abort(); clearTimeout(timer); };
  }, [active?.id, pollingVersion, router, session.id]);
  async function save(runId: string) { try { const response = await fetch(`/api/research/sessions/${session.id}/runs/${runId}`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setNotice("已保存为研究成果，没有重新调用 AI。"); router.refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败，请重试。"); } }
  return <article className="research-session-page"><header className="research-page-heading"><div><span className="research-eyebrow">研究中心 / 私人研究</span><h1>{session.title}</h1><p>仅你可见 · {session.project ? <>项目背景：<Link href={`/dashboard?project=${session.project.id}`}>{session.project.title}</Link>；项目成员不会自动获得会话权限。</> : "追问会新增研究记录，已保存结果保持稳定。"}</p></div></header>
    <div className="research-scope-strip"><strong>当前研究范围</strong><span>{runs.at(-1)?.scope.materialIds.length ?? 0} 份资料 · {runs.at(-1)?.scope.benchmarkAccountIds.length ?? 0} 个账号 · {runs.at(-1)?.scope.trendKeys.length ?? 0} 条趋势</span><a href="#research-question">{active ? "研究进行中" : "调整范围 / 继续提问 ↓"}</a></div>
    {hasOlder ? <p><Link href={`/research/session/${session.id}?before=${runs[0]?.version}`}>查看更早的研究记录</Link> · <Link href={`/research/session/${session.id}`}>回到最新</Link></p> : null}
    {!runs.length ? <div className="research-center-empty"><h2>从一个问题开始</h2><p>添加资料或补充背景，让每一个判断都能说明依据。</p></div> : null}
    {runs.map(run => <section id={`run-${run.id}`} className="research-turn" key={run.id} data-testid="research-run"><div className="research-user-question"><small>第 {run.version} 次研究 · {new Date(run.createdAt).toLocaleString("zh-CN")}</small><h2>{run.question}</h2></div><div className={`research-run-state is-${run.status.toLowerCase()}`} role="status">{run.id === active?.id ? stage || stageLabels[run.stage] : stageLabels[run.status]}{run.coverage ? <span>实际读取 {run.coverage.readable}/{run.coverage.requested} 条正文 · 未读取原始画面</span> : null}</div>{run.errorMessage ? <p className="research-error" role="alert">{run.errorMessage}{run.status === "FAILED" ? " 可在下方重新发送问题，之前的成果不会覆盖。" : ""}</p> : null}<ResearchBlocks blocks={run.blocks} prefix={run.id} />{run.status === "COMPLETED" ? <div className="research-result-actions">{run.savedAt ? <Link href={`/research/results/run/${run.id}`}>阅读已保存成果 →</Link> : canWrite ? <button type="button" onClick={() => void save(run.id)}>保存本次成果</button> : null}</div> : null}{run.status === "COMPLETED" && choices ? <ResearchUseFindings resultId={run.id} canWrite={canWrite} /> : null}</section>)}
    {notice ? <p className="research-notice" role="status">{notice}</p> : null}{active ? <div className="research-waiting"><p>当前研究完成后即可继续追问。可以离开页面，稍后从最近研究找回。</p><button type="button" onClick={() => { setPollingVersion(value => value + 1); router.refresh(); }}>刷新状态</button></div> : <ResearchComposer key={runs.at(-1)?.id || session.id} sessionId={session.id} canWrite={canWrite} initialMaterials={materials} initialScope={runs.at(-1)?.scope} initialEntry={session.entryTemplate === "BREAKDOWN" || session.entryTemplate === "BENCHMARK" || session.entryTemplate === "OPPORTUNITY" ? session.entryTemplate : "DIRECT"} />}
  </article>;
}
