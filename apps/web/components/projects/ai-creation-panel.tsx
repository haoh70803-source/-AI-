"use client";

import { Badge, Button } from "@content-center/ui";
import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudioDrawer } from "./studio-drawer";
import type { CreativeBasisSummary } from "@/server/studio/creative-basis";

type AIAction = "ANALYZE_SOURCES" | "EXTRACT_EVIDENCE" | "GENERATE_ANGLES" | "GENERATE_BRIEF" | "GENERATE_MOTHER_CONTENT" | "REWRITE_SELECTION" | "SHORTEN" | "EXPAND" | "ADD_PERSONAL_VIEW" | "HUMANIZE";
type RewriteRequest = { id: number; action: AIAction; selectedText: string; selectionStart: number; selectionEnd: number };
type Run = { id: string; action: AIAction; status: string; output?: unknown; outputJson?: unknown };
type MotherContentSnapshot = { title: string; body: string; outline: string[]; version: number; origin: "HUMAN" | "KIMI" | "GPT_WEB"; originNote: string | null };
type UnifiedAnalysisView = { id: string; version: number; schemaVersion: string; status: string; inputFingerprint: string; output: unknown; errorCode: string | null; errorMessage: string | null; cached: boolean; isStale: boolean; createdAt: string; updatedAt: string };
type SafeErrorCategory = "AUTH" | "MODEL" | "SCHEMA" | "NETWORK" | "PROVIDER";

class AIRequestError extends Error { constructor(readonly code: string) { super("AI 分析失败"); } }
function safeErrorCategory(code: string | null | undefined): SafeErrorCategory {
  if (code?.includes("AUTH")) return "AUTH";
  if (code?.includes("MODEL")) return "MODEL";
  if (code?.includes("SCHEMA") || code?.includes("INVALID_RESPONSE")) return "SCHEMA";
  if (code?.includes("TIMEOUT") || code?.includes("NETWORK") || code?.includes("SERVER")) return "NETWORK";
  return "PROVIDER";
}

const rewriteLabels: Partial<Record<AIAction, string>> = { REWRITE_SELECTION: "改写", SHORTEN: "缩短", EXPAND: "扩写", ADD_PERSONAL_VIEW: "增加个人观点", HUMANIZE: "表达自然化" };
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function missingReferenceCount(output: Record<string, unknown>) {
  if (!Object.keys(output).length) return 0;
  const candidates = [output.creativeInterpretation, ...array(output.angles), output.structure, ...array(object(output.structure).sections), output.expressionDirection, ...array(output.riskNotes), ...array(output.titleReferences)];
  const missing = candidates.filter((value) => value && typeof value === "object" && array(object(value).sourceItemIds).length === 0).length;
  return array(output.groundingGaps).length ? Math.max(1, missing) : missing;
}

export function AICreationPanel({ projectId, integrationStatus, creatorProfile, editable, motherVersion, motherReady, motherGenerating, creativeBasis, unifiedAnalysis, latestStatus, latestErrorCode, inputChanged, sourceCount, organizedSourceCount, planConfirmed, planReady, onAnalysisUpdated, onContinue, onGenerateMother, rewriteRequest, onMotherContentApplied }: { projectId: string; integrationStatus: "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "DISABLED" | "ERROR" | "MOCK"; creatorProfile: { displayName: string; positioning: string } | null; editable: boolean; motherVersion: number; motherReady: boolean; motherGenerating: boolean; creativeBasis: CreativeBasisSummary; unifiedAnalysis: UnifiedAnalysisView | null; latestStatus: string | null; latestErrorCode: string | null; inputChanged: boolean; sourceCount: number; organizedSourceCount: number; planConfirmed: boolean; planReady: boolean; onAnalysisUpdated: () => void; onContinue: () => void; onGenerateMother: () => void; rewriteRequest: RewriteRequest | null; onMotherContentApplied: (content: MotherContentSnapshot) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorCategory, setErrorCategory] = useState<SafeErrorCategory | null>(() => latestStatus === "FAILED" ? safeErrorCategory(latestErrorCode) : null);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState(unifiedAnalysis);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [rewriteRun, setRewriteRun] = useState<Run | null>(null);
  const lastRewrite = useRef(0);
  const currentRewrite = useRef<RewriteRequest | null>(null);

  useEffect(() => { setAnalysis(unifiedAnalysis); }, [unifiedAnalysis]);

  async function call(path: string, body?: unknown) {
    const response = await fetch(path, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new AIRequestError(typeof result.error === "string" ? result.error : "PROVIDER_ERROR");
    return result;
  }

  async function executeUnified() {
    setBusy(true); setErrorCategory(null); setMessage("");
    try {
      const result = await call(`/api/projects/${projectId}/ai/run`, { action: "UNIFIED_CREATIVE_ANALYSIS" }) as UnifiedAnalysisView;
      setAnalysis(result); onAnalysisUpdated(); setMessage(result.cached ? "已复用相同输入的分析结果" : "AI 分析完成"); router.refresh();
    } catch (cause) { setErrorCategory(safeErrorCategory(cause instanceof AIRequestError ? cause.code : null)); }
    finally { setBusy(false); }
  }

  async function executeRewrite(selection: RewriteRequest) {
    setBusy(true); setErrorCategory(null); setMessage("");
    try { const run = await call(`/api/projects/${projectId}/ai/run`, { action: selection.action, selectedText: selection.selectedText }); currentRewrite.current = selection; setRewriteRun(run); }
    catch (cause) { setErrorCategory(safeErrorCategory(cause instanceof AIRequestError ? cause.code : null)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!rewriteRequest || rewriteRequest.id === lastRewrite.current || (integrationStatus !== "CONFIGURED" && integrationStatus !== "MOCK")) return;
    lastRewrite.current = rewriteRequest.id; void executeRewrite(rewriteRequest);
  }, [rewriteRequest, integrationStatus]);

  async function applyRewrite(mode: "REPLACE" | "INSERT_AFTER") {
    if (!rewriteRun || !currentRewrite.current) return;
    setBusy(true); setErrorCategory(null);
    try {
      const result = object(await call(`/api/projects/${projectId}/ai/runs/${rewriteRun.id}/apply`, { expectedVersion: motherVersion, selectionStart: currentRewrite.current.selectionStart, selectionEnd: currentRewrite.current.selectionEnd, mode }));
      const mother = object(result.motherContent);
      onMotherContentApplied({ title: text(mother.title), body: text(mother.body), outline: array(mother.outline).filter((item): item is string => typeof item === "string"), version: typeof mother.version === "number" ? mother.version : motherVersion + 1, origin: mother.origin === "GPT_WEB" || mother.origin === "HUMAN" ? mother.origin : "KIMI", originNote: typeof mother.originNote === "string" ? mother.originNote : null });
      setRewriteRun(null); setMessage("AI 结果已应用"); router.refresh();
    } catch { setErrorCategory("PROVIDER"); }
    finally { setBusy(false); }
  }

  async function discardRewrite() {
    if (!rewriteRun) return;
    setBusy(true); setErrorCategory(null);
    try { await call(`/api/projects/${projectId}/ai/runs/${rewriteRun.id}/discard`); setRewriteRun(null); setMessage("已放弃本次 AI 结果"); router.refresh(); }
    catch { setErrorCategory("PROVIDER"); }
    finally { setBusy(false); }
  }

  const configured = integrationStatus === "CONFIGURED" || integrationStatus === "MOCK";
  const stale = Boolean(analysis && (analysis.isStale || inputChanged));
  const output = object(analysis?.output);
  const rewriteOutput = object(rewriteRun?.output ?? rewriteRun?.outputJson);
  const gapCount = missingReferenceCount(output);
  const suggestion = text(object(array(output.angles)[0]).angle) || text(object(output.creativeInterpretation).text) || (analysis ? "分析已完成，可以确认创作方案。" : "先完成一次统一创作分析，系统会整理角度、结构和风险。");

  return <section data-testid="unified-creative-analysis"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">AI 创作助手</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">当前状态与建议下一步</p></div></div>
    <div className="mt-5 grid gap-2 text-sm"><StatusRow done={sourceCount > 0} label="素材已准备" /><StatusRow done={organizedSourceCount > 0} label="智能整理完成" /><StatusRow done={Boolean(analysis)} label="创作分析完成" /><StatusRow done={planConfirmed} label="创作方案已确认" /><StatusRow done={motherReady} label={motherReady ? "核心母稿已生成" : "核心母稿待生成"} /></div>
    {!configured ? <div className="mt-5 rounded-xl border border-dashed p-4 text-sm">内容生成服务暂时不可用，请联系管理员。</div> : null}
    {creatorProfile ? <div className="mt-5 rounded-xl bg-[var(--surface-elevated)] p-3 text-xs"><p className="text-[var(--text-secondary)]">当前创作者</p><p className="mt-1 font-medium">{creatorProfile.displayName || "未命名创作者"}</p>{creatorProfile.positioning ? <p className="mt-1 text-[var(--text-secondary)]">{creatorProfile.positioning}</p> : null}<Link href="/settings/creator-profile" className="mt-2 inline-block text-[var(--accent)]">查看画像</Link></div> : configured ? <p className="mt-5 rounded-xl bg-[var(--surface-elevated)] p-3 text-xs text-[var(--text-secondary)]">尚未建立个人创作画像，本次只使用项目上下文。 <Link href="/settings/creator-profile" className="text-[var(--accent)]">去建立</Link></p> : null}
    <div className="mt-5"><h3 className="text-xs font-medium text-[var(--text-secondary)]">当前建议</h3><p className="mt-2 text-sm leading-6">{suggestion}</p></div>
    {stale ? <p className="mt-4 rounded-lg bg-[var(--surface-elevated)] p-3 text-xs text-[var(--warning)]">创作内容已发生变化，建议更新分析；不会自动调用 AI。</p> : null}
    <button type="button" onClick={() => document.getElementById("creative-basis")?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`mt-4 block text-left text-xs ${creativeBasis.needsVerificationCount ? "text-[var(--warning)]" : "text-[var(--text-secondary)]"}`}>创作依据 {creativeBasis.usableCount} 条{creativeBasis.needsVerificationCount ? ` · ⚠ ${creativeBasis.needsVerificationCount} 条待核实` : ""} · 查看</button>
    {gapCount ? <button type="button" onClick={() => setAnalysisOpen(true)} className="mt-2 text-left text-xs text-[var(--warning)]">有部分建议缺少充分素材依据。查看分析详情</button> : null}
    {analysis ? <p className="mt-4 text-xs text-[var(--text-secondary)]">分析于 {new Date(analysis.updatedAt).toLocaleString("zh-CN")} · v{analysis.version}</p> : null}
    {configured && editable && (!analysis || stale || errorCategory) ? <Button className="mt-5 w-full" disabled={busy} onClick={executeUnified}>{errorCategory ? "重新分析" : analysis ? "更新分析" : "开始 AI 分析"}</Button> : null}
    {configured && editable && planConfirmed && !motherReady ? <Button className="mt-5 w-full" disabled={motherGenerating} onClick={onGenerateMother}>{motherGenerating ? "正在生成核心母稿..." : "AI 生成核心母稿"}</Button> : null}
    <Button className="mt-2 w-full" variant={analysis ? "secondary" : "ghost"} onClick={onContinue}>{motherReady ? "继续编辑母稿" : planConfirmed ? "查看母稿准备" : planReady ? "继续创作" : "完善创作方案"}</Button>
    {analysis ? <button type="button" className="mt-3 w-full text-sm text-[var(--accent)]" onClick={() => setAnalysisOpen(true)}>查看完整分析</button> : null}
    {busy ? <p role="status" className="mt-4 text-sm text-[var(--text-secondary)]">AI 正在处理…</p> : null}
    {errorCategory ? <div role="alert" className="mt-4 rounded-lg border border-[var(--danger)]/30 p-3 text-sm"><p className="font-medium text-[var(--danger)]">AI 分析失败</p><details className="mt-2 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">高级详情</summary><p className="mt-2">错误类型：{errorCategory}</p></details></div> : null}
    {message ? <p role="status" className="mt-4 text-sm text-[var(--success)]">{message}</p> : null}
    {rewriteRun ? <div className="mt-5 border-t pt-5"><h3 className="text-sm font-semibold">{rewriteLabels[rewriteRun.action] || "AI 编辑"}预览</h3><div className="mt-3 grid gap-3 text-xs"><div className="rounded-lg bg-[var(--surface-elevated)] p-3"><strong>原文</strong><p className="mt-2 whitespace-pre-wrap">{text(rewriteOutput.original)}</p></div><div className="rounded-lg border p-3"><strong>AI 建议版本</strong><p className="mt-2 whitespace-pre-wrap">{text(rewriteOutput.aiVersion)}</p></div></div><div className="mt-4 grid gap-2"><Button disabled={busy} onClick={() => applyRewrite("REPLACE")}>替换选中文字</Button><Button variant="secondary" disabled={busy} onClick={() => applyRewrite("INSERT_AFTER")}>插入下方</Button><Button variant="ghost" disabled={busy} onClick={discardRewrite}>放弃</Button></div></div> : null}
    <StudioDrawer title="完整 AI 创作分析" open={analysisOpen} onClose={() => setAnalysisOpen(false)}>{analysis?.output ? <UnifiedAnalysisResult output={output} /> : null}</StudioDrawer>
  </section>;
}

function StatusRow({ done, label }: { done: boolean; label: string }) { return <div className="flex items-center gap-2">{done ? <Check size={15} className="text-[var(--success)]" /> : <Circle size={13} className="text-[var(--text-secondary)]" />}<span className={done ? "" : "text-[var(--text-secondary)]"}>{label}</span></div>; }

function UnifiedAnalysisResult({ output }: { output: Record<string, unknown> }) {
  const interpretation = object(output.creativeInterpretation); const structure = object(output.structure); const expression = object(output.expressionDirection);
  return <div className="grid gap-6 text-sm">
    <AnalysisSection title="创作理解" classification={text(interpretation.classification)}><p className="leading-6">{text(interpretation.text)}</p><SourceFacts output={output} /></AnalysisSection>
    <AnalysisSection title="可选切入角度" classification="AI_SUGGESTION"><div className="grid gap-2">{array(output.angles).map((value, index) => { const item = object(value); return <article key={index} className="rounded-lg border p-3"><p className="font-semibold">{text(item.title)}</p><p className="mt-1 leading-6">{text(item.angle)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{text(item.rationale)}</p></article>; })}</div></AnalysisSection>
    <AnalysisSection title="结构建议" classification={text(structure.classification)}>{text(structure.overallApproach) ? <p className="leading-6">{text(structure.overallApproach)}</p> : <EmptySection />}<ol className="mt-2 grid gap-2">{array(structure.sections).map((value, index) => { const item = object(value); return <li key={index} className="rounded-lg bg-[var(--surface-elevated)] p-3"><strong>{index + 1}. {text(item.title)}</strong><p className="mt-1">{text(item.purpose)}</p><p className="mt-1 text-[var(--text-secondary)]">{text(item.keyMessage)}</p></li>; })}</ol></AnalysisSection>
    <AnalysisSection title="素材依据" classification="SOURCE_FACT"><div className="grid gap-2">{array(output.sourceReferences).map((value, index) => { const item = object(value); return <p key={index} className="rounded-lg bg-[var(--surface-elevated)] p-2">{text(item.title) || text(item.sourceItemId)} · {text(item.role)}</p>; })}{array(output.groundingGaps).length ? <p className="text-[var(--warning)]">部分建议缺少足够素材引用，请人工核对。</p> : null}</div></AnalysisSection>
    <AnalysisSection title="表达方向" classification={text(expression.classification)}>{text(expression.description) ? <><p>{text(expression.description)}</p><p className="mt-1 text-[var(--text-secondary)]">{text(expression.rationale)}</p></> : <EmptySection />}</AnalysisSection>
    <AnalysisSection title="风险提醒" classification="AI_INTERPRETATION">{array(output.riskNotes).length ? <ul className="list-disc space-y-1 pl-4">{array(output.riskNotes).map((value, index) => <li key={index}>{text(object(value).text)}</li>)}</ul> : <EmptySection />}</AnalysisSection>
    <AnalysisSection title="标题参考" classification="AI_SUGGESTION"><p className="mb-2 text-[var(--text-secondary)]">仅供参考，不是最终标题。</p>{array(output.titleReferences).length ? <ul className="list-disc space-y-1 pl-4">{array(output.titleReferences).map((value, index) => <li key={index}>{text(object(value).title)}</li>)}</ul> : <EmptySection />}</AnalysisSection>
  </div>;
}

function SourceFacts({ output }: { output: Record<string, unknown> }) { const summary = object(output.summary); const question = object(output.coreQuestion); const viewpoint = object(output.coreViewpoint); return <dl className="mt-3 grid gap-2 rounded-lg bg-[var(--surface-elevated)] p-3"><div><dt className="font-medium">素材背景</dt><dd className="mt-1">{text(summary.text) || "未提供"}</dd></div><div><dt className="font-medium">核心问题</dt><dd className="mt-1">{text(question.text) || "未提供"}</dd></div><div><dt className="font-medium">素材核心观点</dt><dd className="mt-1">{text(viewpoint.text) || "未提供"}</dd></div></dl>; }
function AnalysisSection({ title, classification, children }: { title: string; classification: string; children: ReactNode }) { const labels: Record<string, string> = { SOURCE_FACT: "来源依据", USER_INPUT: "我的输入", AI_INTERPRETATION: "AI 理解", AI_SUGGESTION: "AI 建议" }; return <section><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3>{classification ? <Badge>{labels[classification] || classification}</Badge> : null}</div>{children}</section>; }
function EmptySection() { return <p className="text-[var(--text-secondary)]">本次分析未提供这一部分。</p>; }

export type { AIAction, RewriteRequest, UnifiedAnalysisView };
