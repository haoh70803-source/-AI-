"use client";

import { ArtifactWindow } from "./artifact-window";
import { Badge, Button, Card } from "@content-center/ui";
import { AlertTriangle, BookOpenCheck, CheckCircle2, ChevronRight, CircleCheckBig, Copy, Eye, FilePlus2, LibraryBig, MoreHorizontal, PencilLine, ShieldCheck, Sparkles, Target, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BriefEditor, type MySupplement } from "./brief-editor";
import { MotherContentEditor, type MotherContentEditorHandle, type StudioSelectionAction } from "./mother-content-editor";
import { StudioSources, type ProjectSource } from "./studio-sources";
import { StudioDrawer } from "./studio-drawer";
import { PlatformContentFactory } from "./platform-content-factory";
import { PLATFORM_LABELS, SUPPORTED_PLATFORMS, type PlatformVariantView, type SupportedPlatform } from "@/lib/platforms";
import type { CreativePlan } from "@/server/studio/creative-brief-prefill";
import type { ContentProductionPlan } from "@/lib/content-production";
import { ContentProductionPreview, ShootabilityCheck } from "./content-production-preview";
import { StudioMethodSelector } from "./studio-method-selector";
import type { ProjectMethodStateDTO } from "@/server/project-methods/service";
import { CreationFeedback } from "./creation-feedback";
import type { CreationFeedbackContext } from "@/server/creation-feedback/service";
import { useRouter } from "next/navigation";
import { StudioDefaultMethod, type StudioAssistantHandle } from "./studio-default-method";
import { WorkflowHumanizeAction } from "./workflow-humanize-action";
import { ContentCanvas, type CanvasAssistantContext, type CanvasContextKind, type CanvasSourceOption, type WorkbenchLayoutMode } from "./content-canvas";
import type { CanvasObjectDTO } from "@/lib/contracts/canvas";
import type { DraftBranchDTO, DraftRevisionDTO } from "@/server/drafts/service";
import type { StudioDefaultContentMethodDTO } from "@/server/default-content-method/service";
import type { StudioActionRecommendation } from "@/server/ai/schemas";
import type { ArtifactSummaryView, ArtifactView } from "@/lib/contracts/artifacts";

type AvailableSource = { id: string; title: string | null; displayName: string; sourcePlatform: string; sourceType: string };
type ProjectStatus = "DRAFT" | "RESEARCHING" | "BRIEF_READY" | "WRITING" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
type MotherSnapshot = { title: string; body: string; outline: string[]; version: number; origin: "HUMAN" | "KIMI" | "GPT_WEB"; originNote: string | null; confirmedVersion: number | null; confirmedWarnings: string[]; draftBranchId: string; draftBranchTitle: string; draftBranchVersion: number; draftRevision: number; draftConfirmed: boolean; isPrimary: boolean };
type CreativePlanHandoff = { plan: CreativePlan; storedPlan: CreativePlan; origins: string[]; autoPrefilled: boolean; titleReferences: string[]; stage: "PREPARING" | "WRITING" };
type DraftWarning = { code: string; message: string; reason?: string; suggestion?: string };
type ContextFact = { text: string; source: "CREATOR_PROFILE" | "PROJECT_EVIDENCE" | "MY_SUPPLEMENT" | "CURRENT_DRAFT"; kind: string };
type ContextSummary = { topic: string; goal: string; ownFacts: ContextFact[]; profile: { displayName: string; positioning: string } | null; creatorUnderstandingCount: number; externalSourceCount: number; handoff: string | null };

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function warningKey(warning: Pick<DraftWarning, "code" | "message">) { return `${warning.code}:${warning.message}`; }
function isBlockingWarning(warning: DraftWarning) { return warning.code === "POSSIBLE_SOURCE_COPY" || warning.code === "UNVERIFIED_REFERENCE_CLAIM"; }
function historyLabel(version: number, current: boolean) { return current ? "当前稿件" : version === 1 ? "首次保存" : `第 ${version} 次修改`; }

export function StudioShell({ project, draftBranches: initialDraftBranches, canvasObjects, methods, defaultMethod, recommendedActions, availableSources, feedback, editable, ai, contextSummary, initialWarnings = [], artifacts, activeArtifact, initialRequest }: {
  project: { id: string; title: string; status: ProjectStatus; description: string | null; goal: string | null; audience: string | null; sources: ProjectSource[]; creativePlan: CreativePlanHandoff; motherContent: MotherSnapshot; platformVariants: PlatformVariantView[]; productionPlan: ContentProductionPlan | null };
  draftBranches: DraftBranchDTO[];
  canvasObjects: CanvasObjectDTO[];
  methods: ProjectMethodStateDTO;
  defaultMethod: StudioDefaultContentMethodDTO | null;
  recommendedActions: StudioActionRecommendation[];
  availableSources: AvailableSource[];
  feedback: CreationFeedbackContext;
  editable: boolean;
  ai: { integrationStatus: "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "DISABLED" | "ERROR" | "MOCK"; creatorProfile: { displayName: string; positioning: string } | null };
  contextSummary: ContextSummary;
  initialWarnings?: DraftWarning[];
  artifacts: ArtifactSummaryView[];
  activeArtifact: ArtifactView | null;
  activeNode?: string | null;
  initialRequest?: Record<string, unknown> & { content: string };
}) {
  const router = useRouter();
  const [artifactWindowOpen, setArtifactWindowOpen] = useState(Boolean(activeArtifact));
  useEffect(() => { if (activeArtifact) setArtifactWindowOpen(true); }, [activeArtifact?.artifactId, activeArtifact?.version]);
  const initialPlan = project.creativePlan.plan;
  const briefVersion = useRef(initialPlan.version);
  const [supplement, setSupplement] = useState<MySupplement>({ coreMessage: initialPlan.coreMessage, audience: initialPlan.audience, background: initialPlan.background, angle: initialPlan.angle });
  const [supplementBusy, setSupplementBusy] = useState(false);
  const [supplementMessage, setSupplementMessage] = useState("");
  const [mother, setMother] = useState(project.motherContent);
  const [draftBranches, setDraftBranches] = useState(initialDraftBranches);
  const [motherHistory, setMotherHistory] = useState<DraftRevisionDTO[]>([]);
  const [legacyMotherVersion, setLegacyMotherVersion] = useState(project.motherContent.version);
  const motherGeneratingRef = useRef(false);
  const [motherGenerating, setMotherGenerating] = useState(false);
  const [motherMessage, setMotherMessage] = useState("");
  const [motherError, setMotherError] = useState("");
  const [warnings, setWarnings] = useState<DraftWarning[]>(initialWarnings);
  const [confirmedWarningKeys, setConfirmedWarningKeys] = useState<string[]>(project.motherContent.confirmedWarnings);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [productionPlan, setProductionPlan] = useState(project.productionPlan);
  const [methodState, setMethodState] = useState(methods);
  const [selectedAngle, setSelectedAngle] = useState(project.productionPlan?.recommendedAngle || "");
  const [selectedTitle, setSelectedTitle] = useState(project.motherContent.title || project.productionPlan?.recommendedTitle || "");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [newDraftTitle, setNewDraftTitle] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<"CREATE" | "PLATFORM">("CREATE");
  const [contextTab, setContextTab] = useState<"SOURCES" | "FACTS" | "PERSON" | "METHODS">("SOURCES");
  const [sourceManageRequest, setSourceManageRequest] = useState(0);
  const [methodSelectRequest, setMethodSelectRequest] = useState(0);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<WorkbenchLayoutMode>("assistant-only");
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(null);
  const [activePlatform, setActivePlatform] = useState<SupportedPlatform>("DOUYIN");
  const [variants, setVariants] = useState(project.platformVariants);
  const [feedbackContext, setFeedbackContext] = useState(feedback);
  const assistantRef = useRef<StudioAssistantHandle>(null);
  const editorRef = useRef<MotherContentEditorHandle>(null);
  const editableProject = editable && project.status !== "ARCHIVED";
  const configured = ai.integrationStatus === "CONFIGURED" || ai.integrationStatus === "MOCK";
  const motherConfirmed = mother.isPrimary && mother.draftConfirmed;
  const hasWorkingDraft = Boolean(mother.title.trim() || mother.body.trim() || mother.outline.length);
  const advisoryWarnings = warnings.filter((warning) => !isBlockingWarning(warning));
  const blockingWarnings = warnings.filter((warning) => isBlockingWarning(warning));
  const unresolvedBlockingWarnings = blockingWarnings.filter((warning) => !confirmedWarningKeys.includes(warningKey(warning)));
  const assistantOpen = layoutMode !== "canvas-only";

  useEffect(() => setFeedbackContext(feedback), [feedback]);
  useEffect(() => {
    const stored = window.localStorage.getItem(`studio-workbench-layout:${project.id}:v1`);
    if (stored === "canvas-only" || stored === "canvas-assistant" || stored === "assistant-only") {
      setLayoutMode(stored);
      return;
    }
    if (window.localStorage.getItem("studio-assistant-open") === "false") setLayoutMode("canvas-only");
  }, [project.id]);
  useEffect(() => { if (selection) setWorkbenchLayout("canvas-assistant"); }, [selection]);

  function setWorkbenchLayout(next: WorkbenchLayoutMode) {
    setLayoutMode(next);
    window.localStorage.setItem(`studio-workbench-layout:${project.id}:v1`, next);
    window.localStorage.setItem("studio-assistant-open", String(next !== "canvas-only"));
  }

  function toggleAssistant(next: boolean) {
    setWorkbenchLayout(next ? "canvas-assistant" : "canvas-only");
  }

  function runSelectionAction(action: StudioSelectionAction) {
    toggleAssistant(true);
    window.setTimeout(() => assistantRef.current?.executeSelection(action), 0);
  }

  function openCanvasContext(kind: CanvasContextKind) {
    if (kind === "brief") setSupplementOpen(true);
    if (kind === "sources") { setContextTab("SOURCES"); setSourceManageRequest((current) => current + 1); }
    if (kind === "facts") setContextTab("FACTS");
    if (kind === "methods") { setContextTab("METHODS"); setMethodSelectRequest((current) => current + 1); }
  }

  function invalidateFeedback() {
    setFeedbackContext((current) => current ? { ...current, available: false, sourceAiRunId: null, methods: [], feedback: null, unavailableReason: "NO_APPLIED_GENERATION" } : current);
    router.refresh();
  }

  async function refreshWarnings(body: string) {
    try {
      const response = await fetch(`/api/projects/${project.id}/mother-content/warnings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      const result = object(await response.json().catch(() => ({})));
      if (!response.ok) throw new Error(text(result.message) || "暂时无法完成内容检查。");
      setWarnings(Array.isArray(result.warnings) ? result.warnings.filter((item): item is DraftWarning => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).code === "string" && typeof (item as Record<string, unknown>).message === "string")) : []);
      setConfirmedWarningKeys([]);
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "暂时无法完成内容检查。"); }
  }

  async function draftRequest(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || "稿件操作失败。");
    return result;
  }

  function showDraft(branch: DraftBranchDTO, nextLegacyVersion = legacyMotherVersion) {
    const working = branch.workingState;
    const revision = branch.currentRevision;
    setMother((current) => ({
      ...current,
      title: working.title,
      body: working.body,
      outline: working.outline,
      version: branch.isPrimary ? nextLegacyVersion : revision?.revision || 0,
      origin: working.origin === "AI" ? "KIMI" : working.origin,
      originNote: working.originNote,
      confirmedVersion: branch.isPrimary && branch.confirmedRevisionId === revision?.id ? nextLegacyVersion : null,
      confirmedWarnings: branch.isPrimary ? current.confirmedWarnings : [],
      draftBranchId: branch.id,
      draftBranchTitle: branch.title,
      draftBranchVersion: branch.version,
      draftRevision: revision?.revision || 0,
      draftConfirmed: branch.confirmedRevisionId === revision?.id,
      isPrimary: branch.isPrimary,
    }));
    setSelectedTitle(working.title);
    setMotherHistory([]);
    setHistoryOpen(false);
    setWarningsOpen(false);
    setConfirmedWarningKeys([]);
    setSelection(null);
    if (!branch.isPrimary) setTab("CREATE");
    void refreshWarnings(working.body);
  }

  async function syncActiveDraft(branchId = mother.draftBranchId) {
    const result = await draftRequest(`/api/projects/${project.id}/drafts/${branchId}`);
    const branch = result.draft as DraftBranchDTO;
    setDraftBranches((current) => current.map((item) => item.id === branch.id ? branch : item));
    setMother((current) => ({ ...current, draftBranchVersion: branch.version, draftRevision: branch.currentRevision?.revision || current.draftRevision, draftConfirmed: branch.confirmedRevisionId === branch.currentRevisionId }));
    return branch;
  }

  async function flushCurrentDraft() {
    if (!editableProject) return true;
    const saved = await editorRef.current?.flush();
    return saved !== false;
  }

  async function checkpointCurrentDraft() {
    if (!editableProject) return true;
    if (!await flushCurrentDraft()) return false;
    const latest = await draftRequest(`/api/projects/${project.id}/drafts/${mother.draftBranchId}`);
    const result = await draftRequest(`/api/projects/${project.id}/drafts/${mother.draftBranchId}/checkpoint`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: (latest.draft as DraftBranchDTO).version }) });
    const branch = result.branch as DraftBranchDTO;
    const nextLegacyVersion = typeof result.legacyContent?.version === "number" ? result.legacyContent.version : legacyMotherVersion;
    if (branch.isPrimary) setLegacyMotherVersion(nextLegacyVersion);
    setDraftBranches((current) => current.map((item) => item.id === branch.id ? branch : item));
    setMother((current) => ({ ...current, version: branch.isPrimary ? nextLegacyVersion : branch.currentRevision?.revision || current.version, draftBranchVersion: branch.version, draftRevision: branch.currentRevision?.revision || 0, draftConfirmed: branch.confirmedRevisionId === branch.currentRevisionId }));
    return true;
  }

  async function openDraft(branchId: string) {
    if (branchId === mother.draftBranchId) { setDraftsOpen(false); return; }
    setDraftBusy(true); setMotherError("");
    try {
      if (!await checkpointCurrentDraft()) throw new Error("当前内容尚未保存，请重试后再切换稿件。");
      const result = await draftRequest(`/api/projects/${project.id}/drafts/${branchId}`);
      showDraft(result.draft as DraftBranchDTO);
      setDraftsOpen(false);
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "稿件切换失败。"); }
    finally { setDraftBusy(false); }
  }

  async function openDraftHistory() {
    setDraftBusy(true); setMotherError("");
    try {
      if (!await flushCurrentDraft()) throw new Error("当前内容尚未保存，请重试后再查看历史。");
      const result = await draftRequest(`/api/projects/${project.id}/drafts/${mother.draftBranchId}/history`);
      setMotherHistory(result.history as DraftRevisionDTO[]);
      setHistoryOpen(true);
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "历史记录加载失败。"); }
    finally { setDraftBusy(false); }
  }

  async function createDraft(copyCurrent: boolean) {
    const title = newDraftTitle.trim();
    if (!title || draftBusy) return;
    setDraftBusy(true); setMotherError("");
    try {
      if (!await checkpointCurrentDraft()) throw new Error("当前内容尚未保存，请重试后再新建稿件。");
      const result = await draftRequest(`/api/projects/${project.id}/drafts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, ...(copyCurrent ? { copyFromBranchId: mother.draftBranchId } : {}) }) });
      const draft = result.draft as DraftBranchDTO;
      setDraftBranches((current) => [draft, ...current]);
      setNewDraftTitle("");
      showDraft(draft);
      setDraftsOpen(false);
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "新建稿件失败。"); }
    finally { setDraftBusy(false); }
  }

  async function renameDraft(branch: DraftBranchDTO) {
    const title = window.prompt("新的稿件名称", branch.title)?.trim();
    if (!title || title === branch.title) return;
    setDraftBusy(true); setMotherError("");
    try {
      const result = await draftRequest(`/api/projects/${project.id}/drafts/${branch.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, expectedVersion: branch.version }) });
      const updated = result.draft as DraftBranchDTO;
      setDraftBranches((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (mother.draftBranchId === updated.id) setMother((current) => ({ ...current, draftBranchTitle: updated.title, draftBranchVersion: updated.version }));
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "稿件重命名失败。"); }
    finally { setDraftBusy(false); }
  }

  async function deleteDraft(branch: DraftBranchDTO) {
    if (branch.isPrimary) { setMotherError("这是当前主稿，请先选择其他稿件作为主稿。"); return; }
    if (!window.confirm(`删除“${branch.title}”？历史记录会保留，当前列表中将不再显示。`)) return;
    setDraftBusy(true); setMotherError("");
    try {
      await draftRequest(`/api/projects/${project.id}/drafts/${branch.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: branch.version }) });
      setDraftBranches((current) => current.filter((item) => item.id !== branch.id));
      if (mother.draftBranchId === branch.id) {
        const primary = draftBranches.find((item) => item.isPrimary);
        if (primary) showDraft(primary);
      }
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "稿件删除失败。"); }
    finally { setDraftBusy(false); }
  }

  async function makePrimary(branch: DraftBranchDTO) {
    if (branch.isPrimary || draftBusy) return;
    const currentPrimary = draftBranches.find((item) => item.isPrimary);
    if (!currentPrimary) return;
    setDraftBusy(true); setMotherError("");
    try {
      if (!await checkpointCurrentDraft()) throw new Error("当前内容尚未保存，请重试后再切换主稿。");
      const result = await draftRequest(`/api/projects/${project.id}/drafts/${branch.id}/primary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedPrimaryDraftBranchId: currentPrimary.id }) });
      const primary = result.branch as DraftBranchDTO;
      const nextLegacyVersion = typeof result.legacyContent?.version === "number" ? result.legacyContent.version : legacyMotherVersion + 1;
      setLegacyMotherVersion(nextLegacyVersion);
      setDraftBranches((current) => current.map((item) => item.id === primary.id ? primary : { ...item, isPrimary: false }));
      showDraft(primary, nextLegacyVersion);
      setMotherMessage("已设为当前主稿，平台适配会使用这份内容。");
      setDraftsOpen(false);
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "主稿切换失败。"); }
    finally { setDraftBusy(false); }
  }

  async function confirmMother() {
    if (!editableProject || !mother.draftRevision || unresolvedBlockingWarnings.length) return;
    setMotherError(""); setMotherMessage("");
    try {
      const checkedKeys = [...new Set([...confirmedWarningKeys, ...advisoryWarnings.map(warningKey)])];
      if (!await flushCurrentDraft()) throw new Error("当前内容尚未保存，请重试后再确认。");
      const latest = await draftRequest(`/api/projects/${project.id}/drafts/${mother.draftBranchId}`);
      const response = await fetch(`/api/projects/${project.id}/drafts/${mother.draftBranchId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: (latest.draft as DraftBranchDTO).version, warningKeys: checkedKeys }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "口播稿确认失败，请稍后重试。");
      const branch = result.branch as DraftBranchDTO;
      setDraftBranches((current) => current.map((item) => item.id === branch.id ? branch : item));
      setMother((current) => ({ ...current, draftBranchVersion: branch.version, draftConfirmed: true, confirmedVersion: current.isPrimary ? current.version : null }));
      setConfirmedWarningKeys(checkedKeys);
      setMotherMessage(mother.isPrimary ? "口播稿已确认，可以生成平台版本。" : "这份稿件已确认。设为主稿后可进入平台适配。");
      if (mother.isPrimary) { setTab("PLATFORM"); setActivePlatform("DOUYIN"); }
    } catch (cause) { setMotherError(cause instanceof Error ? cause.message : "口播稿确认失败，请稍后重试。"); }
  }

  async function saveSupplement(showMessage = true) {
    setSupplementBusy(true); if (showMessage) setSupplementMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/brief`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: initialPlan.topic || project.title, coreMessage: supplement.coreMessage, audience: supplement.audience, background: supplement.background, angle: supplement.angle, coreQuestion: initialPlan.coreQuestion, keyPoints: initialPlan.keyPoints, structure: initialPlan.structure, tone: initialPlan.tone, risks: initialPlan.risks, expectedVersion: briefVersion.current }) });
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || result.error || "保存失败"); briefVersion.current = result.version; router.refresh(); if (showMessage) setSupplementMessage("已保存"); return true;
    } catch (cause) { setSupplementMessage(cause instanceof Error ? cause.message : "保存失败"); return false; }
    finally { setSupplementBusy(false); }
  }

  async function generateMotherContent(angle?: string) {
    if (motherGeneratingRef.current || !editableProject || !mother.isPrimary) return;
    motherGeneratingRef.current = true;
    setMotherGenerating(true); setMotherError(""); setMotherMessage(""); setWarnings([]);
    try {
      if (!await saveSupplement(false)) throw new Error("请先保存我的补充");
      const runResponse = await fetch(`/api/projects/${project.id}/ai/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "GENERATE_MOTHER_CONTENT", ...(angle ? { instruction: angle } : {}) }) });
      const run = await runResponse.json().catch(() => ({})); if (!runResponse.ok) throw new Error(run.message || run.error || "口播稿生成失败");
      const applyResponse = await fetch(`/api/projects/${project.id}/ai/runs/${text(object(run).id)}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: mother.version, confirmReplace: Boolean(mother.body.trim()) }) });
      const applied = object(await applyResponse.json().catch(() => ({}))); if (!applyResponse.ok) throw new Error(text(applied.message) || text(applied.error) || "口播稿生成失败");
      const result = object(applied.motherContent); const next: MotherSnapshot = { ...mother, title: text(result.title), body: text(result.body), outline: stringArray(result.outline), version: typeof result.version === "number" ? result.version : mother.version + 1, origin: "KIMI", originNote: typeof result.originNote === "string" ? result.originNote : null, confirmedVersion: null, confirmedWarnings: [], draftConfirmed: false };
      const plan = object(applied.productionPlan) as ContentProductionPlan;
      const nextWarnings = Array.isArray(applied.warnings) ? applied.warnings.filter((item): item is DraftWarning => Boolean(item && typeof item === "object" && "message" in item)).map((item) => ({ ...item, reason: text((item as DraftWarning).reason), suggestion: text((item as DraftWarning).suggestion) })) : [];
      setLegacyMotherVersion(next.version); setMother((current) => ({ ...current, ...next, confirmedVersion: null, confirmedWarnings: [], draftConfirmed: false })); setProductionPlan(plan); setSelectedAngle(text(plan.recommendedAngle)); setSelectedTitle(next.title); setWarnings(nextWarnings); setConfirmedWarningKeys([]); setWarningsOpen(false); invalidateFeedback();
      await syncActiveDraft();
      setMotherMessage(mother.version ? "新的口播稿已生成" : "第一版口播稿已生成");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "口播稿生成失败";
      setMotherError(mother.version ? `${message} 原有口播稿仍然保留，可以稍后重试。` : `${message} 请稍后重试。`);
    }
    finally { motherGeneratingRef.current = false; setMotherGenerating(false); }
  }

  async function selectTitle(title: string) {
    if (!editableProject || title === mother.title) { setSelectedTitle(title); return; }
    setSelectedTitle(title); setMotherError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/drafts/${mother.draftBranchId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body: mother.body, outline: mother.outline, expectedVersion: mother.draftBranchVersion }) });
      const result = object(await response.json().catch(() => ({}))); if (!response.ok) throw new Error(text(result.message) || text(result.error) || "标题保存失败");
      const branch = result.branch as DraftBranchDTO; const legacy = object(result.legacyContent); const version = typeof legacy.version === "number" ? legacy.version : mother.version;
      if (mother.isPrimary) setLegacyMotherVersion(version);
      setDraftBranches((current) => current.map((item) => item.id === branch.id ? branch : item));
      setMother((current) => ({ ...current, title, version: current.isPrimary ? version : branch.currentRevision?.revision || current.version, draftBranchVersion: branch.version, draftRevision: branch.currentRevision?.revision || current.draftRevision, draftConfirmed: false, confirmedVersion: null, confirmedWarnings: [] })); setConfirmedWarningKeys([]); setWarningsOpen(false); if (mother.isPrimary) invalidateFeedback(); await refreshWarnings(`${title}\n${mother.body}`); setMotherMessage("标题已采用");
    } catch (cause) { setSelectedTitle(mother.title); setMotherError(cause instanceof Error ? cause.message : "标题保存失败"); }
  }

  function useReference(content: string) { setSupplement((current) => ({ ...current, coreMessage: [current.coreMessage.trim(), content].filter(Boolean).join("\n") })); setSupplementMessage("已放入“我的核心观点”，保存后生效"); }
  const effectiveVariants = variants.map((variant) => ({ ...variant, isStale: variant.sourceMotherVersion < legacyMotherVersion }));
  const projectMaterials: CanvasSourceOption[] = project.sources.map(({ addedAt, sourceItem }) => ({ id: sourceItem.id, title: sourceItem.title || sourceItem.displayName, description: sourceItem.description, summary: sourceItem.materialAnalysis?.summary || null, author: sourceItem.author, sourcePlatform: sourceItem.sourcePlatform, sourceType: sourceItem.sourceType, status: sourceItem.status, thumbnailUrl: sourceItem.thumbnailUrl, addedAt, updatedAt: sourceItem.updatedAt, tags: sourceItem.tags, imageAssets: sourceItem.assets.filter(({ assetType, status }) => assetType === "IMAGE" && status === "STORED") }));

  const sourceLabels = { CREATOR_PROFILE: "人物已确认信息", PROJECT_EVIDENCE: "已确认信息", MY_SUPPLEMENT: "我的补充", CURRENT_DRAFT: "当前稿件" } as const;
  const supplementCount = Object.values(supplement).filter((value) => value.trim()).length;
  const supplementSummary = supplement.coreMessage.trim() || supplement.background.trim() || "还没有补充我方观点或真实情况";
  const ourTake = initialPlan.coreMessage.trim() || initialPlan.angle.trim() || contextSummary.goal;
  const contextPanel = <div className="studio-context-stack">
    <header className="studio-context-heading"><h2>创作上下文</h2><span>本次写作使用</span></header>
    <section className="studio-context-hero"><p><Target size={15} />当前主题</p><h3>{contextSummary.topic}</h3><dl><div><dt>创作任务</dt><dd>{project.goal || "继续完善当前口播稿"}</dd></div><div><dt>我们的切入</dt><dd>{ourTake}</dd></div></dl><div><i>{mother.version ? "已进入创作" : "准备开始"}</i><i>资料 {project.sources.length}</i><i>已确认信息 {contextSummary.ownFacts.length}</i></div>{contextSummary.handoff === "BENCHMARK_TOPIC" ? <small>来自对标启发，外部内容只作参考。</small> : null}</section>
    <details className="studio-supplement-disclosure" open={supplementOpen} onToggle={(event) => setSupplementOpen(event.currentTarget.open)}><summary><PencilLine size={17} /><span><strong>我的补充 <i>{supplementCount} 项</i></strong><small>{supplementSummary}</small></span><b>{supplementCount ? "编辑 / 查看" : "补充我的观点"}</b><ChevronRight size={16} /></summary><div><BriefEditor value={supplement} editable={editableProject} busy={supplementBusy} message={supplementMessage} onChange={setSupplement} onSave={() => void saveSupplement()} /></div></details>
    <div className="studio-context-tabs" role="tablist" aria-label="创作上下文分类"><button role="tab" aria-selected={contextTab === "SOURCES"} onClick={() => setContextTab("SOURCES")}><LibraryBig size={15} />资料</button><button role="tab" aria-selected={contextTab === "FACTS"} onClick={() => setContextTab("FACTS")}><ShieldCheck size={15} />已确认信息</button><button role="tab" aria-selected={contextTab === "PERSON"} onClick={() => setContextTab("PERSON")}><UserRound size={15} />人物</button><button role="tab" aria-selected={contextTab === "METHODS"} onClick={() => setContextTab("METHODS")}><BookOpenCheck size={15} />创作方法</button></div>
    {contextTab === "SOURCES" ? <section className="studio-context-detail studio-context-surface"><StudioSources projectId={project.id} sources={project.sources} availableSources={availableSources} editable={editableProject} manageRequest={sourceManageRequest} onManageRequestHandled={() => setSourceManageRequest(0)} onUse={useReference} /></section> : null}
    {contextTab === "FACTS" ? <section className="studio-context-detail studio-context-surface"><div className="flex items-center justify-between"><h3>当前可用的已确认信息</h3><span>{contextSummary.ownFacts.length} 条</span></div>{contextSummary.ownFacts.length ? <ul>{contextSummary.ownFacts.map((fact, index) => <li key={`${fact.source}-${index}`}><p>{fact.text}</p><small><CheckCircle2 size={12} />可以直接使用 · {sourceLabels[fact.source]}</small></li>)}</ul> : <div className="studio-context-empty"><ShieldCheck size={20} /><p>还没有已确认的信息</p><span>可以继续写观点或明确的假设场景；需要结果支撑时再补真实案例或数据。</span></div>}</section> : null}
    {contextTab === "PERSON" ? <section className="studio-context-detail studio-context-surface"><h3>人物与表达</h3>{contextSummary.profile ? <div className="studio-profile-summary"><span><UserRound size={18} /></span><div><strong>{contextSummary.profile.displayName}</strong><p>{contextSummary.profile.positioning || "已有人物画像，详细信息可在设置中维护。"}</p><small>另有 {contextSummary.creatorUnderstandingCount} 项表达偏好和当前理解参与创作</small></div></div> : <div className="studio-context-empty"><UserRound size={20} /><p>暂未补充人物信息</p><span>保持空白即可，AI 不会因此虚构身份或经历。</span><Link href="/settings/creator-profile">补充人物信息</Link></div>}</section> : null}
    {contextTab === "METHODS" ? <div className="studio-method-context"><section className="studio-context-detail studio-context-surface"><div className="flex items-center justify-between"><h3>鑫世界默认创作方法</h3><Badge>{defaultMethod ? "当前已自动应用" : "未设置"}</Badge></div>{defaultMethod ? <ul className="studio-method-summary">{defaultMethod.sections.slice(0, 4).flatMap((section) => section.items.slice(0, 1)).map((item) => <li key={item.text}>{item.text}</li>)}</ul> : <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">当前没有已发布的默认创作方法。</p>}</section><StudioMethodSelector projectId={project.id} initial={methodState} editable={editableProject} openRequest={methodSelectRequest} onOpenRequestHandled={() => setMethodSelectRequest(0)} onChange={setMethodState} /></div> : null}
  </div>;
  const assistantPanel = ({ selectedObject, projectMaterials, canvasObjects, onObjectCreated }: CanvasAssistantContext) => <StudioDefaultMethod initialRequest={initialRequest} ref={assistantRef} projectId={project.id} recommendedActions={recommendedActions} editable={editableProject} configured={configured} selection={mother.isPrimary ? selection : null} selectedObject={selectedObject} targetArtifact={selectedObject ? null : activeArtifact} projectMaterials={projectMaterials} canvasObjects={canvasObjects} methods={methodState} onMethodsChange={setMethodState} onClose={() => toggleAssistant(false)} onObjectCreated={onObjectCreated} />;
  const contentCheck = warnings.length ? <details className={`studio-content-check ${unresolvedBlockingWarnings.length ? "has-blocker" : ""}`} open={warningsOpen} onToggle={(event) => setWarningsOpen(event.currentTarget.open)}><summary><span>{unresolvedBlockingWarnings.length ? <AlertTriangle size={17} /> : <CircleCheckBig size={17} />}</span><div><strong>内容检查已完成</strong><small>{unresolvedBlockingWarnings.length ? `${unresolvedBlockingWarnings.length} 处需要处理后再继续` : `${advisoryWarnings.length} 处建议留意，不影响继续创作`}</small></div><b>{warningsOpen ? "收起" : "查看详情"}</b><ChevronRight size={16} /></summary><div>{warnings.map((warning) => <article key={warningKey(warning)} className={isBlockingWarning(warning) ? "is-blocking" : ""}><span>{isBlockingWarning(warning) ? "需要处理" : "建议留意"}</span><p>{warning.message}</p><small>{warning.suggestion || warning.reason || "可以继续修改这处表达。"}</small></article>)}</div></details> : <div className="studio-content-check is-clear"><CircleCheckBig size={17} /><span><strong>内容检查已完成</strong><small>当前未发现需要留意的内容</small></span></div>;
  const emptyDraft = <section className="studio-empty-draft"><header><span>当前选题</span><h2>{contextSummary.topic}</h2></header><div className="studio-empty-draft-grid"><article><span>我们的切入</span><p>{ourTake}</p></article>{project.sources.length || contextSummary.ownFacts.length ? <article><span>当前可用信息</span><p>{project.sources.length ? `${project.sources.length} 条资料正在使用` : ""}{project.sources.length && contextSummary.ownFacts.length ? " · " : ""}{contextSummary.ownFacts.length ? `${contextSummary.ownFacts.length} 条已确认信息可以直接使用` : ""}</p></article> : null}</div><div className="studio-empty-draft-start"><strong>你可以从这里开始</strong><div><Button variant="secondary" onClick={() => setSupplementOpen(true)}><PencilLine size={16} />补充我的观点</Button><Button variant="secondary" onClick={() => setContextTab("SOURCES")}><LibraryBig size={16} />查看当前资料</Button>{configured && editableProject ? <Button disabled={motherGenerating} onClick={() => void generateMotherContent()}><Sparkles size={17} />{motherGenerating ? "正在生成…" : "直接生成第一版口播稿"}</Button> : null}</div></div>{!configured ? <p className="studio-empty-unavailable">内容生成服务暂时不可用，请联系管理员。</p> : null}<small>不会伪造大纲或我方经历；你的补充会优先进入创作。</small></section>;
  const draftEditor = <Card id="mother-content" className="studio-editor-card canvas-draft-editor">
    <header className="studio-document-header"><div><span>{mother.isPrimary ? "当前稿件" : "正在编辑"}</span><h1>{mother.draftBranchTitle}</h1><p>你的补充优先，外部内容只作为参考。</p></div><div><Badge>{hasWorkingDraft ? mother.draftConfirmed ? "已确认" : "已保存" : "空白稿"}</Badge><Button variant="secondary" onClick={() => setDraftsOpen(true)}>其他稿件</Button>{mother.draftRevision ? <><Button variant="ghost" onClick={() => setPreviewOpen(true)}><Eye size={15} />预览</Button><Button variant="secondary" disabled={draftBusy} onClick={() => void openDraftHistory()}>历史记录</Button><details className="studio-document-more"><summary aria-label="更多稿件操作"><MoreHorizontal size={17} /></summary><div><a href="#mother-outline">编辑大纲</a>{configured && editableProject && mother.isPrimary ? <button type="button" disabled={motherGenerating} onClick={() => void generateMotherContent()}>{motherGenerating ? "正在生成…" : "重新生成稿件"}</button> : null}</div></details></> : null}</div></header>
    {mother.isPrimary && productionPlan ? <details className="studio-plan-disclosure"><summary><span><strong>本次生成思路</strong><small>查看候选角度、标题和开场建议</small></span><ChevronRight size={16} /></summary><div><ContentProductionPreview plan={productionPlan} selectedAngle={selectedAngle} selectedTitle={selectedTitle} busy={motherGenerating} editable={editableProject} onAngleChange={setSelectedAngle} onTitleChange={(title) => void selectTitle(title)} onRegenerate={() => void generateMotherContent(selectedAngle)} /></div></details> : null}
    {contentCheck}{!hasWorkingDraft && configured && editableProject && mother.isPrimary ? <div className="mt-4 rounded-xl border border-dashed p-4"><p className="text-sm text-[var(--text-secondary)]">当前还是空白稿，可以先让创作方法生成第一版。</p><Button className="mt-3" disabled={motherGenerating} onClick={() => void generateMotherContent()}>{motherGenerating ? "正在生成…" : "直接生成第一版口播稿"}</Button></div> : null}{motherMessage ? <p role="status" className="mt-4 text-sm text-[var(--success)]">{motherMessage}</p> : null}{motherError ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{motherError}</p> : null}
    {mother.draftBranchId ? <><MotherContentEditor ref={editorRef} key={mother.draftBranchId} projectId={project.id} draftBranchId={mother.draftBranchId} initial={mother} editable={editableProject} onSelectionChange={setSelection} onSelectionAction={mother.isPrimary ? runSelectionAction : undefined} onSaved={(branchVersion, snapshot, nextLegacyVersion) => { if (nextLegacyVersion !== null) setLegacyMotherVersion(nextLegacyVersion); setMother((current) => ({ ...current, draftBranchVersion: branchVersion, title: snapshot.title, body: snapshot.body, outline: snapshot.outline, draftConfirmed: false, confirmedVersion: null, confirmedWarnings: [] })); setDraftBranches((current) => current.map((item) => item.id === mother.draftBranchId ? { ...item, version: branchVersion, confirmedRevisionId: null, updatedAt: new Date().toISOString(), workingState: { title: snapshot.title, body: snapshot.body, outline: snapshot.outline, origin: "HUMAN", originNote: null, generateRunId: null } } : item)); if (mother.isPrimary) invalidateFeedback(); setWarnings([]); setConfirmedWarningKeys([]); setWarningsOpen(false); void refreshWarnings(snapshot.body); }} />{mother.isPrimary && hasWorkingDraft ? <WorkflowHumanizeAction projectId={project.id} body={mother.body} version={mother.version} editable={editableProject} configured={configured} onApplied={(content) => { setMother((current) => ({ ...current, title: content.title, body: content.body, outline: content.outline, version: content.version, draftBranchVersion: current.draftBranchVersion + 1, draftRevision: current.draftRevision + 1, draftConfirmed: false, confirmedVersion: null, confirmedWarnings: [] })); setWarnings([]); setConfirmedWarningKeys([]); setWarningsOpen(false); void refreshWarnings(content.body); }} /> : null}<div className="studio-editor-actions"><Button disabled={!editableProject || unresolvedBlockingWarnings.length > 0 || !hasWorkingDraft || motherGenerating} onClick={() => void confirmMother()}>{unresolvedBlockingWarnings.length ? `处理 ${unresolvedBlockingWarnings.length} 处问题后继续` : mother.isPrimary ? "确认稿件，进入平台适配" : "确认这份稿件"}</Button></div>{mother.isPrimary && productionPlan ? <ShootabilityCheck plan={productionPlan} warningCount={blockingWarnings.length} /> : null}</> : emptyDraft}
  </Card>;
  const draftToolbar = <>{mother.draftRevision ? <><span className="draft-focus-save-state">{mother.draftBranchTitle}{mother.isPrimary ? " · 当前主稿" : ""}</span><button type="button" onClick={() => setPreviewOpen(true)}><Eye size={15} />预览</button><button type="button" disabled={draftBusy} onClick={() => void openDraftHistory()}>历史记录</button><button type="button" onClick={() => setDraftsOpen(true)}>其他稿件</button><details className="studio-document-more"><summary aria-label="更多稿件操作"><MoreHorizontal size={17} /></summary><div><a href="#mother-outline">编辑大纲</a>{configured && editableProject && mother.isPrimary ? <button type="button" disabled={motherGenerating} onClick={() => void generateMotherContent()}>{motherGenerating ? "正在生成…" : "重新生成稿件"}</button> : null}</div></details></> : <><span className="draft-focus-save-state">尚未开始</span><button type="button" onClick={() => setDraftsOpen(true)}>其他稿件</button></>}</>;

  return <>
    {artifacts.length ? <div className="project-artifact-entry" data-testid="generic-artifacts"><button type="button" aria-label="打开项目成果" onClick={() => { setArtifactWindowOpen(true); if (!activeArtifact && artifacts[0]) router.push(`/dashboard?project=${project.id}&node=artifact:${artifacts[0].artifactId}`, { scroll: false }); }}><BookOpenCheck size={15}/>成果 <small>{artifacts.length}</small></button></div> : null}
    {artifactWindowOpen ? <ArtifactWindow projectId={project.id} artifacts={artifacts} active={activeArtifact} canWrite={editableProject} onClose={() => { setArtifactWindowOpen(false); router.replace(`/dashboard?project=${project.id}`, { scroll: false }); }} onContinue={() => { setArtifactWindowOpen(false); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="和鑫小助说"]')?.focus()); }} /> : null}
    <ContentCanvas projectId={project.id} projectTitle={project.title} initialObjects={canvasObjects} sourceOptions={projectMaterials} editable={editableProject} brief={[contextSummary.topic, project.audience || initialPlan.audience || "受众待补充", initialPlan.coreQuestion || contextSummary.goal]} sources={project.sources.slice(0, 4).map(({ sourceItem }) => sourceItem.displayName)} facts={contextSummary.ownFacts.slice(0, 4).map(({ text }) => text)} methods={[...(defaultMethod ? ["鑫世界默认创作方法"] : []), ...methodState.selected.slice(0, 3).map(({ title }) => title)]} suggestions={recommendedActions.slice(0, 4).map(({ label }) => label)} draft={{ title: mother.draftBranchTitle, body: mother.body, version: mother.draftRevision, characters: mother.body.replace(/\s/g, "").length, updated: hasWorkingDraft ? "已保存" : "尚未开始" }} draftToolbar={draftToolbar} draftEditor={<>{draftEditor}{mother.isPrimary ? <CreationFeedback projectId={project.id} context={feedbackContext} editable={editableProject} /> : null}</>} contextTools={contextPanel} assistant={assistantPanel} assistantOpen={assistantOpen} layoutMode={layoutMode} onLayoutModeChange={setWorkbenchLayout} onAssistantOpen={toggleAssistant} onContextKindChange={openCanvasContext} onPlatform={(platform) => { if (!mother.isPrimary) { setMotherError("请先将这份稿件设为当前主稿，再进入平台适配。"); return; } setActivePlatform(platform as SupportedPlatform); setTab("PLATFORM"); }} />
    {tab === "PLATFORM" ? <div className="platform-focus-layer"><button type="button" aria-label="返回画布" onClick={() => setTab("CREATE")} /><section><header><div><span>平台适配</span><strong>选择一个平台继续</strong></div><Button variant="secondary" onClick={() => setTab("CREATE")}>返回画布</Button></header><nav aria-label="平台稿">{SUPPORTED_PLATFORMS.map((platform) => <button key={platform} className={activePlatform === platform ? "is-active" : ""} onClick={() => setActivePlatform(platform)}>{PLATFORM_LABELS[platform]}</button>)}</nav>{motherConfirmed ? <PlatformContentFactory projectId={project.id} activePlatform={activePlatform} motherVersion={legacyMotherVersion} variants={effectiveVariants} editable={editableProject} integrationStatus={ai.integrationStatus} motherConfirmed onSelectPlatform={setActivePlatform} onVariantChange={(variant) => setVariants((current) => [...current.filter((item) => item.platform !== variant.platform), variant])} /> : <Card className="p-6"><h2 className="font-semibold">请先确认当前口播稿</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">确认后选择一个平台生成；未选择的平台不会创建内容。</p></Card>}</section></div> : null}
    <StudioDrawer title={`${mother.draftBranchTitle} · 预览`} open={previewOpen} onClose={() => setPreviewOpen(false)}><article className="studio-document-preview"><h2>{mother.title || "未命名口播稿"}</h2><p>{mother.body || "当前还是空白稿。"}</p></article></StudioDrawer>
    <StudioDrawer title={`${mother.draftBranchTitle} · 历史记录`} open={historyOpen} onClose={() => setHistoryOpen(false)}><div className="grid gap-3">{motherHistory.map((item) => <details key={item.id} className="rounded-xl border p-4"><summary className="text-sm font-medium">{historyLabel(item.revision, item.current)}</summary><h3 className="mt-3 font-medium">{item.title || "未命名口播稿"}</h3><p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{item.body || "空白草稿"}</p></details>)}</div></StudioDrawer>
    <StudioDrawer title="其他稿件" open={draftsOpen} onClose={() => setDraftsOpen(false)} width="max-w-[30rem]">
      <section className="studio-draft-manager">
        {editableProject ? <div className="studio-draft-create"><label htmlFor="new-draft-title">新建稿件</label><input id="new-draft-title" value={newDraftTitle} maxLength={120} placeholder="例如：故事版" onChange={(event) => setNewDraftTitle(event.target.value)} /><div><Button variant="secondary" disabled={!newDraftTitle.trim() || draftBusy} onClick={() => void createDraft(false)}><FilePlus2 size={15} />从空白创建</Button><Button disabled={!newDraftTitle.trim() || draftBusy || !mother.draftRevision} onClick={() => void createDraft(true)}><Copy size={15} />从当前稿复制</Button></div></div> : null}
        <div className="studio-draft-list" role="list">{draftBranches.map((branch) => <article key={branch.id} className={branch.id === mother.draftBranchId ? "is-active" : ""} role="listitem"><button type="button" className="studio-draft-open" disabled={draftBusy} onClick={() => void openDraft(branch.id)}><span><strong>{branch.title}</strong><small>{branch.isPrimary ? "当前主稿" : branch.confirmedRevisionId === branch.currentRevisionId && branch.currentRevisionId ? "已确认" : branch.currentRevision ? "最近修改" : "空白稿"}</small></span><time>{branch.updatedAt.slice(0, 10)}</time></button>{editableProject ? <div className="studio-draft-actions">{!branch.isPrimary ? <button type="button" disabled={draftBusy} onClick={() => void makePrimary(branch)}>设为主稿</button> : null}<button type="button" disabled={draftBusy} onClick={() => void renameDraft(branch)}>重命名</button><button type="button" disabled={draftBusy || branch.isPrimary} title={branch.isPrimary ? "请先选择其他稿件作为主稿" : "删除稿件"} onClick={() => void deleteDraft(branch)}><Trash2 size={14} />删除</button></div> : null}</article>)}</div>
      </section>
    </StudioDrawer>
  </>;
}
