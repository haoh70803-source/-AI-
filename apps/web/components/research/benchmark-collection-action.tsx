"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collectionStatusLabel } from "./research-labels";

type ActiveRun = { id: string; status: string } | null;
export function BenchmarkCollectionAction({ accountId, canWrite, initialActive, externalAvailable = true }: { externalAvailable?: boolean; accountId: string; canWrite: boolean; initialActive: ActiveRun }) {
  const router = useRouter();
  const [preset, setPreset] = useState<"30" | "90" | "180" | "CUSTOM">("90");
  const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState("");
  const [run, setRun] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!run || !["QUEUED", "RUNNING"].includes(run.status)) return;
    const controller = new AbortController();
    const started = Date.now(); let failures = 0; let checking = false;
    const timer = window.setInterval(async () => {
      if (checking) return;
      if (Date.now() - started > 16 * 60 * 1000 || failures >= 5) { window.clearInterval(timer); setMessage("进度暂时无法继续同步，稍后重新打开页面查看采集结果。"); return; }
      checking = true;
      const abort = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/discovery/benchmarks/${accountId}/collection-runs/${run.id}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const next = await response.json() as { id: string; status: string; errorMessage?: string };
        failures = 0; setRun(next);
        if (!["QUEUED", "RUNNING"].includes(next.status)) { window.clearInterval(timer); setMessage(next.errorMessage || `采集结束：${collectionStatusLabel[next.status] || "状态待确认"}`); router.refresh(); }
      } catch { failures++; }
      finally { window.clearTimeout(abort); checking = false; }
    }, 5000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [accountId, router, run?.id, run?.status]);
  async function start() {
    if (!externalAvailable || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/discovery/benchmarks/${accountId}/collection-runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preset === "CUSTOM" ? { preset, startDate, endDate } : { preset }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "采集未能启动。");
      setRun(body); setMessage("采集已提交；实际时间范围和状态会在此更新。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "采集未能启动。"); }
    finally { setBusy(false); }
  }
  const running = Boolean(run && ["QUEUED", "RUNNING"].includes(run.status));
  return <div className="research-collection-action"><label>采集范围<select value={preset} onChange={event => setPreset(event.target.value as typeof preset)} disabled={!canWrite || busy || running}><option value="30">最近 30 天</option><option value="90">最近 90 天</option><option value="180">最近 180 天</option><option value="CUSTOM">自定义</option></select></label>{preset === "CUSTOM" ? <div className="research-collection-dates"><label>开始<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} disabled={!canWrite || busy || running} /></label><label>结束<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} disabled={!canWrite || busy || running} /></label></div> : null}<button type="button" disabled={!externalAvailable || !canWrite || busy || running || preset === "CUSTOM" && (!startDate || !endDate)} onClick={() => void start()}>{!externalAvailable ? "采集已暂停" : busy ? "正在提交…" : running ? collectionStatusLabel[run!.status] : "开始采集"}</button>{!externalAvailable ? <p role="status">当前外部采集暂停；页面仅展示实际保存的批次和作品，不会提交新任务。</p> : null}{message ? <p role="status">{message}</p> : null}</div>;
}
