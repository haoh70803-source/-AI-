/* finesse · register=product · shell=floating-research-canvas · palette=cool-slate-cobalt · density=7 */
"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { BookOpenCheck, BookmarkCheck, ChevronDown, ChevronRight, CircleAlert, Clapperboard, Compass, ExternalLink, FileSearch, FileText, Lightbulb, ListTree, Loader2, Play, Quote, Sparkles, UserRound, Video, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BenchmarkCreatorDetailDTO } from "@/server/discovery/benchmark-creator-read-model";
import { BenchmarkTopicGenerator } from "./benchmark-topic-generator";

export type BenchmarkView = "OVERVIEW" | "CONTENT" | "METHOD" | "LEARN" | "RESEARCH";
type Highlight = BenchmarkCreatorDetailDTO["highlights"][number];
type Source = BenchmarkCreatorDetailDTO["representativeSources"][number];

const platformLabel: Record<string, string> = { DOUYIN: "抖音", XIAOHONGSHU: "小红书" };
const qualityLabel: Record<Highlight["quality"], string> = { WORTH_KEEPING: "值得留下", OBSERVE: "先观察", CASE_ONLY: "案例参考", DO_NOT_KEEP: "暂不沉淀" };
const methodStatus: Record<BenchmarkCreatorDetailDTO["savedMethods"][number]["status"], string> = { SAVED: "已收藏", TRIAL: "试用中", CORE: "常用", DISABLED: "已停用" };
const creatorProfileLabel = {
  PROFILE: "他大概是一个什么类型的博主",
  CONTENT_MIX: "他最近主要在拍什么",
  TOPIC_STYLE: "他经常怎么选题",
  CONTENT_STYLE: "他通常怎么讲、怎么证明",
  RECURRING_VIEWPOINT: "他反复在讲什么",
  LEARN: "我们可以学什么",
  AVOID: "哪些不要直接照搬",
  POSITIONING: "主要讲什么",
  AUDIENCE: "主要面向谁",
  THEME: "高频主题",
  TOPIC_PATTERN: "选题特点",
  VIDEO_STYLE: "内容特色",
  EVIDENCE_STYLE: "如何建立说服力",
  ATTENTION_TRUST: "关注与信任特征",
  // V1 history remains readable with its original employee-facing labels.
  METHOD_TENDENCY: "目前观察到的内容方法",
} as const;
const creatorProfileStatus = { CLEAR: "比较明确", OBSERVE: "目前观察到" } as const;

function Empty({ children, compact = false }: { children: string; compact?: boolean }) {
  return <div className={`benchmark-empty ${compact ? "benchmark-empty-compact" : ""}`}>{children}</div>;
}

function MediaThumb({ source, className = "" }: { source: Pick<Source, "coverUrl" | "title">; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [source.coverUrl]);
  if (!source.coverUrl || failed) return <div aria-hidden="true" className={`benchmark-media-fallback ${className}`}><span className="benchmark-media-fallback-mark"><Video size={18} /><b>{source.title.trim().slice(0, 1) || "影"}</b></span><span>暂无封面</span></div>;
  return <img ref={imageRef} src={source.coverUrl} alt="" className={className} onError={() => setFailed(true)} />;
}

export function WorkspaceTabs({ value, onChange }: { value: BenchmarkView; onChange: (value: BenchmarkView) => void }) {
  const items: Array<[BenchmarkView, string]> = [["OVERVIEW", "研究洞察"], ["CONTENT", "代表内容"], ["METHOD", "怎么做内容"], ["LEARN", "我们能学什么"]];
  return <div className="benchmark-tabs" role="tablist" aria-label="博主详情视图">{items.map(([id, label]) => <button key={id} type="button" role="tab" aria-label={id === "OVERVIEW" ? "研究洞察（概览）" : label} aria-selected={value === id} className="benchmark-tab" onClick={() => onChange(id)}>{label}</button>)}</div>;
}

export function BenchmarkCreatorHeader({ profile, onExploreTopics }: { profile: BenchmarkCreatorDetailDTO; onExploreTopics: () => void }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const schemaVersion = profile.creatorProfile?.schemaVersion.match(/-v(\d)$/)?.[1];
  const stats = [
    { label: "已研究内容", value: profile.stats.studied, detail: "条", icon: <BookOpenCheck size={18} /> },
    { label: "当前画像版本", value: schemaVersion ? `V${schemaVersion}` : "暂无", detail: profile.creatorProfile ? `第 ${profile.creatorProfile.version} 次研究` : "暂无画像", icon: <Sparkles size={18} /> },
    { label: "代表内容", value: profile.representativeSources.length, detail: "条", icon: <Clapperboard size={18} /> },
  ] as const;
  return <Card className="benchmark-profile-header benchmark-glass overflow-hidden border-0">
    <div className="benchmark-header-main">
      <div className="benchmark-header-identity">
        {profile.account.avatarUrl && !avatarFailed ? <img src={profile.account.avatarUrl} alt={`${profile.account.name}头像`} className="benchmark-avatar" onError={() => setAvatarFailed(true)} /> : <div aria-hidden="true" className="benchmark-avatar benchmark-avatar-fallback">{profile.account.name.slice(0, 1)}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="benchmark-profile-title">{profile.account.name}</h1><Badge>{platformLabel[profile.account.platform] ?? profile.account.platform}</Badge></div>
          {profile.account.bio ? <p className="benchmark-profile-bio">{profile.account.bio}</p> : null}
          {profile.account.tags.length ? <div className="benchmark-tag-row">{profile.account.tags.map((tag) => <span key={tag} className="benchmark-tag">{tag}</span>)}</div> : null}
        </div>
      </div>
      <div className="benchmark-header-action"><p>基于当前真实研究结果</p><Button onClick={onExploreTopics}><Lightbulb size={17} />看看我们能做什么题<ChevronRight size={16} /></Button><span>外部内容仅用于研究和启发。</span></div>
    </div>
    <div className="benchmark-stats-grid">{stats.map((stat) => <div key={stat.label} className="benchmark-stat-tile"><span className="benchmark-stat-icon">{stat.icon}</span><div className="min-w-0"><p className="benchmark-stat-label">{stat.label}</p><p className="benchmark-stat-value">{stat.value} <small>{stat.detail}</small></p></div></div>)}</div>
  </Card>;
}

function compactLines(text: string | undefined, max = 3) {
  if (!text) return [];
  const lines = text.split(/\n+/).map((line) => line.replace(/^[•·\-\s]+/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines.slice(0, max);
  return (lines[0]?.match(/[^。！？；]+[。！？；]?/g) ?? []).map((line) => line.trim()).filter(Boolean).slice(0, max);
}

function sectionLines(profile: BenchmarkCreatorDetailDTO, codes: string[], max = 3) {
  const section = profile.creatorProfile?.sections.find(({ code }) => codes.includes(code));
  return compactLines(section?.text, max);
}

function sectionStatus(profile: BenchmarkCreatorDetailDTO, codes: string[]) {
  const status = profile.creatorProfile?.sections.find(({ code }) => codes.includes(code))?.status;
  return status ? creatorProfileStatus[status] : null;
}

function researchLines(profile: BenchmarkCreatorDetailDTO, title: string, max = 3) {
  return profile.accountResearch?.groups.find((group) => group.title === title)?.items.slice(0, max).map((item) => item.name) ?? [];
}

function InsightCard({ icon, title, label, status, lines }: { icon: ReactNode; title: string; label: string; status?: string | null; lines: string[] }) {
  return <article className="benchmark-insight-card"><header><span>{icon}</span><div><h3>{title}</h3><small>{label}{status ? ` · ${status}` : ""}</small></div></header>{lines.length ? <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="benchmark-insight-empty">当前还没有足够的研究结果。</p>}</article>;
}

function PreviewHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="benchmark-section-heading"><div className="min-w-0"><div className="flex items-center gap-2"><span className="benchmark-section-dot" aria-hidden="true" /><h2>{title}</h2></div><p>{description}</p></div>{action}</div>;
}

export function CollapsibleSection({ title, summary, children }: { title: string; summary: string; children?: ReactNode }) {
  return <details className="benchmark-accordion benchmark-glass group"><summary><span className="benchmark-accordion-icon" aria-hidden="true"><FileText size={16} /></span><span className="benchmark-accordion-copy"><b>{title}</b><span>{summary}</span></span><ChevronDown size={17} className="benchmark-accordion-chevron" /></summary>{children ? <div className="benchmark-accordion-content">{children}</div> : null}</details>;
}

export function DetailDrawer({ highlight, source, onClose }: { highlight: Highlight | null; source: Source | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!highlight) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKey); };
  }, [highlight, onClose]);
  if (!highlight) return null;
  return <div className="benchmark-drawer-layer" data-testid="highlight-drawer">
    <button type="button" aria-label="关闭详情" className="benchmark-drawer-backdrop" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-labelledby="highlight-drawer-title" className="benchmark-drawer-panel">
      <header className="benchmark-drawer-header"><div><p>观点详情</p><span>来自真实资料与现有精华提炼</span></div><button ref={closeRef} type="button" aria-label="关闭观点详情" onClick={onClose} className="benchmark-drawer-close"><X size={19} /></button></header>
      <div className="benchmark-drawer-body">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="highlight-drawer-title" className="min-w-0 flex-1 text-xl font-semibold [overflow-wrap:anywhere]">{highlight.title}</h2><Badge>{qualityLabel[highlight.quality]}</Badge></div>
        <div className="benchmark-drawer-explanation"><Quote size={18} aria-hidden="true" /><p>{highlight.explanation}</p></div>
        <section className="benchmark-drawer-group"><h3>来源视频</h3>{source ? <Link href={`/library/${source.id}`} className="benchmark-drawer-source"><MediaThumb source={source} className="aspect-video h-full w-28 rounded-xl object-cover" /><div className="min-w-0"><p className="line-clamp-3 text-sm font-medium">{source.title}</p><p className="mt-2 text-xs text-[var(--text-secondary)]">{source.hasTranscript ? "有文字稿" : "还没有文字稿"} · {source.hasDistillation ? "已有精华" : "还没有精华"}</p></div></Link> : null}</section>
        <details className="benchmark-evidence-block"><summary>查看依据<ChevronDown size={15} /></summary><p>这条精华来自上方视频。完整原文与对应依据保留在资料详情中。</p></details>
        <div className="benchmark-drawer-actions"><Link href={`/library/${highlight.sourceItemId}`} className="benchmark-drawer-primary">查看完整资料<ExternalLink size={15} /></Link></div>
      </div>
    </aside>
  </div>;
}

function SourcePreviewCard({ source }: { source: Source }) {
  return <Link href={`/library/${source.id}`} className="benchmark-content-card group"><div className="benchmark-content-cover"><MediaThumb source={source} className="aspect-video w-full object-cover" /><span className="benchmark-content-play" aria-hidden="true"><Play size={16} fill="currentColor" /></span></div><div className="p-3"><h3 className="line-clamp-2 min-h-10 text-sm font-medium">{source.title}</h3><div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]"><span>{source.hasTranscript ? "有文字稿" : "还没有文字稿"}</span>{source.hasDistillation ? <span className="text-[var(--success)]">已有精华</span> : null}<span className="ml-auto text-[var(--accent)]">查看资料</span></div></div></Link>;
}

function AccountResearchSummary({ profile }: { profile: BenchmarkCreatorDetailDTO }) {
  if (!profile.accountResearch) return <p className="text-sm text-[var(--text-secondary)]">还没有完成账号层研究。</p>;
  return <div className="grid gap-4 md:grid-cols-2">{profile.accountResearch.groups.map((group) => <section key={group.title}><h3 className="font-medium">{group.title}</h3><div className="mt-2 space-y-2">{group.items.slice(0, 3).map((item) => <article key={`${group.title}-${item.name}`} className="rounded-xl bg-white/50 p-3"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.summary}</p>{item.sources.length ? <div className="mt-2 flex flex-wrap gap-2">{item.sources.map((source) => <Link key={source.id} href={`/library/${source.id}`} className="text-xs text-[var(--accent)]">{source.title}</Link>)}</div> : null}</article>)}</div></section>)}</div>;
}

function AICreatorProfile({ profile, selectedCount, canGenerate, busy, onShowResearch, onGenerate }: { profile: BenchmarkCreatorDetailDTO; selectedCount: number; canGenerate: boolean; busy: boolean; onShowResearch: () => void; onGenerate: () => void }) {
  const result = profile.creatorProfile;
  const selectionReady = selectedCount >= 5 && selectedCount <= 10 && canGenerate;
  const action = selectionReady ? <Button variant="secondary" disabled={!canGenerate || busy} onClick={onGenerate}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{result ? "更新画像" : "生成账号画像"}</Button> : <Button variant="secondary" onClick={onShowResearch}>选择代表内容</Button>;
  const methodCards = [
    { title: "选题方法", label: creatorProfileLabel.TOPIC_STYLE, icon: <Compass size={18} />, lines: sectionLines(profile, ["TOPIC_STYLE"], 3) },
    { title: "开头方法", label: "视频怎么写", icon: <Play size={18} />, lines: researchLines(profile, "常用开头", 3).length ? researchLines(profile, "常用开头", 3) : profile.copywriting.slice(0, 3).map((item) => item.opening) },
    { title: "正文展开", label: creatorProfileLabel.CONTENT_STYLE, icon: <ListTree size={18} />, lines: sectionLines(profile, ["CONTENT_STYLE"], 3) },
    { title: "依据使用", label: "如何建立说服力", icon: <FileSearch size={18} />, lines: researchLines(profile, "论据与说服", 3) },
    { title: "收尾方式", label: "怎么结束一条内容", icon: <FileText size={18} />, lines: researchLines(profile, "常见收尾", 3) },
  ].filter((card) => card.lines.length);
  return <section className="benchmark-section benchmark-glass" data-testid="ai-creator-profile" aria-label="AI 账号画像"><PreviewHeading title="这位博主怎么做内容" description="只展示当前有效研究中的选题、开头、展开、依据和收尾方法。" action={action} />
    {!selectionReady ? <p className="mt-3 text-xs text-[var(--text-secondary)]">先选择至少 5 条已经完成精华提炼的代表内容，才可以更新当前画像。</p> : null}
    {result && methodCards.length ? <div className="benchmark-method-grid">{methodCards.map((card) => <InsightCard key={card.title} {...card} />)}</div> : <div className="mt-3"><Empty compact>{result ? "当前研究内容还不足以判断。" : "还没有生成账号画像。选择 5 至 10 条代表内容后，可以在这里形成有来源的账号观察。"}</Empty></div>}
  </section>;
}

export function BenchmarkCreatorProfile({ profile, onShowContent, onShowResearch, canGenerateTopics }: { profile: BenchmarkCreatorDetailDTO; onShowContent: () => void; onShowResearch: () => void; canGenerateTopics: boolean }) {
  const [selected, setSelected] = useState<Highlight | null>(null);
  const selectedSource = selected ? profile.representativeSources.find(({ id }) => id === selected.sourceItemId) ?? null : null;
  const previews = profile.representativeSources.slice(0, 4);
  const highlights = profile.highlights.slice(0, 3);
  if (!profile.creatorProfile) return <div data-testid="benchmark-profile-view" role="tabpanel" className="benchmark-profile-stack"><section className="benchmark-section benchmark-glass"><PreviewHeading title="研究洞察" description="当前还没有足够的研究结果。" action={<Button variant="secondary" onClick={onShowResearch}>继续研究</Button>} /><div className="mt-4"><Empty compact>先选择有真实文字稿和研究结果的代表内容，再生成当前画像。</Empty></div></section><section className="benchmark-section benchmark-glass benchmark-representative-section"><PreviewHeading title="代表内容" description="这些内容能体现这个博主的选题方式、表达风格和方法特点。" action={previews.length ? <button type="button" onClick={onShowContent} className="benchmark-text-action">查看全部<ChevronRight size={16} /></button> : <button type="button" onClick={onShowResearch} className="benchmark-text-action">选择代表内容<ChevronRight size={16} /></button>} />{previews.length ? <div className="benchmark-preview-grid">{previews.map((source) => <SourcePreviewCard key={source.id} source={source} />)}</div> : <div className="mt-4"><Empty compact>还没有选出代表内容。</Empty></div>}</section></div>;
  const topicLines = sectionLines(profile, ["TOPIC_STYLE"]);
  const openingLines = researchLines(profile, "常用开头", 3).length ? researchLines(profile, "常用开头", 3) : profile.copywriting.slice(0, 3).map((item) => item.opening);
  const structureLines = [...sectionLines(profile, ["CONTENT_STYLE"], 2), ...researchLines(profile, "常见收尾", 1)].slice(0, 3);
  const learnLines = sectionLines(profile, ["LEARN"], 2);
  const avoidLines = sectionLines(profile, ["AVOID"], 2);
  return <div data-testid="benchmark-profile-view" role="tabpanel" className="benchmark-profile-stack">
    <section className="benchmark-section benchmark-glass benchmark-insights-section"><PreviewHeading title="研究洞察" description="用当前有效画像快速看懂这个博主主要讲什么，以及内容通常怎样展开。" /><div className="benchmark-insight-grid"><InsightCard icon={<UserRound size={19} />} title="他主要讲什么" label="内容定位" status={sectionStatus(profile, ["PROFILE", "CONTENT_MIX"])} lines={sectionLines(profile, ["PROFILE", "CONTENT_MIX"], 3)} /><InsightCard icon={<Compass size={19} />} title="他常怎么选题" label="选题思路" status={sectionStatus(profile, ["TOPIC_STYLE"])} lines={topicLines} /><InsightCard icon={<Play size={19} />} title="他常怎么开头" label="开头套路" lines={openingLines} /><InsightCard icon={<ListTree size={19} />} title="他怎么展开 / 收尾" label="结构方法" status={sectionStatus(profile, ["CONTENT_STYLE"])} lines={structureLines} /></div></section>

    <section className="benchmark-learning-overview"><article className="benchmark-learning-preview is-learn"><header><span><Lightbulb size={19} /></span><div><h2>我们可以借鉴什么</h2><small>可借鉴</small></div></header>{learnLines.length ? <ul>{learnLines.map((line) => <li key={line}>{line}</li>)}</ul> : <p>当前研究还没有形成稳定的可学习项。</p>}</article><article className="benchmark-learning-preview is-avoid"><header><span><CircleAlert size={19} /></span><div><h2>不要直接照搬什么</h2><small>需注意</small></div></header>{avoidLines.length ? <ul>{avoidLines.map((line) => <li key={line}>{line}</li>)}</ul> : <p>对方客户、数字、经历、独特原句和验证结果不能变成我们的事实。</p>}</article><section id="benchmark-topic-entry" className="benchmark-topic-conversion"><span><Lightbulb size={21} /></span><div><h2>找到适合我们的创作切入点</h2><p>基于这个博主的稳定内容特点，结合我们的创作上下文生成选题。</p></div><BenchmarkTopicGenerator sourceType="CREATOR_PROFILE" sourceId={profile.account.id} available={canGenerateTopics} buttonLabel="看看我们能做什么题" unavailableMessage="当前还没有足够的博主研究结果。" /></section></section>

    <details className="benchmark-accordion benchmark-glass benchmark-highlight-disclosure"><summary><span className="benchmark-accordion-icon" aria-hidden="true"><BookmarkCheck size={16} /></span><span className="benchmark-accordion-copy"><b>观点与精华</b><span>查看来自真实资料的单条研究结果</span></span><ChevronDown size={17} className="benchmark-accordion-chevron" /></summary><div className="benchmark-accordion-content">{highlights.length ? <div className="benchmark-highlight-grid">{highlights.map((highlight, index) => <button key={`${highlight.sourceItemId}-${highlight.title}-${index}`} type="button" className="benchmark-highlight-card" data-selected={selected === highlight ? "true" : "false"} onClick={() => setSelected(highlight)}><h3>{highlight.title}</h3><p>{highlight.explanation}</p><div className="benchmark-highlight-meta"><span className="line-clamp-1">{highlight.sourceTitle}</span><span className="benchmark-quality">{qualityLabel[highlight.quality]}</span></div></button>)}</div> : <Empty compact>这些内容还没有完成精华提炼。</Empty>}</div></details>

    <section className="benchmark-section benchmark-glass benchmark-representative-section"><PreviewHeading title="代表内容" description="这些内容能体现这个博主的选题方式、表达风格和方法特点。" action={profile.representativeSources.length > 4 ? <button type="button" onClick={onShowContent} className="benchmark-text-action">查看全部<ChevronRight size={16} /></button> : !previews.length ? <button type="button" onClick={onShowResearch} className="benchmark-text-action">选择代表内容<ChevronRight size={16} /></button> : null} />{previews.length ? <div className="benchmark-preview-grid">{previews.map((source) => <SourcePreviewCard key={source.id} source={source} />)}</div> : <div className="mt-4"><Empty compact>还没有选出代表内容。</Empty></div>}</section>
    <DetailDrawer highlight={selected} source={selectedSource} onClose={() => setSelected(null)} />
  </div>;
}

export function BenchmarkCreatorMethod({ profile, selectedProfileCount, canGenerateProfile, profileBusy, onShowResearch, onGenerateProfile }: { profile: BenchmarkCreatorDetailDTO; selectedProfileCount: number; canGenerateProfile: boolean; profileBusy: boolean; onShowResearch: () => void; onGenerateProfile: () => void }) {
  return <div data-testid="benchmark-method-view" role="tabpanel" className="benchmark-profile-stack"><AICreatorProfile profile={profile} selectedCount={selectedProfileCount} canGenerate={canGenerateProfile} busy={profileBusy} onShowResearch={onShowResearch} onGenerate={onGenerateProfile} />{profile.copywriting.length ? <CollapsibleSection title="视频怎么写" summary={`已有 ${profile.copywriting.length} 条文案拆解`}><div className="grid gap-3 md:grid-cols-2">{profile.copywriting.slice(0, 4).map((item) => <article key={item.sourceItemId} className="benchmark-copywriting-card"><FileText size={18} /><div className="min-w-0"><h3>{item.sourceTitle}</h3><p>{item.core}</p><Link href={`/library/${item.sourceItemId}`}>查看文案拆解</Link></div></article>)}</div></CollapsibleSection> : null}<CollapsibleSection title="账号研究摘要" summary={profile.accountResearch ? `已比较 ${profile.accountResearch.sampleCount} 条代表内容` : "还没有完成账号层研究"}><AccountResearchSummary profile={profile} /></CollapsibleSection><CollapsibleSection title="常见内容组合" summary={profile.playbooks.length ? `已有 ${profile.playbooks.length} 套正式结果` : "暂时还没有形成可靠判断"}>{profile.playbooks.length ? <div className="space-y-3">{profile.playbooks.map((playbook) => <article key={playbook.name} className="rounded-xl bg-white/50 p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{playbook.name}</p><Badge>{playbook.maturity === "STABLE" ? "比较稳定" : "继续观察"}</Badge></div><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{playbook.flow}</p></article>)}</div> : <p className="text-sm text-[var(--text-secondary)]">没有稳定结果也不会强行生成。</p>}</CollapsibleSection></div>;
}

export function BenchmarkCreatorLearn({ profile, canGenerate }: { profile: BenchmarkCreatorDetailDTO; canGenerate: boolean }) {
  const learn = profile.creatorProfile?.sections.filter((section) => section.code === "LEARN") ?? [];
  const avoid = profile.creatorProfile?.sections.filter((section) => section.code === "AVOID") ?? [];
  const learnLines = compactLines(learn[0]?.text, 3);
  const avoidLines = compactLines(avoid[0]?.text, 3);
  return <div data-testid="benchmark-learn-view" role="tabpanel" className="benchmark-profile-stack"><section className="benchmark-section benchmark-glass"><PreviewHeading title="我们能学什么" description="把对方的方法拆成可以借鉴、结合自己再用和不要照搬三类。" /><div className="benchmark-learning-grid"><article className="is-learn"><h3>可以借鉴</h3>{learnLines.length ? <ul>{learnLines.map((line) => <li key={line}>{line}</li>)}</ul> : <p>当前研究还没有形成稳定的可学习项。</p>}</article><article className="is-adapt"><h3>结合自己再用</h3><ul><li>学习选题切口和开头节奏</li><li>换成鑫世界自己的观点与事实</li><li>缺少案例时保留为假设或待补依据</li></ul></article><article className="is-avoid"><h3>不要照搬</h3>{avoidLines.length ? <ul>{avoidLines.map((line) => <li key={line}>{line}</li>)}</ul> : <p>对方客户、数字、经历、独特原句和验证结果不能变成我们的事实。</p>}</article></div></section><section id="benchmark-topic-entry" className="benchmark-section benchmark-glass benchmark-topic-entry"><div><h2>把启发变成我们的选题</h2><p>外部内容只提供角度，候选会结合我们的创作上下文和事实边界。</p></div><BenchmarkTopicGenerator sourceType="CREATOR_PROFILE" sourceId={profile.account.id} available={canGenerate} buttonLabel="看看我们能做什么题" unavailableMessage="当前还没有足够的博主研究结果。" /></section><CollapsibleSection title="我们已经留下了什么" summary={profile.savedMethods.length ? `已保存 ${profile.savedMethods.length} 个创作方法` : "还没有从这里保存创作方法"}>{profile.savedMethods.length ? <div className="space-y-2">{profile.savedMethods.slice(0, 5).map((method) => <Link key={method.id} href={`/library/methods/${method.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-white/50 px-3"><span className="font-medium">{method.title}</span><span className="text-sm text-[var(--text-secondary)]">{methodStatus[method.status]}</span></Link>)}</div> : <p className="text-sm text-[var(--text-secondary)]">还没有从这个博主的内容中保存创作方法。</p>}</CollapsibleSection></div>;
}

export function BenchmarkCreatorContent({ profile }: { profile: BenchmarkCreatorDetailDTO }) {
  return <div data-testid="benchmark-content-view" role="tabpanel" className="benchmark-section benchmark-glass"><PreviewHeading title="这个博主的内容" description={`已收录 ${profile.representativeSources.length} 条内容，继续进入资料详情查看文字稿和研究结果。`} />{profile.representativeSources.length ? <div className="benchmark-content-grid">{profile.representativeSources.map((source) => <SourcePreviewCard key={source.id} source={source} />)}</div> : <div className="mt-5"><Empty>还没有收录这个博主的代表内容。</Empty></div>}</div>;
}
