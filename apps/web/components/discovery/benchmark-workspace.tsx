"use client";

/* finesse · floating-inspector+split-research-workspace · palette=cool-slate-cobalt · density=8 */

import { Badge, Button, Card } from "@content-center/ui";
import type { BenchmarkAnalysisOutput, BenchmarkPlaybookOutput, ExternalContent } from "@content-center/providers";
import { BenchmarkCreatorContent, BenchmarkCreatorHeader, BenchmarkCreatorLearn, BenchmarkCreatorMethod, BenchmarkCreatorProfile, WorkspaceTabs, type BenchmarkView } from "@/components/discovery/benchmark-creator-profile";
import type { BenchmarkCreatorDetailDTO } from "@/server/discovery/benchmark-creator-read-model";
import type { BenchmarkCandidateDTO, BenchmarkStudyDTO } from "@/server/discovery/benchmark-study-service";
import { ArrowRight, BookmarkPlus, ChevronDown, ChevronRight, Ellipsis, FlaskConical, History, Loader2, RefreshCw, Search, Settings2, Trash2, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { MethodSuggestionPanel } from "@/components/learning-suggestion-panels";

type Work = Omit<ExternalContent, "rawProviderMetadata"> & { sourceItemId: string | null; inIdea: boolean };

function externalContentPayload(item: Work) {
  const { sourceItemId, inIdea, ...payload } = item;
  void sourceItemId;
  void inIdea;
  return payload;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "操作失败。"); return body;
}

function list(value: string | string[]) { return typeof value === "string" ? [value] : value; }

export function BenchmarkWorkspace({ profile, candidates, studies: initialStudies, methodSuggestions, suggestionStudyId, canRefresh, canManage }: { profile: BenchmarkCreatorDetailDTO; candidates: BenchmarkCandidateDTO[]; studies: BenchmarkStudyDTO[]; methodSuggestions: ComponentProps<typeof MethodSuggestionPanel>["initial"]; suggestionStudyId: string | null; canRefresh: boolean; canManage: boolean }) {
  const benchmark = profile.account;
  const router = useRouter();
  const [view, setView] = useState<BenchmarkView>("OVERVIEW");
  const [sort, setSort] = useState<"LATEST" | "POPULAR">("LATEST");
  const [items, setItems] = useState<Work[] | null>(null);
  const [studies, setStudies] = useState(initialStudies);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const studyStarting = useRef(false);
  const methodSaving = useRef(false);

  useEffect(() => {
    if (!studies.some((study) => study.status === "PROCESSING")) return undefined;
    const timer = window.setInterval(() => {
      void request(`/api/discovery/benchmarks/${benchmark.id}/studies`).then((body) => { setStudies(body.items); if (!body.items.some((study: BenchmarkStudyDTO) => study.status === "PROCESSING")) router.refresh(); }).catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [benchmark.id, router, studies]);

  async function load() { setBusy(true); setError(""); try { const body = await request(`/api/discovery/benchmarks/${benchmark.id}?sort=${sort}`); setItems(body.items); } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败。"); } finally { setBusy(false); } }
  async function collect(item: Work) { const key = `${item.platform}:${item.externalId}`; setAction(key); setError(""); try { const body = await request("/api/discovery/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: externalContentPayload(item) }) }); setItems((current) => current?.map((value) => value.externalId === item.externalId ? { ...value, sourceItemId: body.sourceItemId } : value) ?? current); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "收录失败。"); } finally { setAction(""); } }
  async function create(item: Work) { setAction(`project:${item.externalId}`); setError(""); try { const body = await request("/api/discovery/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: externalContentPayload(item) }) }); router.push(`/dashboard?project=${body.projectId}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "开始创作失败。"); setAction(""); } }
  async function remove() { if (!window.confirm("确认停用这个共享对标账号？")) return; await request(`/api/discovery/benchmarks/${benchmark.id}`, { method: "DELETE" }); router.push("/discovery"); router.refresh(); }
  function toggleCandidate(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 10 ? current : [...current, id]); }
  async function startStudy(kind: "ACCOUNT_RESEARCH" | "PLAYBOOKS" | "CREATOR_PROFILE") {
    if (!selected.length || studyStarting.current) return;
    studyStarting.current = true;
    setAction(kind === "PLAYBOOKS" ? "playbooks" : kind === "CREATOR_PROFILE" ? "profile" : "study"); setError(""); setNotice("");
    try { const study = await request(`/api/discovery/benchmarks/${benchmark.id}/studies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sampleIds: selected, ...(kind !== "ACCOUNT_RESEARCH" ? { kind } : {}) }) }) as BenchmarkStudyDTO; setStudies((current) => [study, ...current.filter((item) => item.id !== study.id)]); if (kind !== "CREATOR_PROFILE") setSelected([]); setNotice(kind === "PLAYBOOKS" ? "已开始查找这些内容的常见搭配，完成后会自动出现在下方。" : kind === "CREATOR_PROFILE" ? "已开始整理账号画像。你可以先离开，完成后回来查看。" : "已开始研究，完成后会自动出现在下方。请稍候或刷新页面。"); } catch (reason) { setError(reason instanceof Error ? reason.message : "研究暂时无法开始。"); } finally { studyStarting.current = false; setAction(""); }
  }
  async function saveMethod(study: BenchmarkStudyDTO, index: number, content: { title: string; steps: string[]; applicableScenarios: string[]; boundaries: string[] }) {
    if (methodSaving.current) return false;
    const method = study.output && !("kind" in study.output) ? study.output.commonMethods[index] : null; if (!method) return false;
    methodSaving.current = true;
    setAction(`save:${study.id}:${index}`); setError(""); setNotice("");
    try { await request("/api/methods", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ benchmarkStudyId: study.id, methodIndex: index, ...content }) }); setNotice("已保存为创作方法。"); return true; } catch (reason) { setError(reason instanceof Error ? reason.message : "创作方法暂时无法保存。"); return false; } finally { methodSaving.current = false; setAction(""); }
  }

  const visibleStudies = studies.filter((study) => !(study.kind === "PLAYBOOKS" && study.status === "FAILED"));
  const profileSelectionReady = canRefresh && selected.length >= 5 && selected.length <= 10 && selected.every((id) => candidates.find((candidate) => candidate.id === id)?.playbookReady);
  const profileProcessing = visibleStudies.some((study) => study.kind === "CREATOR_PROFILE" && study.status === "PROCESSING");
  function openResearch(target: "content" | "history") {
    setView("RESEARCH");
    window.setTimeout(() => document.getElementById(target === "history" ? "benchmark-study-history" : "benchmark-content-browser")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function openTopics() {
    setView("OVERVIEW");
    window.setTimeout(() => document.getElementById("benchmark-topic-entry")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }
  return <div className="benchmark-page"><div className="benchmark-topline"><nav aria-label="面包屑" className="benchmark-breadcrumb"><Link href="/discovery">研究</Link><ChevronRight size={14} /><span>对标博主</span></nav><div className="benchmark-top-actions"><Button variant="secondary" aria-label="选择代表内容与研究记录" onClick={() => openResearch("content")}><Settings2 size={15} />管理代表内容</Button><details className="benchmark-more-menu"><summary aria-label="更多操作"><Ellipsis size={17} /></summary><div><button type="button" aria-label="查看研究历史" onClick={(event) => { (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); openResearch("history"); }}><History size={15} />查看研究历史</button>{canManage ? <button type="button" aria-label="停用对标" className="is-danger" onClick={(event) => { (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); void remove(); }}><Trash2 size={14} />停用对标</button> : null}</div></details></div></div>
    <div className="benchmark-layout"><main className="min-w-0"><BenchmarkCreatorHeader profile={profile} onExploreTopics={openTopics} />
    <WorkspaceTabs value={view} onChange={setView} />
    {view === "OVERVIEW" ? <BenchmarkCreatorProfile profile={profile} onShowContent={() => setView("CONTENT")} onShowResearch={() => openResearch("content")} canGenerateTopics={canRefresh && profile.creatorProfile?.schemaVersion === "benchmark-creator-profile-v4"} /> : null}
    {view === "CONTENT" ? <BenchmarkCreatorContent profile={profile} /> : null}
    {view === "METHOD" ? <div className="benchmark-profile-stack"><MethodSuggestionPanel benchmarkAccountId={benchmark.id} studyId={suggestionStudyId} initial={methodSuggestions} editable={canRefresh} /><BenchmarkCreatorMethod profile={profile} selectedProfileCount={selected.length} canGenerateProfile={profileSelectionReady} profileBusy={action === "profile" || profileProcessing} onShowResearch={() => setView("RESEARCH")} onGenerateProfile={() => void startStudy("CREATOR_PROFILE")} /></div> : null}
    {view === "LEARN" ? <BenchmarkCreatorLearn profile={profile} canGenerate={canRefresh && profile.creatorProfile?.schemaVersion === "benchmark-creator-profile-v4"} /> : null}
    {view === "RESEARCH" ? <div data-testid="benchmark-research-view" role="tabpanel" className="benchmark-research-panel benchmark-glass">
      <div id="benchmark-content-browser"><RepresentativeContent candidates={candidates} selected={selected} canStudy={canRefresh} action={action} onToggle={toggleCandidate} onClear={() => setSelected([])} onStart={(kind) => void startStudy(kind)} /></div>
      <StudyHistory studies={visibleStudies} action={action} onSave={saveMethod} />
      {error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}{notice ? <p role="status" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--success)]">{notice}<Link href="/library/methods" className="font-medium text-[var(--accent)]">查看创作方法</Link></p> : null}
      <AccountWorks sort={sort} setSort={setSort} items={items} busy={busy} canRefresh={canRefresh} action={action} onLoad={() => void load()} onCollect={(item) => void collect(item)} onCreate={(item) => void create(item)} />
    </div> : null}</main></div>
  </div>;
}

function AccountWorks({ sort, setSort, items, busy, canRefresh, action, onLoad, onCollect, onCreate }: { sort: "LATEST" | "POPULAR"; setSort: (value: "LATEST" | "POPULAR") => void; items: Work[] | null; busy: boolean; canRefresh: boolean; action: string; onLoad: () => void; onCollect: (item: Work) => void; onCreate: (item: Work) => void }) {
  return <details className="benchmark-account-works"><summary><div><h2>账号作品</h2><p>按需加载一页作品，不会自动下载内容。</p></div><ChevronDown size={17} /></summary><div className="benchmark-account-works-body"><div className="flex justify-end gap-2"><select value={sort} onChange={(event) => setSort(event.target.value as "LATEST" | "POPULAR")} className="h-11 rounded-xl border bg-white/65 px-3 text-sm"><option value="LATEST">最新内容</option><option value="POPULAR">热门内容</option></select><Button disabled={!canRefresh || busy} onClick={onLoad}>{busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {items ? "刷新" : "加载作品"}</Button></div>{!canRefresh ? <p className="mt-4 rounded-xl border p-4 text-sm text-[var(--text-secondary)]">当前权限可查看对标账号，但不会发起付费数据刷新。</p> : null}{items === null ? <Card className="mt-4 grid min-h-32 place-items-center border-white/60 bg-white/55 p-6 text-center shadow-none"><div><p className="font-medium">作品尚未加载</p><p className="mt-2 text-sm text-[var(--text-secondary)]">点击“加载作品”后才会请求内容数据服务。</p></div></Card> : items.length ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={`${item.platform}:${item.externalId}`} className="overflow-hidden border-white/60 bg-white/60">{item.coverUrl ? <img src={item.coverUrl} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-[var(--surface-elevated)]" />}<div className="p-4"><div className="flex gap-2">{item.sourceItemId ? <Badge className="text-[var(--success)]">已收录</Badge> : null}{item.inIdea ? <Badge>已加入选题</Badge> : null}</div><h3 className="mt-3 line-clamp-2 font-semibold">{item.title || item.description || "未命名内容"}</h3><div className="mt-4 flex flex-wrap gap-2">{item.sourceItemId ? <Button variant="secondary" asChild><Link href={`/library/${item.sourceItemId}`}>查看资料</Link></Button> : <Button variant="secondary" disabled={Boolean(action)} onClick={() => onCollect(item)}>{action === `${item.platform}:${item.externalId}` ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />} 收录资料</Button>}<Button disabled={Boolean(action)} onClick={() => onCreate(item)}>{action === `project:${item.externalId}` ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} 开始创作</Button></div></div></Card>)}</div> : <Card className="mt-4 p-8 text-center text-sm text-[var(--text-secondary)]">该账号暂无可用作品。</Card>}</div></details>;
}

function CandidateCover({ candidate, compact = false }: { candidate: BenchmarkCandidateDTO; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [candidate.coverUrl]);
  if (!candidate.coverUrl || failed) return <div aria-hidden="true" className={`benchmark-candidate-cover is-empty ${compact ? "is-compact" : ""}`}><Video size={compact ? 14 : 18} /></div>;
  return <img ref={imageRef} src={candidate.coverUrl} alt="" className={`benchmark-candidate-cover ${compact ? "is-compact" : ""}`} onError={() => setFailed(true)} />;
}

function RepresentativeContent({ candidates, selected, canStudy, action, onToggle, onClear, onStart }: { candidates: BenchmarkCandidateDTO[]; selected: string[]; canStudy: boolean; action: string; onToggle: (id: string) => void; onClear: () => void; onStart: (kind: "ACCOUNT_RESEARCH" | "PLAYBOOKS") => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "COLLECTED" | "TRANSCRIPT" | "DISTILLED">("ALL");
  const [candidateSort, setCandidateSort] = useState<"LATEST" | "OLDEST">("LATEST");
  const selectedCandidates = selected.flatMap((id) => { const candidate = candidates.find((item) => item.id === id); return candidate ? [candidate] : []; });
  const accountReady = selected.length > 0 && selectedCandidates.every((candidate) => candidate.ready);
  const playbookReady = selected.length >= 3 && selectedCandidates.every((candidate) => candidate.playbookReady);
  const missingPlaybookCount = selectedCandidates.filter((candidate) => !candidate.playbookReady).length;
  const busy = action === "study" || action === "playbooks";
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleCandidates = candidates.filter((candidate) => {
    if (normalizedQuery && !candidate.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery)) return false;
    if (filter === "COLLECTED") return Boolean(candidate.sourceItemId);
    if (filter === "TRANSCRIPT") return candidate.ready || candidate.playbookReady;
    if (filter === "DISTILLED") return candidate.playbookReady;
    return true;
  }).sort((left, right) => {
    const leftTime = Date.parse(left.publishedAt ?? left.observedAt);
    const rightTime = Date.parse(right.publishedAt ?? right.observedAt);
    return candidateSort === "LATEST" ? rightTime - leftTime : leftTime - rightTime;
  });
  const filters = [
    ["ALL", `全部 ${candidates.length}`],
    ["COLLECTED", `已收录 ${candidates.filter((candidate) => candidate.sourceItemId).length}`],
    ["TRANSCRIPT", `有文字稿 ${candidates.filter((candidate) => candidate.ready || candidate.playbookReady).length}`],
    ["DISTILLED", `已提炼 ${candidates.filter((candidate) => candidate.playbookReady).length}`],
  ] as const;

  return <section className="benchmark-research-workspace">
    <div className="benchmark-content-browser">
      <header className="benchmark-browser-heading"><div><h2>选择代表内容</h2><p>浏览这个博主的真实内容，选择能代表其风格与主题的样本。</p></div><span>{visibleCandidates.length} 条内容</span></header>
      <div className="benchmark-browser-tools">
        <label className="benchmark-candidate-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或主题" aria-label="搜索代表内容" /></label>
        <div className="benchmark-filter-pills" aria-label="内容状态筛选">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <select aria-label="代表内容排序" value={candidateSort} onChange={(event) => setCandidateSort(event.target.value as "LATEST" | "OLDEST")}><option value="LATEST">最新内容</option><option value="OLDEST">较早内容</option></select>
      </div>
      <div className="benchmark-candidate-scroll"><div className="benchmark-research-grid">{visibleCandidates.length ? visibleCandidates.map((candidate) => {
        const checked = selected.includes(candidate.id);
        const disabled = (!candidate.ready && !candidate.playbookReady) || (!checked && selected.length >= 10) || !canStudy;
        return <label key={candidate.id} className={`benchmark-research-candidate ${candidate.ready || candidate.playbookReady ? "is-ready" : "is-disabled"} ${checked ? "is-selected" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(candidate.id)} /><CandidateCover candidate={candidate} /><div className="benchmark-candidate-copy"><p>{candidate.title}</p><div>{candidate.ready ? <Badge className="text-[var(--success)]">已拆解</Badge> : <Badge>还没拆解</Badge>}{candidate.playbookReady ? <Badge className="text-[var(--success)]">已提炼</Badge> : <Badge>还没提炼</Badge>}{candidate.sourceItemId ? <Link href={`/library/${candidate.sourceItemId}`} onClick={(event) => event.stopPropagation()}>查看资料</Link> : <Link href="/library" onClick={(event) => event.stopPropagation()}>先收录</Link>}</div></div></label>;
      }) : <div className="benchmark-browser-empty">没有符合当前条件的内容。</div>}</div></div>
    </div>

    <aside className="benchmark-selection-rail">
      <header><div><p>已选代表内容</p><span>已选 {selectedCandidates.length} 条</span></div><button type="button" onClick={onClear} disabled={!selectedCandidates.length}>清空选择</button></header>
      <div className="benchmark-selection-list">{selectedCandidates.length ? selectedCandidates.map((candidate) => <article key={candidate.id}><CandidateCover candidate={candidate} compact /><div><p>{candidate.title}</p><span>{candidate.playbookReady ? "有文字稿 · 已提炼" : candidate.ready ? "有文字稿 · 已拆解" : "暂不可研究"}</span></div><button type="button" aria-label={`移除 ${candidate.title}`} onClick={() => onToggle(candidate.id)}><X size={15} /></button></article>) : <div className="benchmark-selection-empty"><p>还没有选择内容</p><span>从左侧选择 1–10 条代表内容。</span></div>}</div>
      <section className="benchmark-selection-summary"><p>为什么选这些？</p><span>这是你当前选择的 {selectedCandidates.length} 条内容，其中 {selectedCandidates.filter((candidate) => candidate.playbookReady).length} 条已完成精华提炼，{selectedCandidates.filter((candidate) => candidate.ready).length} 条可用于账号研究。</span></section>
      {!canStudy ? <p className="benchmark-rail-note">当前权限只能查看已有研究。</p> : null}
      <div className="benchmark-selection-actions"><Button disabled={!canStudy || !accountReady || busy} onClick={() => onStart("ACCOUNT_RESEARCH")}>{action === "study" ? <Loader2 size={15} className="animate-spin" /> : null} 研究这 {selected.length} 条内容</Button><details><summary><FlaskConical size={14} />实验性内容模式研究</summary><div><p>{missingPlaybookCount ? `还有 ${missingPlaybookCount} 条内容需要先完成精华提炼。` : selected.length > 0 && selected.length < 3 ? `再选择 ${3 - selected.length} 条已提炼内容后可以研究。` : "用于观察多条内容中重复出现的组合方式。"}</p><Button variant="secondary" disabled={!canStudy || !playbookReady || busy} onClick={() => onStart("PLAYBOOKS")}>{action === "playbooks" ? <Loader2 size={15} className="animate-spin" /> : null} 查看内容模式</Button></div></details></div>
    </aside>
  </section>;
}

function StudyHistory({ studies, action, onSave }: { studies: BenchmarkStudyDTO[]; action: string; onSave: (study: BenchmarkStudyDTO, index: number, content: MethodDraft) => Promise<boolean> }) {
  const [showAll, setShowAll] = useState(false);
  const visibleStudies = showAll ? studies : studies.slice(0, 3);
  return <section id="benchmark-study-history" className="benchmark-study-history"><div><h2 className="text-lg font-semibold">多样本研究结果</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">所有判断只描述这次选择的内容，每次研究及其当时采用的素材版本都会保留。</p></div>{studies.length ? <div className="benchmark-study-list">{visibleStudies.map((study) => <details key={study.id} className="benchmark-study-row" open={study.status === "PROCESSING"}><summary><div className="benchmark-study-summary"><div><Badge>{study.status === "COMPLETED" ? "已完成" : study.status === "PROCESSING" ? "正在研究" : "需要重试"}</Badge><Badge>{study.kind === "PLAYBOOKS" ? "组合打法" : study.kind === "CREATOR_PROFILE" ? "AI 账号画像" : "账号研究"}</Badge><span>第 {study.version} 次 · {study.sampleCount} 条代表内容</span>{study.kind === "ACCOUNT_RESEARCH" && study.insufficientSamples ? <Badge>样本不足</Badge> : null}</div><time>{new Date(study.createdAt).toLocaleString("zh-CN")}</time><ChevronDown size={17} /></div></summary><div className="benchmark-study-body">{study.status === "PROCESSING" ? <p className="text-sm text-[var(--text-secondary)]">{study.kind === "PLAYBOOKS" ? "正在比较这些内容经常一起使用哪些元素。你可以离开或刷新，完成后回来继续查看。" : study.kind === "CREATOR_PROFILE" ? "正在整理这个账号的内容画像。你可以离开或刷新，完成后回来查看。" : "正在比较已拆解的内容。你可以离开或刷新，完成后回来继续查看。"}</p> : study.status === "FAILED" ? <div className="text-sm"><p className="text-[var(--danger)]">{study.errorMessage || "这次研究没有完成，请重新选择代表内容再试。"}</p><p className="mt-1 text-[var(--text-secondary)]">之前完成的研究仍然保留。</p></div> : study.kind === "PLAYBOOKS" ? <PlaybookStudyOutput study={study} output={study.output && "kind" in study.output && study.output.kind === "PLAYBOOKS" ? study.output : null} /> : study.kind === "CREATOR_PROFILE" ? <p className="text-sm text-[var(--text-secondary)]">{study.output && "kind" in study.output && study.output.kind === "CREATOR_PROFILE" ? study.output.message : "账号画像已完成。"}</p> : study.output && !("kind" in study.output) ? <StudyOutput study={study} output={study.output} action={action} onSave={onSave} /> : null}<details className="mt-4 text-sm"><summary className="cursor-pointer text-[var(--accent)]">这次研究使用的内容（{study.sampleCount} 条）</summary><div className="mt-2 grid gap-1">{study.samples.map((sample) => <div key={sample.id} className="flex flex-wrap items-center gap-2"><Link href={`/library/${sample.sourceItemId}`} className="break-words text-[var(--accent)]">{sample.title}</Link>{sample.materialDistillationVersion ? <span className="text-xs text-[var(--text-secondary)]">采用第 {sample.materialDistillationVersion} 版精华提炼</span> : null}</div>)}</div></details></div></details>)}{studies.length > 3 ? <button type="button" className="benchmark-history-more" onClick={() => setShowAll((current) => !current)}>{showAll ? "收起较早结果" : `查看更早的 ${studies.length - 3} 条结果`}</button> : null}</div> : <Card className="mt-4 p-6 text-sm text-[var(--text-secondary)]">选择几条代表内容，比较单项做法，或看看哪些内容元素经常搭配出现。</Card>}</section>;
}

type MethodDraft = { title: string; steps: string[]; applicableScenarios: string[]; boundaries: string[] };

function PlaybookStudyOutput({ study, output }: { study: BenchmarkStudyDTO; output: BenchmarkPlaybookOutput | null }) {
  if (!output) return null;
  return <div className="mt-4 grid gap-4"><p className="text-sm leading-6">{output.message}</p>{output.playbooks.length ? <section><h3 className="font-medium">常见内容打法</h3><div className="mt-2 grid gap-3">{output.playbooks.map((playbook) => <article key={playbook.name} className="min-w-0 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{playbook.name}</p><Badge>{playbook.maturity === "STABLE" ? "比较稳定" : "继续观察"}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">本次选择了 {study.sampleCount} 条内容，其中 {playbook.supportSampleIds.length} 条共同使用这套搭配。</p><div className="mt-4 grid gap-3 text-sm"><MethodList title="这套组合由什么组成" items={playbook.elements} /><PlaybookField title="通常怎么连起来使用" value={playbook.flow} /><PlaybookField title="适合解决什么内容问题" value={playbook.useCase} /><PlaybookField title="有哪些例外" value={playbook.exceptions} /><PlaybookField title="不要照搬什么" value={playbook.doNotCopy} /></div><details className="mt-4 text-xs"><summary className="cursor-pointer text-[var(--accent)]">查看依据</summary><div className="mt-2 grid gap-3"><div><p className="font-medium">支持这套判断的视频</p><SampleLinks study={study} ids={playbook.supportSampleIds} /></div>{playbook.exceptionSampleIds.length ? <div><p className="font-medium">没有采用完整搭配的视频</p><SampleLinks study={study} ids={playbook.exceptionSampleIds} /></div> : null}<p className="text-[var(--text-secondary)]">每条依据都锁定了当时使用的精华提炼版本，后续重新提炼不会改写本次研究。</p></div></details></article>)}</div></section> : <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">目前还没有发现足够稳定的组合打法。可以更换代表内容后再次研究。</p>}</div>;
}

function PlaybookField({ title, value }: { title: string; value: string }) { return <section><h4 className="text-xs font-medium text-[var(--text-secondary)]">{title}</h4><p className="mt-1 leading-6">{value}</p></section>; }

function StudyOutput({ study, output, action, onSave }: { study: BenchmarkStudyDTO; output: BenchmarkAnalysisOutput; action: string; onSave: (study: BenchmarkStudyDTO, index: number, content: MethodDraft) => Promise<boolean> }) {
  const groups = [["常见选题方向", output.topicDirections], ["常用开头方式", output.openingPatterns], ["常见内容结构", output.structures], ["常用说服方式", output.persuasionMethods], ["常见表达习惯", output.expressionHabits], ["常见收尾方式", output.endings]] as const;
  return <div className="mt-4 grid gap-5"><p className="text-sm leading-6">{output.message || (output.stableMethodsFound ? "这次研究找到了几项可复用的方法。" : "这些内容的做法比较分散，没有发现足够稳定的共同方法。")}</p>{study.insufficientSamples ? <p className="rounded-lg border border-[var(--warning)] p-3 text-sm text-[var(--warning)]">本次只有 {study.sampleCount} 条样本，可以先查看共同点；增加更多代表内容后再形成账号方法集。</p> : null}<div className="grid gap-4 md:grid-cols-2">{groups.map(([name, findings]) => findings.length ? <section key={name}><h3 className="font-medium">{name}</h3><ul className="mt-2 grid gap-2">{findings.map((finding) => <li key={finding.name} className="min-w-0 rounded-lg bg-[var(--surface-elevated)] p-3 text-sm"><p className="font-medium">{finding.name}</p><p className="mt-1 leading-5">{finding.summary}</p><p className="mt-2 text-xs text-[var(--text-secondary)]">本次选择了 {study.sampleCount} 条内容，其中 {finding.occurrenceSampleIds.length} 条出现这种做法；{finding.exceptionSampleIds.length} 条是例外。</p><FindingDetails study={study} finding={finding} /></li>)}</ul></section> : null)}</div>{output.commonMethods.length ? <section><h3 className="font-medium">可以保存的方法</h3><div className="mt-2 grid gap-3">{output.commonMethods.map((method, index) => <BenchmarkMethodCard key={`${method.title}-${index}`} study={study} index={index} method={method} busy={Boolean(action)} saving={action === `save:${study.id}:${index}`} onSave={onSave} />)}</div></section> : !output.stableMethodsFound ? <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">没有发现足够稳定的共同方法。上面的样本比较和不同做法仍可查看。</p> : null}{output.exceptions.length ? <section><h3 className="font-medium">例外和不同做法</h3><div className="mt-2 grid gap-2">{output.exceptions.map((finding) => <article key={`${finding.name}-${finding.summary}`} className="rounded-lg border p-3 text-sm"><p className="font-medium">{finding.name}</p><p className="mt-1 leading-5">{finding.summary}</p><FindingDetails study={study} finding={finding} /></article>)}</div></section> : null}{output.repeatedCaseNotes.length ? <section><h3 className="font-medium">重复案例说明</h3><div className="mt-2 grid gap-2">{output.repeatedCaseNotes.map((note) => <article key={note.summary} className="rounded-lg border p-3 text-sm"><p>{note.summary}</p><SampleLinks study={study} ids={note.sampleIds} /><EvidenceDetails study={study} evidence={note.evidence} /></article>)}</div></section> : null}</div>;
}

function FindingDetails({ study, finding }: { study: BenchmarkStudyDTO; finding: BenchmarkAnalysisOutput["topicDirections"][number] }) { return <details className="mt-3 text-xs"><summary className="cursor-pointer text-[var(--accent)]">查看样本依据</summary><div className="mt-2 grid gap-3"><div><p className="font-medium">出现这种做法</p><SampleLinks study={study} ids={finding.occurrenceSampleIds} /></div>{finding.exceptionSampleIds.length ? <div><p className="font-medium">例外样本</p><SampleLinks study={study} ids={finding.exceptionSampleIds} /></div> : null}<EvidenceDetails study={study} evidence={finding.evidence} /></div></details>; }

function SampleLinks({ study, ids }: { study: BenchmarkStudyDTO; ids: string[] }) { return <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => { const sample = study.samples.find((item) => item.id === id); return sample ? <Link key={id} href={`/library/${sample.sourceItemId}`} className="break-words text-[var(--accent)]">{sample.title}</Link> : null; })}</div>; }

function EvidenceDetails({ study, evidence }: { study: BenchmarkStudyDTO; evidence: Array<{ sampleId: string; quote: string }> }) { return <div className="grid gap-2">{evidence.map((item, index) => { const sample = study.samples.find((value) => value.id === item.sampleId); return <blockquote key={`${item.sampleId}-${item.quote}-${index}`} className="min-w-0 rounded-lg bg-[var(--surface-elevated)] p-3"><p className="break-words">{item.quote}</p>{sample ? <cite className="mt-1 block not-italic text-[var(--text-secondary)]">来自：<Link href={`/library/${sample.sourceItemId}`} className="text-[var(--accent)]">{sample.title}</Link></cite> : null}</blockquote>; })}</div>; }

function BenchmarkMethodCard({ study, index, method, busy, saving, onSave }: { study: BenchmarkStudyDTO; index: number; method: BenchmarkAnalysisOutput["commonMethods"][number]; busy: boolean; saving: boolean; onSave: (study: BenchmarkStudyDTO, index: number, content: MethodDraft) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState(method.title);
  const [steps, setSteps] = useState(list(method.howTo).join("\n"));
  const [applicable, setApplicable] = useState(list(method.applicable).join("\n"));
  const [boundaries, setBoundaries] = useState(list(method.boundaries).join("\n"));
  const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  async function save() { if (await onSave(study, index, { title, steps: lines(steps), applicableScenarios: lines(applicable), boundaries: lines(boundaries) })) { setSaved(true); setEditing(false); } }
  return <article className="min-w-0 rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{method.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">本次选择了 {study.sampleCount} 条内容，其中 {method.occurrenceSampleIds.length} 条出现这种做法；{method.exceptionSampleIds.length} 条是例外。</p></div>{saved ? <span className="text-sm text-[var(--success)]">已保存为创作方法</span> : !editing ? <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}><BookmarkPlus size={14} /> 保存为创作方法</Button> : null}</div><div className="mt-3 grid gap-3 text-sm"><MethodList title="怎么用" items={list(method.howTo)} /><MethodList title="适合什么时候用" items={list(method.applicable)} /><MethodList title="什么时候不太适合" items={list(method.boundaries)} /></div><FindingDetails study={study} finding={{ name: method.title, summary: list(method.howTo).join("；"), occurrenceSampleIds: method.occurrenceSampleIds, exceptionSampleIds: method.exceptionSampleIds, evidence: method.evidence }} />{editing ? <div className="mt-4 grid gap-3 rounded-xl bg-[var(--surface-elevated)] p-4"><p className="font-medium">确认和修改创作方法</p><label className="grid gap-1 text-sm">创作方法名称<input aria-label="创作方法名称" value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-[var(--surface)] px-3" /></label><MethodField label="怎么用" value={steps} onChange={setSteps} /><MethodField label="适合什么时候用" value={applicable} onChange={setApplicable} /><MethodField label="什么时候不太适合" value={boundaries} onChange={setBoundaries} /><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void save()}>{saving ? <Loader2 size={14} className="animate-spin" /> : null} 保存创作方法</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>取消</Button></div></div> : null}</article>;
}

function MethodList({ title, items }: { title: string; items: string[] }) { return <section><h4 className="text-xs font-medium text-[var(--text-secondary)]">{title}</h4><ul className="mt-1 list-disc space-y-1 pl-5 leading-6">{items.map((item) => <li key={item}>{item}</li>)}</ul></section>; }
function MethodField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-sm">{label}<textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-20 min-w-0 rounded-lg border bg-[var(--surface)] p-3" /></label>; }
