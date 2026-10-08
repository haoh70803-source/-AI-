"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { ArrowRight, BookOpenCheck, Lightbulb, MessageCircle, MoreHorizontal, PenLine, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type Tab = "研究成果" | "去创作" | "更多";
const tabs: Tab[] = ["研究成果", "去创作", "更多"];
type RecommendedAction = { key: string; title: string; description: string; target: "transcript" | "research" | "confirm" | "creation" | "metadata" | "project" | "methods" };
type WorkflowContext = {
  currentProjects: Array<{ id: string; title: string; status?: string; updatedAt?: string }>;
  relatedTopics: Array<{ id: string; title: string; status: string; projectId: string | null; updatedAt: string }>;
  topicState: "AVAILABLE" | "LINKED" | "UNAVAILABLE";
  assistantHandoffAvailable: boolean;
  methodState: { analysisCandidates: Array<{ title: string }>; distillationCandidates: Array<{ title: string }>; suggestions: Array<{ id: string; title: string; status: string; sampleCount: number }>; saved: Array<{ id: string; title: string; status: string; version: number; source: string }> };
  tagState: { current: Array<{ id: string; name: string }>; availableCount: number };
  collectionState: { current: Array<{ id: string; name: string }>; availableCount: number };
  metadata: { state: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"; missing: string[] };
  pendingEvidenceCount: number;
  sourceBoundary: string;
};

export function MaterialWorkspace({ saved, transcribed, organized, inProject, distilled, topicCount, transcriptionState, contentLabel = "文字稿", organize, information, creation, processing, recommendedAction, workflowContext, variant = "full" }: {
  saved: boolean; transcribed: boolean; organized: boolean; inProject: boolean; distilled: boolean; topicCount: number; transcriptionState: "NOT_STARTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "UNAVAILABLE"; contentLabel?: string;
  organize: ReactNode; information: ReactNode; creation: ReactNode; processing: ReactNode; recommendedAction?: RecommendedAction; workflowContext?: WorkflowContext; variant?: "full" | "rail";
}) {
  const [tab, setTab] = useState<Tab>("研究成果");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  useEffect(() => {
    document.querySelector<HTMLElement>(".material-understanding-column")?.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const content: Record<Tab, ReactNode> = {
    研究成果: organize,
    去创作: creation,
    更多: <div className="material-secondary-grid"><section><h3>资料信息</h3>{information}</section><section><h3>处理与排查</h3>{processing}</section><section className="material-more-capabilities"><div><h3>更多研究能力</h3><Badge>即将支持</Badge></div><p>未来可以在这里扩展更多研究方式；当前不会创建假结果或假运行。</p></section></div>,
  };
  const completed = [saved, transcribed, organized, distilled, topicCount > 0, inProject].filter(Boolean).length;
  const transcriptState = transcriptionState === "COMPLETED" ? "DONE" : transcriptionState === "PROCESSING" ? "PROCESSING" : transcriptionState === "FAILED" ? "FAILED" : "MISSING";
  const openCreation = () => { const disclosure = document.getElementById("material-creation-actions") as HTMLDetailsElement | null; if (disclosure) disclosure.open = true; document.getElementById("material-creation-actions")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const openResearch = () => { setActionNotice(""); const action = document.querySelector('[data-testid="material-analysis-action"]') as HTMLButtonElement | null; if (action) { action.scrollIntoView({ behavior: "smooth", block: "center" }); action.click(); return; } document.querySelector('[data-testid="material-analysis-card"]')?.scrollIntoView({ behavior: "smooth", block: "center" }); setActionNotice("当前暂时无法看懂这条资料，请稍后再试。"); };
  const actions = !transcribed
    ? [{ key: "transcript", icon: <BookOpenCheck size={19} />, title: transcriptionState === "PROCESSING" ? `查看${contentLabel}进度` : transcriptionState === "FAILED" ? `重新生成${contentLabel}` : `先读取${contentLabel}`, description: transcriptionState === "PROCESSING" ? `${contentLabel}正在处理中，原始资料仍可查看` : `有了${contentLabel}后，再继续看懂、提炼或找选题`, run: () => document.getElementById("transcript-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }) }]
    : [
        !distilled ? { key: "research", icon: <BookOpenCheck size={19} />, title: organized ? "提炼值得学的东西" : "看懂与提炼", description: organized ? "从已有理解继续判断哪些值得拿走" : "看看内容在讲什么，提炼值得学的东西", run: openResearch } : null,
        { key: "topics", icon: <Lightbulb size={19} />, title: topicCount ? "查看选题" : "用这条找选题", description: topicCount ? `已经生成 ${topicCount} 个真实选题方向` : "从真实内容出发找到我们的创作角度", run: openCreation },
        { key: "create", icon: <PenLine size={19} />, title: inProject ? "去创作" : "作为创作依据", description: inProject ? "这条资料已经加入当前创作，可以继续写作" : "加入当前创作或直接开始创作", run: openCreation },
        workflowContext?.assistantHandoffAvailable && workflowContext.currentProjects[0] ? { key: "assistant", icon: <MessageCircle size={19} />, title: "在当前创作中问鑫小助", description: "沿用当前创作上下文继续提问", run: () => { window.location.href = `/dashboard?project=${workflowContext.currentProjects[0]!.id}`; } } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const primaryAction = recommendedAction ? actions.find((action) => action.key === recommendedAction.key) ? { ...actions.find((action) => action.key === recommendedAction.key)!, title: recommendedAction.title, description: recommendedAction.description } : actions[0] : actions[0];
  const secondaryActions = primaryAction ? actions.filter((action) => action.key !== primaryAction.key) : [];
  const runRecommended = () => {
    if (!primaryAction) return;
    if (!recommendedAction) { primaryAction.run(); return; }
    if (recommendedAction.target === "transcript") {
      const disclosure = document.getElementById("material-transcript-disclosure") as HTMLDetailsElement | null;
      if (disclosure) disclosure.open = true;
      document.getElementById("material-transcript-disclosure")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (recommendedAction.target === "creation" || recommendedAction.target === "project") { openCreation(); return; }
    if (recommendedAction.target === "metadata") { const settings = document.querySelector(".source-settings-popover") as HTMLDetailsElement | null; if (settings) settings.open = true; window.requestAnimationFrame(() => document.getElementById("material-metadata-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })); return; }
    if (recommendedAction.target === "methods") { document.getElementById("material-methods")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (recommendedAction.target === "research") { openResearch(); return; }
    setTab("研究成果");
    if (recommendedAction.target === "confirm") window.requestAnimationFrame(() => document.querySelector(".material-confirmable-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const renderSecondaryActions = () => secondaryActions.length ? variant === "rail"
    ? <div className="material-secondary-actions is-visible"><span className="material-secondary-label">其他可做</span><div>{secondaryActions.map((action) => <button key={action.key} type="button" onClick={action.run}>{action.icon}<span><strong>{action.title}</strong><small>{action.description}</small></span><ArrowRight size={15} /></button>)}</div></div>
    : <details className="material-secondary-actions"><summary>其他可做</summary><div>{secondaryActions.map((action) => <button key={action.key} type="button" onClick={action.run}>{action.icon}<span><strong>{action.title}</strong><small>{action.description}</small></span><ArrowRight size={15} /></button>)}</div></details> : null;
  const contextSummary = workflowContext ? <section className="material-workflow-context" aria-labelledby="material-workflow-context-heading"><header><h3 id="material-workflow-context-heading">当前工作</h3><span>{workflowContext.metadata.state === "PARTIAL" ? "资料信息待补全" : "真实资料"}</span></header><div className="material-workflow-context-list">{workflowContext.currentProjects.length ? <div><strong>当前创作</strong><span>{workflowContext.currentProjects[0]!.title}{workflowContext.currentProjects.length > 1 ? ` 等 ${workflowContext.currentProjects.length} 个` : ""}</span></div> : null}{workflowContext.pendingEvidenceCount ? <div><strong>待确认信息</strong><span>{workflowContext.pendingEvidenceCount} 条</span></div> : null}{workflowContext.relatedTopics.length ? <div><strong>关联选题</strong><span>{workflowContext.relatedTopics.length} 个</span></div> : null}{workflowContext.methodState.analysisCandidates.length + workflowContext.methodState.distillationCandidates.length + workflowContext.methodState.suggestions.length ? <div><strong>可复用Skill</strong><span>{workflowContext.methodState.analysisCandidates.length + workflowContext.methodState.distillationCandidates.length + workflowContext.methodState.suggestions.length} 条待查看</span></div> : null}{workflowContext.sourceBoundary ? <p>{workflowContext.sourceBoundary}</p> : null}</div></section> : null;
  const decision = <div className="material-decision-panel">
    {variant === "rail" ? null : <section className="material-progress-summary" data-testid="material-workspace-header"><header><h2>当前已有成果</h2><span>已有 {completed} 项</span></header><details><summary>查看资料准备情况</summary><div className="material-result-status"><Status state={saved ? "DONE" : "MISSING"} yes="资料已保存" no="资料未保存" /><Status state={transcriptState} yes={`已有${contentLabel}`} no={transcriptionState === "PROCESSING" ? `${contentLabel}处理中` : transcriptionState === "FAILED" ? `${contentLabel}处理失败` : `还没有${contentLabel}`} /><Status state={organized ? "DONE" : "MISSING"} yes="已看懂这条" no="还没看懂这条" /><Status state={distilled ? "DONE" : "MISSING"} yes="已有提炼结果" no="还没有提炼结果" /><Status state={topicCount ? "DONE" : "MISSING"} yes={`已有 ${topicCount} 个选题`} no="还没有生成选题" /><Status state={inProject ? "DONE" : "MISSING"} yes="已作为创作依据" no="尚未进入创作" /></div></details></section>}
    {contextSummary}
    <section className="material-next-actions" aria-labelledby="material-next-heading"><div><h3 id="material-next-heading">{variant === "rail" ? "接下来做什么" : "现在最值得做"}</h3><p>{variant === "rail" ? "基于这条内容，快速开始你的创作。" : "不会强制按顺序研究，只突出一个推荐动作，其他动作收在下面。"}</p></div>{primaryAction ? <button data-testid="material-recommended-action" type="button" onClick={runRecommended}>{primaryAction.icon}<span><strong>{primaryAction.title}<Badge>推荐</Badge></strong><small>{primaryAction.description}</small></span><ArrowRight size={16} /></button> : null}{renderSecondaryActions()}{actionNotice ? <p role="status" className="material-action-notice">{actionNotice}</p> : null}</section>
  </div>;
  const results = <div className="material-research-panel">
    <div data-testid="material-workspace-tabs" role="tablist" aria-label="资料工作栏" className="material-workspace-tabs">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item === "更多" ? <MoreHorizontal size={16} /> : null}{item}</button>)}</div>
    <div data-testid="material-workspace-scroll-body" role="tabpanel" data-active-tab={tab} className="material-workspace-content">{content[tab]}</div>
  </div>;
  if (variant === "rail") return <aside className="material-decision-column material-next-column"><Card>{decision}</Card></aside>;
  return <>
    <aside className="material-decision-column hidden min-[901px]:block"><Card>{decision}</Card></aside>
    <section id="material-research-results" data-testid="material-workspace" className="material-workspace-section hidden min-[901px]:block"><Card className="material-workspace-card">{results}</Card></section>
    <div className="min-[901px]:hidden"><Button className="w-full" variant="secondary" onClick={() => setMobileOpen(true)}>资料工作栏</Button></div>
    {mobileOpen ? <div className="fixed inset-0 z-50 flex items-end bg-black/35 min-[901px]:hidden" role="dialog" aria-modal="true" aria-label="资料工作栏"><button aria-label="关闭资料工作栏" className="absolute inset-0" onClick={() => setMobileOpen(false)} /><div className="relative h-[88dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-4 shadow-2xl"><button className="absolute right-4 top-3 z-10 rounded-full p-2" aria-label="关闭" onClick={() => setMobileOpen(false)}><X size={18} /></button>{decision}{results}</div></div> : null}
  </>;
}

function Status({ state, yes, no }: { state: "DONE" | "MISSING" | "PROCESSING" | "FAILED"; yes: string; no: string }) { return <div className={state === "DONE" ? "is-ready" : state === "PROCESSING" ? "is-processing" : state === "FAILED" ? "is-failed" : ""}><Badge>{state === "DONE" ? "✓" : state === "PROCESSING" ? "…" : state === "FAILED" ? "!" : "○"}</Badge><span>{state === "DONE" ? yes : no}</span></div>; }
