"use client";
import { ThemedSelect } from "../../themed-select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, Play, RotateCcw, Square, Trash2, Workflow } from "lucide-react";
import { TEARDOWN_LIMITATION, TEARDOWN_STAGES, teardownTimestamp, teardownReportOverview, teardownPercentage, teardownViralityFindings, type TeardownReport } from "@content-center/core";
import type { TeardownHistoryPage, TeardownView } from "@/server/research/teardown/service";

const labels: Record<string, string> = { MATERIAL: "下载作品", TRANSCRIPTION: "转写原文", BASELINE: "比较作者近期表现", ANALYSIS: "语义拆解与报告", COMPLETED: "完成", FAILED: "失败", CANCELLED: "已停止" };
async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "请求未完成，请稍后重试。");
  return body as T;
}
export function TeardownWorkspace({ history: initialHistory, selected, projects, canWrite }: { history: TeardownHistoryPage; selected: TeardownView | null; projects: Array<{ id: string; title: string }>; canWrite: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState(selected), [history, setHistory] = useState(initialHistory);
  const [shareText, setShareText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TeardownView | null>(null);
  const [historyPending, startHistoryTransition] = useTransition();
  const deletedIds = useRef(new Set<string>());
  const requestKey = useRef<string | null>(null), submittedText = useRef("");
  useEffect(() => { setRun(selected && deletedIds.current.has(selected.id) ? null : selected); }, [selected]);
  useEffect(() => { setHistory(initialHistory); }, [initialHistory]);
  useEffect(() => {
    if (!run || !["QUEUED", "RUNNING"].includes(run.status)) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const updated = await responseJson<TeardownView>(await fetch(`/api/research/teardown/${run!.id}`, { signal: controller.signal, cache: "no-store" }));
        if (controller.signal.aborted || deletedIds.current.has(updated.id)) return;
        setRun(updated); setError("");
        setHistory(current => ({ ...current, items: current.items.map(row => row.id === updated.id ? { ...updated, report: null } : row) }));
        if (["QUEUED", "RUNNING"].includes(updated.status)) timer = setTimeout(() => { void poll(); }, 3000);
        else router.refresh();
      } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "读取任务状态失败。"); timer = setTimeout(() => { void poll(); }, 6000); } }
    }
    timer = setTimeout(() => { void poll(); }, 1200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run?.id, run?.status, router]);
  async function start(event?: FormEvent) {
    event?.preventDefault(); if (busy) return;
    const text = shareText;
    if (!text.trim()) { setError("请重新粘贴作品链接后开始拆解。"); return; }
    if (submittedText.current !== text || !requestKey.current) { requestKey.current = crypto.randomUUID(); submittedText.current = text; }
    setBusy(true); setError("");
    try {
      const created = await responseJson<TeardownView>(await fetch("/api/research/teardown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareText: text, requestKey: requestKey.current }) }));
      setRun(created);
      requestKey.current = null;
      router.replace(`/research/teardown?run=${created.id}`, { scroll: false });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "创建任务失败。"); }
    finally { setBusy(false); }
  }
  async function retry(mode: "retry" | "refresh" = "retry") {
    if (!run || busy) return; setBusy(true); setError("");
    try {
      const updated = await responseJson<TeardownView>(await fetch(`/api/research/teardown/${run.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: run.version, mode }) }));
      setRun(updated); setHistory(current => ({ ...current, items: current.items.map(row => row.id === updated.id ? { ...updated, report: null } : row) }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "重试未完成。"); }
    finally { setBusy(false); }
  }
  async function stop() {
    if (!run || busy) return; setBusy(true); setError("");
    try { setRun(await responseJson<TeardownView>(await fetch(`/api/research/teardown/${run.id}`, { method: "DELETE" }))); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "停止失败。"); }
    finally { setBusy(false); }
  }
  function historyHref(page: number, selectedId: string | null = run?.id ?? null) {
    const query = new URLSearchParams();
    if (selectedId) query.set("run", selectedId);
    if (page > 1) query.set("page", String(page));
    return `/research/teardown${query.size ? `?${query.toString()}` : ""}`;
  }
  function changeHistoryPage(page: number) {
    setDeleteTarget(null);
    startHistoryTransition(() => router.replace(historyHref(page), { scroll: false }));
  }
  async function removeHistory() {
    if (!deleteTarget || busy) return;
    const targetId = deleteTarget.id, keptRun = run?.id === targetId ? null : run;
    setBusy(true); setError("");
    try {
      await responseJson(await fetch(`/api/research/teardown/${targetId}/history`, { method: "DELETE" }));
      deletedIds.current.add(targetId);
      setDeleteTarget(null);
      setHistory(current => ({ ...current, total: Math.max(0, current.total - 1), items: current.items.filter(row => row.id !== targetId) }));
      if (!keptRun) { setRun(null); router.replace(historyHref(history.page, null), { scroll: false }); }
      const refreshed = await responseJson<TeardownHistoryPage>(await fetch(`/api/research/teardown?page=${history.page}`, { cache: "no-store" }));
      setHistory(refreshed);
      router.replace(historyHref(refreshed.page, keptRun?.id ?? null), { scroll: false });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "删除历史记录失败。"); }
    finally { setBusy(false); }
  }
  const active = run && ["QUEUED", "RUNNING"].includes(run.status);
  const step = run ? TEARDOWN_STAGES.indexOf((run.lastStage ?? run.stage) as typeof TEARDOWN_STAGES[number]) : -1;
  const completed = run?.status === "COMPLETED" && Boolean(run.report);
  const inputForm = <form className="teardown-input" onSubmit={event => { void start(event); }}><label htmlFor="teardown-link">抖音视频链接 / 分享文字</label><div><textarea id="teardown-link" value={shareText} onChange={event => setShareText(event.target.value)} placeholder="粘贴 https://v.douyin.com/… 或完整分享文字" maxLength={4000} rows={2} disabled={!canWrite || busy} /><button type="submit" disabled={!canWrite || busy || !shareText.trim()}>{busy ? <LoaderCircle size={17} className="teardown-spin" /> : <ChevronRight size={17} />}开始拆解</button></div><small>使用系统已配置的红狐、转写服务与模型 API。资料和报告会保留，关闭页面后任务继续。</small></form>;
  return <main className="teardown-workspace" data-reading={completed ? "true" : undefined} data-testid="teardown-workspace">
    <header className="teardown-heading"><div><span className="teardown-kicker"><Workflow size={14} /> 作品拆解</span><h1>从一条作品，读懂内容的组织方式。</h1><p>粘贴抖音链接，留下可回看、可核验的拆解报告。</p></div><span className="teardown-private">私人研究 · 主动加入项目</span></header>
    {completed ? <details className="teardown-new-input"><summary><Workflow size={13} />拆解另一条作品<ChevronRight size={13} /></summary>{inputForm}</details> : inputForm}
    {error ? <p role="alert" className="teardown-error">{error}</p> : null}
    <div className="teardown-layout"><aside className="teardown-history" aria-label="拆解历史"><h2>拆过的 <span>{history.total} · 最新在上</span></h2>{history.items.length ? history.items.map(item => <div className="teardown-history-row" key={item.id} data-testid="teardown-history-item" data-run-id={item.id}><Link href={historyHref(history.page, item.id)} aria-current={run?.id === item.id ? "page" : undefined}><FileText size={16} /><span><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleDateString("zh-CN")}{item.status !== "COMPLETED" ? <> · {labels[item.stage] ?? "等待执行"}</> : null}</small></span><ChevronRight size={13} /></Link>{canWrite ? <button type="button" className="teardown-history-delete" aria-label={`删除历史记录：${item.title}`} title="删除历史记录" disabled={busy || historyPending} onClick={() => setDeleteTarget(item)}><Trash2 size={13} /></button> : null}{deleteTarget?.id === item.id ? <div className="teardown-history-confirm"><p>删除这条拆解记录？已下载资料和已加入项目的成果会保留。{["QUEUED", "RUNNING"].includes(item.status) ? "该拆解任务将停止。" : ""}</p><button type="button" disabled={busy} onClick={() => { void removeHistory(); }}>{busy ? "正在删除…" : "确认删除"}</button><button type="button" disabled={busy} onClick={() => setDeleteTarget(null)}>取消</button></div> : null}</div>) : <p>你的第一份报告会出现在这里。</p>}{history.pages > 1 ? <nav className="teardown-history-pagination" aria-label="拆解历史分页"><span aria-live="polite">第 {history.page} / {history.pages} 页</span><div><button type="button" aria-label="上一页历史" disabled={history.page <= 1 || historyPending || busy} onClick={() => changeHistoryPage(history.page - 1)}><ChevronLeft size={12} />上一页</button><button type="button" aria-label="下一页历史" disabled={history.page >= history.pages || historyPending || busy} onClick={() => changeHistoryPage(history.page + 1)}>下一页<ChevronRight size={12} /></button></div></nav> : null}</aside>
      <div className="teardown-content">{run ? <>
        {!completed ? <section className="teardown-progress" aria-label="拆解进度"><div className="teardown-progress-title"><strong>{run.status === "QUEUED" ? "等待后台执行" : labels[run.stage] ?? "正在准备"}</strong><div>{run.sourceItemId ? <Link href={`/library/${run.sourceItemId}`}>查看资料 <ArrowUpRight size={12} /></Link> : null}{active && canWrite ? <button type="button" onClick={() => { void stop(); }} disabled={busy}><Square size={12} />停止拆解</button> : null}</div></div><ol>{TEARDOWN_STAGES.slice(0, 4).map((stage, index) => <li key={stage} aria-label={`${labels[stage]}：${stage === "BASELINE" && run.comparisonUnavailable ? "数据不足" : step > index ? "已完成" : step === index ? active ? "进行中" : "未完成" : "未开始"}`} className={stage === "BASELINE" && run.comparisonUnavailable ? "is-unavailable" : step > index ? "is-done" : step === index && active ? "is-active" : ""}><span>{stage === "BASELINE" && run.comparisonUnavailable ? "—" : step > index ? <Check size={13} /> : index + 1}</span>{labels[stage]}{stage === "BASELINE" && run.comparisonUnavailable ? "（数据不足）" : null}</li>)}</ol>{active && run.comparisonUnavailable ? <p className="teardown-boundary">红狐未返回公开数据，无法比较作者近期表现；正在基于转写继续生成内容拆解报告。</p> : null}{active ? <p role="status">{run.status === "QUEUED" ? "任务已保存，正在等待后台执行。关闭页面后仍会继续。" : run.transcriptionProgress ?? "当前步骤完成后会自动继续，报告中的原文与时间点来自转写记录。"}</p> : null}</section> : null}
        {run.status === "FAILED" ? <section className="teardown-failure" role="alert"><h2>{run.errorCode === "CANCELLED" ? "拆解已停止" : "这次拆解未完成"}</h2><p>{run.errorMessage}</p>{canWrite ? <button type="button" disabled={busy} onClick={() => { void retry(); }}><RotateCcw size={14} />在当前任务重试</button> : null}<small>在当前任务继续重试，复用已下载的文件、转写和已取得的数据，不新增拆解记录。必要时请先在资料页重试下载或转写。</small></section> : null}
        {run.status === "COMPLETED" && run.report ? <TeardownReading key={run.id} run={run} report={run.report} projects={projects} canWrite={canWrite} onRefresh={() => { void retry("refresh"); }} refreshing={busy} /> : active ? <div className="teardown-waiting"><LoaderCircle className="teardown-spin" size={26} /><h2>把内容和证据整理到一起。</h2><p>报告将包含表现比较、主线、语义时间轴和逐段原文。</p></div> : null}
      </> : <div className="teardown-empty-workspace"><section className="teardown-empty-evidence"><header><strong>原视频与依据</strong><span>等待资料</span></header><div><Workflow size={34}/><h2>先留下可核对的原文。</h2><p>粘贴视频链接后，转写原文与时间轴会出现在这里。</p></div></section><section className="teardown-empty"><header><strong>分析报告</strong><span>尚未开始</span></header><Workflow size={34} /><h2>看懂一条视频，<br/>留下可复用的判断。</h2><div><span>01 下载与转写</span><span>02 作者近期表现</span><span>03 语义拆解</span><span>04 留存与复用</span></div><p>结论保留原文依据。完成后可以保存、导出，再加入项目继续创作。</p></section></div>}</div>
    </div>
  </main>;
}

function TeardownReading({ run, report, projects, canWrite, onRefresh, refreshing }: { run: TeardownView; report: TeardownReport; projects: Array<{ id: string; title: string }>; canWrite: boolean; onRefresh: () => void; refreshing: boolean }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(""), [sharing, setSharing] = useState(false), [notice, setNotice] = useState("");
  const [projectMode, setProjectMode] = useState<"existing" | "new">(projects.length ? "existing" : "new");
  const [projectTitle, setProjectTitle] = useState(report.work.title.replace(/(?:^|\s)#[^\s#]+/gu, " ").trim().slice(0, 200));
  const [projectSearch, setProjectSearch] = useState(""), [projectChoices, setProjectChoices] = useState(projects), [searchingProjects, setSearchingProjects] = useState(false);
  const [sharePreview, setSharePreview] = useState<{ body: string; version: number; blockCount: number; sourceCount: number } | null>(null);
  const [shareResult, setShareResult] = useState<{ artifactId: string; projectId: string; projectTitle: string; alreadyShared: boolean } | null>(null);
  const projectRequest = useRef<{ signature: string; key: string } | null>(null), shareLock = useRef(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null), [loadingMedia, setLoadingMedia] = useState(false), [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null), [openSections, setOpenSections] = useState<Set<number>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    if (!shareOpen) return;
    const controller = new AbortController(); setSharePreview(null);
    void fetch(`/api/research/results/${run.id}/share`, { signal: controller.signal, cache: "no-store" }).then(responseJson<typeof sharePreview>).then(value => { if (!controller.signal.aborted) setSharePreview(value); }).catch(error => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "报告预览暂时无法读取，请关闭后重试。"); });
    return () => controller.abort();
  }, [shareOpen, run.id, run.version]);
  useEffect(() => {
    if (!shareOpen || projectMode !== "existing") return;
    if (!projectSearch.trim()) { setProjectChoices(projects); setSearchingProjects(false); return; }
    const controller = new AbortController(); setSearchingProjects(true);
    const timer = setTimeout(() => {
      void fetch(`/api/projects?search=${encodeURIComponent(projectSearch.trim())}&sort=updated&pageSize=50`, { signal: controller.signal }).then(responseJson<{ items: Array<{ id: string; title: string }> }>).then(value => { if (!controller.signal.aborted) setProjectChoices(value.items); }).catch(error => { if (!controller.signal.aborted) { setProjectChoices([]); setNotice(error instanceof Error ? error.message : "项目搜索失败。"); } }).finally(() => { if (!controller.signal.aborted) setSearchingProjects(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [shareOpen, projectMode, projectSearch, projects]);
  const video = useRef<HTMLVideoElement>(null), pendingSeek = useRef<number | null>(null);
  async function seek(id: number | null) {
    if (id !== null) { setSelectedSegment(id); pendingSeek.current = report.transcript[id]!.startMs / 1000; }
    if (videoUrl && video.current) { if (pendingSeek.current !== null) video.current.currentTime = pendingSeek.current; video.current.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (!run.videoAssetId || !run.sourceItemId) { setNotice("原视频尚不可预览，可打开资料页或原作品核对。"); return; }
    if (loadingMedia) return;
    setLoadingMedia(true); setNotice("");
    try { const access = await responseJson<{ url: string }>(await fetch(`/api/source-items/${run.sourceItemId}/assets/${run.videoAssetId}/access?preview=video`)); setVideoUrl(access.url); }
    catch (error) { setNotice(error instanceof Error ? error.message : "视频预览失败。"); }
    finally { setLoadingMedia(false); }
  }
  function openProject(result: NonNullable<typeof shareResult>) {
    router.push(`/dashboard?project=${encodeURIComponent(result.projectId)}&researchArtifact=${encodeURIComponent(result.artifactId)}`);
  }
  async function share(open = false) {
    if (shareLock.current || !sharePreview?.body || (projectMode === "existing" ? !projectId : !projectTitle.trim())) return;
    shareLock.current = true; setSharing(true); setNotice("");
    const signature = JSON.stringify({ runId: run.id, title: projectTitle.trim() });
    if (projectRequest.current?.signature !== signature) projectRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await responseJson<NonNullable<typeof shareResult>>(await fetch(`/api/research/results/${run.id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(projectMode === "existing" ? { projectId } : { newProject: { title: projectTitle.trim(), clientRequestId: projectRequest.current.key } }), expectedVersion: sharePreview.version }) }));
      setShareResult(result); setNotice(result.alreadyShared ? `报告已在“${result.projectTitle}”中，保留此前保存的版本。` : `报告已加入“${result.projectTitle}”，进入项目后会作为对话依据。`);
      if (projectMode === "new") { setProjectId(result.projectId); setProjectChoices(current => [{ id: result.projectId, title: result.projectTitle }, ...current.filter(project => project.id !== result.projectId)]); }
      if (open) openProject(result);
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "加入项目失败。"); }
    finally { shareLock.current = false; setSharing(false); }
  }
  const { work, baseline, analysis, transcript } = report;
  const overview = teardownReportOverview(report);
  const topics = work.title.match(/(?:^|\s)#[^\s#]+/gu)?.map(topic => topic.trim()) ?? [];
  const displayTitle = work.title.replace(/(?:^|\s)#[^\s#]+/gu, " ").trim() || work.title;
  const count = (value: number | null) => value === null ? "未返回" : value.toLocaleString("zh-CN");
  const percent = teardownPercentage;
  const virality = teardownViralityFindings(analysis);
  const comparisonReason = work.publicDataStatus === "UNAVAILABLE" ? "公开数据未取得，无法比较" : baseline.samples.length < baseline.policy.minSamples ? `样本不足：${baseline.samples.length} / ${baseline.policy.minSamples} 条，暂不计算倍数` : baseline.median !== null && baseline.median < baseline.policy.minMedian ? `中位数低于 ${baseline.policy.minMedian}，暂不计算倍数` : work.metrics.likes === null ? "目标点赞未返回，暂不计算倍数" : "目标点赞 ÷ 作者近期点赞中位数";
  function focusSection(startId: number) {
    setSelectedSection(startId);
    document.getElementById(`td-section-${run.id}-${startId}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  }
  function toggleOriginal(startId: number) {
    setOpenSections(current => { const next = new Set(current); if (next.has(startId)) next.delete(startId); else next.add(startId); return next; });
  }
  const original = (id: number) => <blockquote className={selectedSegment === id ? "is-selected" : undefined}><button type="button" onClick={() => { void seek(id); }} aria-label={`跳转到 ${teardownTimestamp(transcript[id]!.startMs)}`}><Play size={10} />{teardownTimestamp(transcript[id]!.startMs)}</button><p>{transcript[id]!.text}</p></blockquote>;
  const summaryParagraph = (finding: { explanation: string; segmentId?: number }, index: number, showEvidence = true) => {
    const firstSentence = finding.explanation.match(/^[^。！？\n]*[。！？]/u)?.[0] ?? "";
    const lead = firstSentence.length <= 120 ? firstSentence : "";
    const evidence = showEvidence && finding.segmentId !== undefined ? transcript[finding.segmentId] : undefined;
    return <div className="teardown-summary-paragraph" key={index}><p>{lead ? <><strong>{lead}</strong>{finding.explanation.slice(lead.length)}</> : finding.explanation}</p>{evidence ? <button type="button" className="teardown-summary-evidence" onClick={() => { void seek(finding.segmentId!); }} aria-label={`跳转到 ${teardownTimestamp(evidence.startMs)}`} title={evidence.text}><time>{teardownTimestamp(evidence.startMs)}</time><span>{evidence.text}</span></button> : null}</div>;
  };
  const tagTone = { "钩子": "hook", "承诺": "promise", "论点": "argument", "案例": "example", "跑题": "detour", "收束": "closing", "引导": "guide" };
  return <article className="teardown-report" data-testid="teardown-report">
    <section className="teardown-report-cover">
      <header className="teardown-report-header">
        <div><p className="teardown-report-eyebrow">作品拆解 · {work.authorName ?? "作者未返回"}</p><h2 title={work.title}>{displayTitle}</h2>{topics.length ? <p className="teardown-report-topics">{topics.join(" ")}</p> : null}<p className="teardown-report-meta">转写时长 {teardownTimestamp(overview.durationMs)} · {overview.sections.length} 个语义段落 · 生成于 {new Date(report.generatedAt).toLocaleDateString("zh-CN")}<span>{report.model}</span></p></div>
        <div className="teardown-report-actions">
          {canWrite ? <button type="button" className="td-primary" onClick={() => setShareOpen(value => !value)} aria-expanded={shareOpen}>加入项目 <ArrowUpRight size={12} /></button> : null}
          <a href={work.url} target="_blank" rel="noopener noreferrer">在抖音打开 <ArrowUpRight size={12} /></a>
          {run.sourceItemId ? <Link href={`/library/${run.sourceItemId}`}>查看资料 <ArrowUpRight size={12} /></Link> : null}
          <button type="button" onClick={() => { void seek(null); }} disabled={loadingMedia}><Play size={12} />{loadingMedia ? "正在加载…" : "核对原视频"}</button>
          {canWrite ? <button type="button" onClick={onRefresh} disabled={refreshing}><RotateCcw size={12} />{refreshing ? "正在更新…" : "更新分析"}</button> : null}
          <a href={`/api/research/teardown/${run.id}/export`}><Download size={12} />导出 Markdown</a>
        </div>
      </header>
      {shareOpen && canWrite ? <section className="teardown-share" aria-label="把拆解报告加入项目">
        <header><strong>把这次理解带回项目</strong><p>报告与依据保存为项目成果，有读取权限的项目成员可见；私人研究会话不会一起分享。</p></header>
        <div className="teardown-share-mode" role="group" aria-label="选择项目方式">
          <button type="button" aria-pressed={projectMode === "existing"} disabled={sharing} onClick={() => { setProjectMode("existing"); setShareResult(null); }}>加入已有项目</button>
          <button type="button" aria-pressed={projectMode === "new"} disabled={sharing} onClick={() => { setProjectMode("new"); setShareResult(null); }}>新建项目</button>
        </div>
        {projectMode === "new" ? <label className="teardown-share-field">项目名称<input value={projectTitle} maxLength={200} disabled={sharing} onChange={event => { setProjectTitle(event.target.value); setShareResult(null); }} placeholder="为这次创作取一个项目名称" /></label> : <div className="teardown-share-target">
          <label className="teardown-share-field">搜索项目<input type="search" value={projectSearch} disabled={sharing} onChange={event => { setProjectSearch(event.target.value); setProjectId(""); setShareResult(null); }} placeholder="按项目名称搜索" /></label>
          <label className="teardown-share-field">目标项目<ThemedSelect value={projectId} disabled={sharing || searchingProjects} onChange={event => { setProjectId(event.target.value); setShareResult(null); }}><option value="">{searchingProjects ? "正在搜索…" : "选择项目"}</option>{projectChoices.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</ThemedSelect></label>
          {!searchingProjects && !projectChoices.length ? <p>没有找到可用项目，可以切换到“新建项目”。</p> : null}
        </div>}
        <details className="teardown-share-preview"><summary>{sharePreview ? `查看将加入的内容 · ${sharePreview.blockCount} 个结论、${sharePreview.sourceCount} 个来源` : "正在读取报告预览…"}</summary><pre>{sharePreview?.body || "等待报告读取完成后再加入项目。"}</pre></details>
        <div className="teardown-share-actions">
          <button type="button" className="td-share-secondary" disabled={sharing || !sharePreview?.body || (projectMode === "existing" ? !projectId : !projectTitle.trim())} onClick={() => { void share(); }}>{sharing ? "正在加入…" : "确认加入"}</button>
          <button type="button" disabled={sharing || !sharePreview?.body || (projectMode === "existing" ? !projectId : !projectTitle.trim())} onClick={() => { void share(true); }}>加入并继续创作 <ArrowUpRight size={12} /></button>
        </div>
        {shareResult ? <p>已加入“{shareResult.projectTitle}”。<button type="button" onClick={() => openProject(shareResult)}>进入项目，引用报告</button></p> : null}
      </section> : null}
      <div className="teardown-metrics" aria-label="作品表现数据">
        <div className="td-metric-featured"><small>相对作者中位数</small><strong>{baseline.multiple === null ? "暂不计算" : `${baseline.multiple.toFixed(2)}×`}</strong><span>{baseline.samples.length} 条有效样本</span></div>
        <div><small>点赞</small><strong>{count(work.metrics.likes)}</strong><span>公开累计点赞</span></div>
        <div><small>收藏 / 赞</small><strong>{percent(overview.ratios.favorites)}</strong><span>收藏 {count(work.metrics.favorites)}</span></div>
        <div><small>分享 / 赞</small><strong>{percent(overview.ratios.shares)}</strong><span>分享 {count(work.metrics.shares)}</span></div>
        <div><small>评论 / 赞</small><strong>{percent(overview.ratios.comments)}</strong><span>评论 {count(work.metrics.comments)}</span></div>
        <div><small>作者点赞中位数</small><strong>{baseline.median === null ? "不可用" : count(baseline.median)}</strong><span>最近 {baseline.policy.recentDays} 天</span></div>
      </div>
      <div className="teardown-data-note"><p><span className={`td-status-dot${baseline.multiple === null ? " is-gap" : ""}`} />{comparisonReason}</p><details className="teardown-samples"><summary>查看比较样本与计算口径</summary><div className="teardown-sample-content"><p className="teardown-caption">{work.publicDataStatus === "UNAVAILABLE" ? "公开数据未取得 · 内容分析依据已保存转写" : <>红狐提供公开数据 · 作品采集：{new Date(work.capturedAt).toLocaleString("zh-CN")} · 作者样本采集：{new Date(baseline.capturedAt).toLocaleString("zh-CN")}</>}</p><p>最多采集{baseline.policy.maxPages}页、保留{baseline.policy.maxSamples}条。至少{baseline.policy.minSamples}条有效样本且点赞中位数≥{baseline.policy.minMedian}时计算倍数。排除本作品、重复、已知置顶及缺失数据。</p><p>收藏/赞、分享/赞、评论/赞以点赞为分母，不是播放互动率；点赞为零或指标缺失时不计算。播放：{count(work.metrics.views)}。</p>{baseline.gaps.map(gap => <p className="teardown-boundary" key={gap}>{gap}</p>)}<div className="teardown-table-scroll"><table><thead><tr><th>作品</th><th>发布</th><th>点赞</th><th>置顶标识</th></tr></thead><tbody>{baseline.samples.map(sample => <tr key={sample.externalId}><td><a href={sample.url} target="_blank" rel="noopener noreferrer">{sample.title}</a></td><td>{sample.publishedAt ? new Date(sample.publishedAt).toLocaleDateString("zh-CN") : "未知"}</td><td>{sample.likes}</td><td>{sample.pinned === null ? "未返回" : "非置顶"}</td></tr>)}</tbody></table></div><p>过滤或未纳入：{baseline.excluded} 条。倍数不代表爆款判定。</p></div></details></div>
      {work.publicDataStatus === "UNAVAILABLE" ? <p className="teardown-public-gap">公开数据未取得 · 内容分析依据已保存转写。数据不足，无法比较作者近期表现。</p> : null}
    </section>
    {notice ? <p role="status" className="teardown-notice">{notice}{notice.startsWith("报告已加入") && projectId ? <> <Link href={`/projects/${projectId}`}>打开项目 →</Link></> : null}</p> : null}
    {videoUrl ? <div className="teardown-video"><video ref={video} src={videoUrl} controls preload="metadata" playsInline onLoadedMetadata={() => { if (video.current && (!video.current.videoWidth || !video.current.videoHeight)) { setVideoUrl(null); setNotice("预览没有可解码的画面，请重试核对原视频，或打开原作品查看。"); return; } if (video.current && pendingSeek.current !== null) video.current.currentTime = pendingSeek.current; video.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} onError={() => { setVideoUrl(null); setNotice("预览链接过期或文件不可用，请再次点击核对原视频。"); }} /></div> : null}
    <div className="teardown-reading-grid">
      <section className="teardown-structure" aria-label="主线结构" data-testid="teardown-structure">
        <header className="teardown-panel-heading"><h3>主线结构</h3><span>偏离主线 {teardownTimestamp(overview.detourMs)} · 占 {percent(overview.detourPercent)}</span></header>
        <div className="teardown-structure-overview"><h4 className="teardown-sr-only">主线一句话</h4><p className="teardown-thesis">{analysis.thesis}</p><details className="teardown-thesis-evidence"><summary>核对主线原文</summary>{original(analysis.thesisSegmentId)}</details>
          <div className="teardown-timeline-scroll" role="region" aria-label="可横向查看的结构色条" tabIndex={0}><div className="teardown-timeline-track" style={{ minWidth: `${overview.sections.length * 56}px` }}><div className="teardown-timeline" aria-label="语义结构时间轴">{overview.sections.map(section => <button type="button" key={section.startId} data-tone={tagTone[section.label]} className={!section.servesThesis ? "is-detour" : undefined} aria-label={`${section.label} ${teardownTimestamp(section.startMs)}至${teardownTimestamp(section.endMs)}，${section.servesThesis ? "服务主线" : "偏离主线"}`} title={`${section.label} · ${teardownTimestamp(section.startMs)}–${teardownTimestamp(section.endMs)} · ${section.summary}`} style={{ flexGrow: section.durationMs }} onClick={() => focusSection(section.startId)}><span>{section.label}</span></button>)}</div><div className="teardown-timeline-scale"><span>00:00</span><span>语义顺序 · 短段设最小宽度</span><span>{teardownTimestamp(overview.durationMs)}</span></div></div></div>
          <div className="teardown-legend">{[...new Set(analysis.sections.map(section => section.label))].map(label => <span key={label}><i data-tone={tagTone[label]} />{label}</span>)}<span className="td-detour-key">斜纹 = 不服务主线</span></div>
        </div>
        <div className="teardown-segment-toolbar"><span>分段时间轴 · {overview.sections.length} 段</span><button type="button" onClick={() => setOpenSections(openSections.size === overview.sections.length ? new Set() : new Set(overview.sections.map(section => section.startId)))}>{openSections.size === overview.sections.length ? "收起全部原文" : "展开全部原文"}</button></div>
        {overview.sections.map(section => <div className={`teardown-segment${selectedSection === section.startId ? " is-selected" : ""}`} key={section.startId} id={`td-section-${run.id}-${section.startId}`} data-testid="teardown-segment" data-tone={tagTone[section.label]}>
          <button type="button" className="teardown-segment-time" onClick={() => { void seek(section.startId); }} aria-label={`播放段落 ${teardownTimestamp(section.startMs)}`}><Play size={10} />{teardownTimestamp(section.startMs)}</button>
          <span className="teardown-segment-label"><i data-tone={tagTone[section.label]} />{section.label}{!section.servesThesis ? <small>偏离主线</small> : null}</span>
          <div className="teardown-segment-body"><strong>{section.summary}</strong><p><span className="teardown-sr-only">判断理由：</span>{section.reason}</p><button type="button" className="teardown-original-toggle" aria-expanded={openSections.has(section.startId)} aria-controls={`td-original-${run.id}-${section.startId}`} onClick={() => toggleOriginal(section.startId)}><ChevronRight size={11} />{openSections.has(section.startId) ? "收起这段原文" : "展开这段原文"}（{teardownTimestamp(section.startMs)}–{teardownTimestamp(section.endMs)}）</button>{openSections.has(section.startId) ? <div id={`td-original-${run.id}-${section.startId}`} className="teardown-segment-original">{transcript.slice(section.startId, section.endId + 1).map(row => <div key={row.id}>{original(row.id)}</div>)}</div> : null}</div>
        </div>)}
        <footer className="teardown-structure-footnote">色条按语义顺序展示，短段设最小宽度，准确时间以各段起止时间为准。时间与原文来自转写；标签和是否服务主线为 AI 判断。偏离占比按段落起止区间计算，重叠区间去重；转写时长不等于观看时长。</footer>
      </section>
      <aside className="teardown-insights" aria-label="报告分析">
        <section className="teardown-insight-panel" aria-label="做对了什么"><header className="teardown-panel-heading"><h3>做对了什么</h3><span>整条作品 · 总结</span></header><div className="teardown-insight-content">{analysis.strengths.length ? analysis.strengths.map((finding, index) => summaryParagraph(finding, index)) : <p className="teardown-muted">这条内容还没有足够的原文依据，暂时说不准哪些做法值得学。</p>}</div></section>
        <section className="teardown-insight-panel teardown-virality-panel" aria-label="为什么爆"><header className="teardown-panel-heading"><h3>为什么爆</h3><span>传播分析 · AI 假设</span></header><div className="teardown-insight-content"><div className="teardown-performance-summary">{work.publicDataStatus === "UNAVAILABLE" ? <p>这条作品的公开互动数据没拿到，先从内容本身看它有哪些传播潜力。</p> : <><p>这条作品有 <strong>{count(work.metrics.likes)}</strong> 赞，收藏/赞 <strong>{percent(overview.ratios.favorites)}</strong>，分享/赞 <strong>{percent(overview.ratios.shares)}</strong>，评论/赞 <strong>{percent(overview.ratios.comments)}</strong>。</p><p>{baseline.multiple === null ? <>目前还没法判断它在这个账号里算不算突出：{comparisonReason}。</> : <>点赞是作者近期中位数的 <strong>{baseline.multiple.toFixed(2)} 倍</strong>，比较用了 {baseline.samples.length} 条近期作品。</>}</p></>}</div>{analysis.virality === undefined ? <p className="teardown-muted">这份历史报告尚未生成独立的传播分析，点击“更新分析”即可在当前记录补充。</p> : null}{virality.length ? virality.map((finding, index) => summaryParagraph(finding, index, false)) : <p className="teardown-muted">目前证据还不够，暂时说不准哪些做法可能带动传播。</p>}{analysis.trendAssessment ? <div className="teardown-trend-assessment"><h4>热点与阶段关联 <span>{analysis.trendAssessment.status === "RELATED" ? "有相关榜单依据" : analysis.trendAssessment.status === "NO_MATCH" ? "本次榜单未匹配" : "尚未核实"}</span></h4><p>{analysis.trendAssessment.explanation}</p>{report.trendContext ? <small>核查于 {new Date(report.trendContext.checkedAt).toLocaleString("zh-CN")}</small> : null}{analysis.trendAssessment.sourceIds.map(id => { const source = report.trendContext?.sources.find(row => row.id === id); return source ? <p className="teardown-trend-source" key={id}>{source.title} · {source.platform} · 采集 {new Date(source.observedAt).toLocaleString("zh-CN")} · 范围 {new Date(source.windowStart).toLocaleDateString("zh-CN")}–{new Date(source.windowEnd).toLocaleDateString("zh-CN")}</p> : null; })}</div> : null}<p className="teardown-virality-note">这是结合内容和公开数据提出的解释，还不能证明它为什么爆，也不能据此判断完播或留存。</p>{analysis.distractions.length ? <details className="teardown-mainline-risks"><summary>查看主线风险</summary>{analysis.distractions.map((finding, index) => <div className="teardown-finding" key={index}><p>{finding.explanation}</p>{original(finding.segmentId)}</div>)}</details> : null}</div></section>
        <section className="teardown-reading-boundary"><h3>解释边界</h3><p>{TEARDOWN_LIMITATION}</p></section>
      </aside>
    </div>
  </article>;
}
