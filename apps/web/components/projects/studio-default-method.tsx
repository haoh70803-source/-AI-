"use client";

import { Button } from "@content-center/ui";
import { ArrowDown, AtSign, Copy, Plus, Check, ChevronDown, FileText, Link2, LoaderCircle, RefreshCw, Save, Search, Send, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { StudioActionRecommendation } from "@/server/ai/schemas";
import type { AssistantExecutionStatus, AssistantMessageDTO, AssistantResultAction, AssistantStreamEvent, NodeAssistantStreamEvent } from "@/lib/contracts/assistant";
import type { CanvasObjectDTO } from "@/lib/contracts/canvas";
import type { ProjectMaterial } from "./project-materials-panel";
import type { StudioSelectionAction } from "./mother-content-editor";
import { AssistantResultRenderer } from "./assistant-result-renderer";
import { AssistantMarkdown } from "./assistant-markdown";
import { NameDialog } from "../sidebar/name-dialog";
import type { ContextReference, ReferenceOption, ResearchCreationDraft } from "@/lib/contracts/references";
import type { LLMModelSelection } from "@/server/ai/llm-runtime";
import { cleanResearchDrafts, readProjectInput, writeProjectInput, readResearchHandoff, clearResearchHandoff } from "@/lib/research-creation-draft";
import { uploadSourceFiles } from "@/lib/source-upload-client";
import "./project-agent.css";
import type { ProjectMethodStateDTO } from "@/server/project-methods/service";
import type { ArtifactView } from "@/lib/contracts/artifacts";

const artifactDialogInteractionLock = () => undefined;

type TextSelection = { text: string; start: number; end: number };
type SelectedCanvasReference = { objectType: "CANVAS_OBJECT"; objectId: string; version: number; ownership: "EXTERNAL" | "PENDING"; whySelected: string; label: string };
export type StudioAssistantHandle = { executeSelection: (action: StudioSelectionAction) => void };
type Props = { initialRequest?: Record<string, unknown> & { content: string }; projectId: string; recommendedActions: StudioActionRecommendation[]; editable: boolean; configured: boolean; selection?: TextSelection | null; selectedObject?: SelectedCanvasReference | null; targetArtifact?: ArtifactView | null; projectMaterials: ProjectMaterial[]; canvasObjects: CanvasObjectDTO[]; methods: ProjectMethodStateDTO; onMethodsChange: (state: ProjectMethodStateDTO) => void; onClose: () => void; onObjectCreated: (object: CanvasObjectDTO) => void };

const actionPrompts: Record<StudioSelectionAction, string> = {
  HUMANIZE_TEXT: "请把这段内容改得更自然、更像本人表达：",
  SHORTEN_TEXT: "请精简这段内容，保留核心观点和依据：",
  ALTERNATIVE_EXPRESSION: "请换一种表达方式，不改变事实：",
  STRENGTHEN_EVIDENCE: "请检查这段内容还缺哪些真实依据，不要编造案例或数字：",
  FACT_CHECK: "请检查这段内容有没有把外部信息说成我们自己的信息：",
};

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.message || "操作失败，请重试。"), { status: response.status });
  return result;
}

// Align a settled reading position by at most one text line, without returning to the latest message.
function alignReadingEdge(element: HTMLDivElement) {
  if (element.scrollTop <= 0) return;
  const top = element.getBoundingClientRect().top + 2;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || node.parentElement?.closest(".agent-message-meta")) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width > 0 && rect.top < top && rect.bottom > top) {
        element.scrollTop = Math.max(0, element.scrollTop - Math.ceil(top - rect.top));
        return;
      }
    }
  }
}

export const StudioDefaultMethod = forwardRef<StudioAssistantHandle, Props>(function StudioDefaultMethod({ initialRequest, projectId, editable, configured, selection, selectedObject, targetArtifact, projectMaterials, canvasObjects, methods, onClose, onObjectCreated }, ref) {
  const router = useRouter();
  const startedProject = useRef<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [conversationUnavailable, setConversationUnavailable] = useState("");
  const [notice, setNotice] = useState("");
  const [artifactDialog, setArtifactDialog] = useState<{ message: AssistantMessageDTO; title: string } | null>(null);
  const [executionStatuses, setExecutionStatuses] = useState<AssistantExecutionStatus[]>([]);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [additionalObjectIds, setAdditionalObjectIds] = useState<string[]>([]);
  const [references, setReferences] = useState<ReferenceOption[]>([]);
  const [referenceResults, setReferenceResults] = useState<ReferenceOption[]>([]);
  const [skillId, setSkillId] = useState(methods.selected[0]?.methodVersionId || "");
  const [modelOptions, setModelOptions] = useState<Array<LLMModelSelection & { label: string }>>([]);
  const [defaultModelLabel, setDefaultModelLabel] = useState("默认模型");
  const [modelId, setModelId] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const requestByUser = useRef(new Map<string, Record<string, unknown>>());
  const lastRequest = useRef<Record<string, unknown> | null>(null);
  useEffect(() => { let active = true; void jsonRequest(`/api/projects/${projectId}/assistant/models`).then(r => { if (active) { setModelOptions(r.models || []); setDefaultModelLabel(r.defaultModelLabel || "默认模型"); } }).catch(() => {}); return () => { active = false; }; }, [projectId]);
  useEffect(() => { if (!materialOpen || selectedObject) return; const controller = new AbortController(); const timer = setTimeout(() => { void jsonRequest(`/api/projects/${projectId}/assistant/references?q=${encodeURIComponent(materialSearch)}`, { signal: controller.signal }).then(r => setReferenceResults(r.items || [])).catch(e => { if (!controller.signal.aborted) setError(e.message); }); }, 180); return () => { clearTimeout(timer); controller.abort(); }; }, [projectId, materialOpen, materialSearch, selectedObject]);
  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.length + references.length > 8) { setError("每轮最多引用 8 个对象。"); return; }
    setUploading(true); setError("");
    try { const results = await uploadSourceFiles(files); setReferences(current => [...current, ...results.filter(r => r.sourceItemId && r.status !== "FAILED").map(r => ({ sourceType: "MATERIAL" as const, sourceId: r.sourceItemId!, title: r.name, href: `/library/${r.sourceItemId}`, generated: false, description: "本次上传" }))].slice(0, 8)); setNotice(results.some(r => r.status === "QUEUED") ? "已上传，资料仍在读取中。准备好后即可引用正文。" : "上传完成。"); const failed = results.find(r => r.status === "FAILED"); if (failed) setError(failed.message || "部分文件上传失败。"); }
    catch (e) { setError(e instanceof Error ? e.message : "上传失败。"); } finally { setUploading(false); }
  }
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const followOutput = useRef(true);
  const scrollSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollToLatest = () => { followOutput.current = true; setShowScrollDown(false); const element = streamRef.current; if (element) { element.scrollTop = element.scrollHeight; alignReadingEdge(element); } };
  useEffect(() => { const element = composerRef.current; if (element) { element.style.height = "auto"; element.style.height = `${Math.min(180, Math.max(52, element.scrollHeight))}px`; } }, [input]);

  const [draftScope,setDraftScope] = useState<{ workspaceId:string; userId:string; projectId:string } | null>(null);
  const [researchPending,setResearchPending] = useState<ResearchCreationDraft | null>(null);
  const [replaceResearchInput,setReplaceResearchInput] = useState(false);
  const [handoffBusy,setHandoffBusy] = useState(false);
  const handoffLock = useRef(false), handoffSeen = useRef(false);
  useEffect(()=>{handoffSeen.current=false;},[projectId]);
  const currentComposer = useRef({input,references,materialIds,skillId,modelId});
  currentComposer.current={input,references,materialIds,skillId,modelId};
  useEffect(() => {
    setDraftScope(null); setResearchPending(null);
    if (loading || selectedObject || conversationUnavailable) return;
    const signature=JSON.stringify(currentComposer.current), controller = new AbortController();
    void jsonRequest("/api/research/creation?projectId=" + encodeURIComponent(projectId),{signal:controller.signal}).then(target => {
      if(controller.signal.aborted)return;
      cleanResearchDrafts(target.actor);
      const scope={...target.actor,projectId}, stored=readProjectInput(scope), pending=readResearchHandoff(scope);
      setDraftScope(scope);
      if(JSON.stringify(currentComposer.current)===signature){
      if(stored){setInput(stored.input);setReferences(stored.references);setMaterialIds(stored.materialIds);setSkillId(stored.skillId);setModelId(stored.modelId);}
      else {setInput("");setReferences([]);setMaterialIds([]);}
      }
      if(pending){handoffSeen.current=true;setResearchPending(pending);}
    }).catch(cause=>{if(!controller.signal.aborted){if(cause.status===401)cleanResearchDrafts();setNotice(cause.message || "临时输入未能恢复，未自动发送任何内容。");}});
    return()=>controller.abort();
  },[projectId,loading,selectedObject?.objectId,conversationUnavailable]);
  useEffect(()=>{
    if(!draftScope||draftScope.projectId!==projectId||selectedObject||loading)return;
    const scope=draftScope,draft={input,references,materialIds,skillId,modelId};
    if(!writeProjectInput(scope,draft))setNotice("临时草稿存储不可用，离开前请保留当前输入。");
  },[draftScope,projectId,selectedObject?.objectId,loading,input,references,materialIds,skillId,modelId]);
  function cancelResearchDraft(){
    if(draftScope)clearResearchHandoff(draftScope);
    setResearchPending(null);composerRef.current?.focus();setNotice("已取消本次带入，原输入与引用保留，没有分享研究。");
  }
  async function acceptResearchDraft(replace:boolean){
    if(!researchPending||!draftScope||handoffLock.current||selectedObject||sending||loading)throw Error("请稍后再试。");
    if(researchPending.expiresAt<=Date.now()){cancelResearchDraft();throw Error("这次准备已过期，请回研究页重新带入。");}
    handoffLock.current=true;setHandoffBusy(true);
    try{
      const next=await jsonRequest("/api/research/creation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,resultId:researchPending.reference.sourceId,selection:researchPending.reference.researchSelection,content:researchPending.content})}) as ResearchCreationDraft;
      const old=references.find(item=>item.sourceType===next.reference.sourceType&&item.sourceId===next.reference.sourceId);
      if(old&&JSON.stringify(old.researchSelection)!==JSON.stringify(next.reference.researchSelection))throw Error("当前已有同一研究的其他引用。请先移除旧引用，再带入选中的结论。");
      const merged=old?references:[...references,next.reference];
      const text=replace?next.content:[input,next.content].filter(value=>value.trim()).join("\n\n");
      if(text.length>4000||merged.length+materialIds.length>8)throw Error("现有输入或引用较多，请先调整；当前内容与本次准备都已保留。");
      const draft={input:text,references:merged,materialIds,skillId,modelId};
      writeProjectInput(draftScope,draft);
      setInput(text);setReferences(merged);clearResearchHandoff(draftScope);setResearchPending(null);
      setNotice("已放入待发送内容，原研究未改动、未分享。审阅后由你发送。");composerRef.current?.focus();
    }finally{handoffLock.current=false;setHandoffBusy(false);}
  }

  const lastPromptRef = useRef("");
  const createdObjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const preserveCreatedResult = selectedObject?.objectId === createdObjectIdRef.current;
    setLoading(true); followOutput.current = true;
    setConversationUnavailable("");
    if (!preserveCreatedResult) { setMessages([]); setError(""); setExecutionStatuses([]); }
    const url = selectedObject ? `/api/projects/${projectId}/canvas/objects/${selectedObject.objectId}/assistant` : `/api/projects/${projectId}/assistant`;
    void jsonRequest(url).then((thread: { messages?: AssistantMessageDTO[]; unavailableReason?: string }) => { if (!active) return; setConversationUnavailable(thread.unavailableReason ?? ""); if (thread.messages?.length || !preserveCreatedResult) setMessages(thread.messages ?? []); if (preserveCreatedResult) createdObjectIdRef.current = null; }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "对话记录加载失败。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; abortRef.current?.abort(); };
  }, [projectId, selectedObject?.objectId]);

  useLayoutEffect(() => {
    const element = streamRef.current;
    if (element && followOutput.current) { element.scrollTop = element.scrollHeight; alignReadingEdge(element); }
  }, [messages, sending, loading]);
  useEffect(() => {
    const element = streamRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (followOutput.current) element.scrollTop = element.scrollHeight; alignReadingEdge(element); });
    observer.observe(element);
    return () => { observer.disconnect(); if (scrollSettle.current) clearTimeout(scrollSettle.current); };
  }, []);

  const visibleMaterials = useMemo(() => {
    const needle = materialSearch.trim().toLocaleLowerCase("zh-CN");
    return projectMaterials.filter((source) => !needle || [source.title, source.description, source.summary, source.author].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(needle)).slice(0, 20);
  }, [materialSearch, projectMaterials]);
  const visibleCanvasObjects = useMemo(() => { const needle = materialSearch.trim().toLocaleLowerCase("zh-CN"); return canvasObjects.filter((object) => object.id !== selectedObject?.objectId && !object.deletedAt && (!needle || [object.title, object.textContent].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(needle))).slice(0, 12); }, [canvasObjects, materialSearch, selectedObject?.objectId]);

  const send = async (override?: string, retryBody?: Record<string, unknown>) => {
    const content = (override ?? input).trim();
    if (!content || sending || uploading || !configured || conversationUnavailable || (selectedObject && !editable)) return;
    followOutput.current = true; setShowScrollDown(false);
    setSending(true); setError(""); setNotice(""); lastPromptRef.current = content;
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const url = selectedObject ? `/api/projects/${projectId}/canvas/objects/${selectedObject.objectId}/assistant` : `/api/projects/${projectId}/assistant`;
      const body = retryBody ?? (selectedObject ? { instruction: content, ...(additionalObjectIds.length ? { additionalObjectIds } : {}), ...(materialIds.length ? { sourceItemIds: materialIds } : {}) } : { content, references: references.map(({ sourceType, sourceId, researchSelection }): ContextReference => ({ sourceType, sourceId, ...(researchSelection ? { researchSelection } : {}) })), skillVersionId: skillId || null, modelSelection: modelOptions.find(m => m.modelId === modelId) ? { provider: modelOptions.find(m => m.modelId === modelId)!.provider, modelId } : null, ...(targetArtifact ? { targetArtifactId: targetArtifact.artifactId } : {}), ...(materialIds.length ? { sourceItemIds: materialIds } : {}) });
      lastRequest.current = body;
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok || !response.body) { const body = await response.json().catch(() => ({})); throw new Error(body.message || "当前 AI 服务暂时不可用，请稍后再试。"); }
      setInput(""); setReferences([]); setMaterialIds([]); setAdditionalObjectIds([]); setMaterialOpen(false);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let terminal = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((part) => part.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as AssistantStreamEvent | NodeAssistantStreamEvent;
          if (event.type === "start") { requestByUser.current.set(event.userMessage.id, body); setExecutionStatuses([]); setMessages((current) => [...current, event.userMessage, event.assistantMessage]); }
          else if (event.type === "status") setExecutionStatuses((current) => [...current, event.status]);
          else if (event.type === "delta") setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, status: "STREAMING", content: message.content + event.delta } : message));
          else if (event.type === "done" || event.type === "stopped") { terminal = true; setMessages((current) => current.map((message) => message.id === event.message.id ? event.message : message)); if (event.type === "done" && "resultObject" in event) { createdObjectIdRef.current = event.resultObject.id; onObjectCreated(event.resultObject); } }
          else if (event.type === "error") { terminal = true; setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, status: "FAILED" } : message)); setError(event.message); }
        }
      }
      if (!terminal) throw new Error("连接已中断，可以重新生成这条回复。");
      if (!selectedObject) {
        const restored = await jsonRequest(url) as { messages?: AssistantMessageDTO[] };
        setMessages(restored.messages ?? []);
      }
    } catch (cause) {
      if (controller.signal.aborted) setMessages((current) => current.map((message) => message.status === "STREAMING" || message.status === "PENDING" ? { ...message, status: "STOPPED" } : message));
      else { setError(cause instanceof Error ? cause.message : "当前 AI 服务暂时不可用，请稍后再试。"); setMessages(current => current.map(m => m.status === "STREAMING" || m.status === "PENDING" ? { ...m, status: "FAILED" } : m)); }
    } finally { if (abortRef.current === controller) abortRef.current = null; setSending(false); }
  };

  useEffect(() => {
    if (!draftScope || handoffSeen.current || researchPending || !initialRequest || loading || !configured || conversationUnavailable || selectedObject || messages.length || error || startedProject.current === projectId) return;
    startedProject.current = projectId;
    void send(initialRequest.content, initialRequest);
  }, [initialRequest, loading, configured, conversationUnavailable, selectedObject, messages.length, error, projectId, draftScope, researchPending]);

  useImperativeHandle(ref, () => ({ executeSelection: (action) => { if (selection) void send(`${actionPrompts[action]}\n\n${selection.text}`); } }));

  const saveResult = async (message: AssistantMessageDTO, action: AssistantResultAction, topicIndex?: number) => {
    setError(""); setNotice("");
    try {
      if (action === "CREATE_ARTIFACT") {
        const fallbackTitle = message.content.split(/\r?\n/u).map((line) => line.replace(/^#+\s*/u, "").trim()).find(Boolean)?.slice(0, 80) || "文本产出";
        setArtifactDialog({ message, title: fallbackTitle });
        return;
      }
      if (action === "APPLY_ARTIFACT") {
        if (!targetArtifact || message.artifactId !== targetArtifact.artifactId) throw new Error("当前修改结果与选中的产出不一致，请刷新后重试。");
        await jsonRequest(`/api/projects/${projectId}/artifacts/${targetArtifact.artifactId}/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceMessageId: message.id, expectedVersion: targetArtifact.version }) });
        setNotice("已应用到当前产出，并保留上一版本。");
        router.refresh();
        return;
      }
      const result = await jsonRequest(`/api/projects/${projectId}/assistant/messages/${message.id}/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(topicIndex === undefined ? {} : { topicIndex }) }) }) as { object?: CanvasObjectDTO };
      if (result.object) onObjectCreated(result.object);
      setNotice(action === "TEXT" ? "已保存到画布，并选中新文本。" : action === "TOPIC" ? "已保存到选题库。" : "已创建新的候选稿，不会覆盖主稿。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试。"); }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } };

  return <div className={`studio-project-assistant ${!selectedObject ? "agent-chat" : ""}`} data-testid="studio-project-assistant" data-draft-ready={Boolean(draftScope)&&!loading}>
    {artifactDialog ? <NameDialog title="保存为项目成果" description="保存后，该工作空间有读取权限的有效成员（含只读成员）可见。请检查正文中是否包含不希望共享的个人信息；取消不会保存。" initialValue={artifactDialog.title} confirmLabel="保存成果" onInteractionLockChange={artifactDialogInteractionLock} onClose={() => setArtifactDialog(null)} onSave={async title => {
      const artifact = await jsonRequest(`/api/projects/${projectId}/artifacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "TEXT", title, sourceMessageId: artifactDialog.message.id }) }) as ArtifactView;
      setNotice("已保存为独立文本产出。");
      router.push(`/dashboard?project=${projectId}&node=artifact:${artifact.artifactId}`);
    }} /> : null}
    {sending && executionStatuses.length ? <p className="agent-status" role="status">{executionStatuses.at(-1)?.message}</p> : null}
    <div className="studio-assistant-stream" ref={streamRef} onScroll={() => { const e = streamRef.current; if (e) { const nearBottom = e.scrollHeight - e.scrollTop - e.clientHeight < 64; followOutput.current = nearBottom; setShowScrollDown(!nearBottom); if (scrollSettle.current) clearTimeout(scrollSettle.current); scrollSettle.current = setTimeout(() => alignReadingEdge(e), 140); } }} aria-live="polite">
      {loading ? <div className="studio-assistant-loading"><LoaderCircle size={18} />正在载入项目对话…</div> : null}
      {!loading && !messages.length ? <section className="studio-assistant-empty"><strong>{targetArtifact ? `继续完善“${targetArtifact.title}”` : selectedObject ? `基于“${selectedObject.label}”继续` : "今天想先做什么？"}</strong><p>直接告诉我你的想法，或用 @ 引用资料和研究成果。</p></section> : null}
      {messages.map((message, index) => <article key={message.id} className={`studio-assistant-message is-${message.role.toLowerCase()} is-${message.status.toLowerCase()} ${message.role === "ASSISTANT" && message.structuredResult ? "has-structured-result" : ""}`}>
        <header className="agent-message-meta"><strong>{message.role === "USER" ? "你" : "鑫小助"}</strong><time>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>{message.status === "STREAMING" ? <span><i />正在回复</span> : message.status === "STOPPED" ? <span>已停止</span> : message.status === "FAILED" ? <span>未完成</span> : null}</header>
        {message.role === "ASSISTANT" && !selectedObject ? <AssistantMarkdown message={message} /> : message.role === "ASSISTANT" ? <AssistantResultRenderer message={message} onContinue={(instruction) => void send(instruction)} onTopicContinue={(topic) => void send(`继续展开这个选题：${topic.title}${topic.angle ? `。切入角度：${topic.angle}` : ""}`)} onTopicSave={(topicIndex) => void saveResult(message, "TEXT", topicIndex)} /> : <div className="studio-assistant-message-content">{message.content || (message.status === "PENDING" ? "正在准备项目上下文…" : "")}</div>}
        {message.warnings.length ? <div className="studio-assistant-warnings" role="alert"><strong>需要确认</strong>{message.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
        {message.sources.length ? <details id={`sources-${message.id}`} className="studio-assistant-citations"><summary>已参考 {message.sources.length} 个来源<ChevronDown size={14} /></summary><div>{message.sources.map((source, sourceIndex) => <section id={`source-${message.id}-${source.citation}`} key={`${source.title}-${sourceIndex}`}><span>[{source.citation || sourceIndex + 1}] {source.type}</span><strong>{source.reference ? <a href={source.reference.href}>{source.title}</a> : source.title}</strong><p title={source.excerpt}>{source.reference?.anchor || source.excerpt}</p></section>)}</div></details> : null}
        {message.role === "ASSISTANT" ? <footer className="agent-actions">
          <button type="button" aria-label="复制回答" title="复制回答" disabled={!message.content} onClick={() => void navigator.clipboard.writeText(message.content).then(() => setNotice("已复制。")).catch(() => setError("复制失败，请手动选择文本。"))}><Copy size={15} /></button>
          {message.status === "COMPLETED" && !selectedObject && (!message.artifactId || message.actions.includes("APPLY_ARTIFACT") && message.artifactId === targetArtifact?.artifactId) ? <button type="button" aria-label={message.artifactId && targetArtifact ? "应用到当前成果" : "保存为成果"} title={message.artifactId && targetArtifact ? "应用到当前成果" : "保存为成果"} disabled={!editable} onClick={() => void saveResult(message, message.artifactId && targetArtifact ? "APPLY_ARTIFACT" : "CREATE_ARTIFACT")}><Save size={15} /></button> : null}
          <button type="button" aria-label="重新生成" title="重新生成" disabled={sending || Boolean(conversationUnavailable)} onClick={() => { const previous = messages.slice(0, index).reverse().find(m => m.role === "USER"); void send(previous?.content || lastPromptRef.current, previous && !selectedObject ? { content: previous.content, retryUserMessageId: previous.id } : previous ? requestByUser.current.get(previous.id) : lastRequest.current || undefined); }}><RefreshCw size={15} /></button>
        </footer> : null}
      </article>)}
    </div>

    {showScrollDown ? <button className="agent-scroll-latest" type="button" aria-label="回到最新消息" title="回到最新消息" onClick={scrollToLatest}><ArrowDown size={17} /></button> : null}
    <div className="studio-assistant-references">
      {references.map(r => <span key={`${r.sourceType}:${r.sourceId}`}>{r.title}<button type="button" aria-label={`移除 ${r.title}`} onClick={() => setReferences(current => current.filter(v => v !== r))}><X size={13} /></button></span>)}
      {targetArtifact ? <span><FileText size={14} />当前产出：{targetArtifact.title} · v{targetArtifact.version}</span> : null}
      {selectedObject ? <span><FileText size={14} />当前正在基于：{selectedObject.label}</span> : null}
      {additionalObjectIds.map((id) => { const object = canvasObjects.find((item) => item.id === id); return object ? <span key={id}><Link2 size={14} />{object.title || "未命名内容"}<button type="button" aria-label={`移除内容 ${object.title || "未命名内容"}`} onClick={() => setAdditionalObjectIds((current) => current.filter((value) => value !== id))}><X size={13} /></button></span> : null; })}
      {materialIds.map((id) => { const source = projectMaterials.find((item) => item.id === id); return source ? <span key={id}><Link2 size={14} />{source.title}<button type="button" aria-label={`移除资料 ${source.title}`} onClick={() => setMaterialIds((current) => current.filter((value) => value !== id))}><X size={13} /></button></span> : null; })}
    </div>


    {researchPending ? <section className="agent-research-handoff" aria-label="审阅研究带入内容">
      <h3>研究发现已准备好，尚未发送</h3>
      <p>{researchPending.conversationVisibility}</p>
      <strong>{researchPending.reference.title} · 已选 {researchPending.reference.researchSelection?.items.length} 条结论</strong>
      <details><summary>查看本次结论与创作意图</summary><p>{researchPending.content}</p>{researchPending.reference.researchSelection?.items.map(item=><p key={item.id}>{item.text}</p>)}</details>
      <p>现有输入、引用、资料和专业技能选择会保留。没有自动保存研究成果或调用模型。</p>
      <button type="button" disabled={handoffBusy||sending||loading||Boolean(conversationUnavailable)} onClick={()=>void acceptResearchDraft(false).catch(cause=>setError(cause.message))}>{input.trim()?"追加到现有输入":"放入待发送内容"}</button>
      {input.trim()?<button type="button" disabled={handoffBusy||sending||loading} onClick={()=>setReplaceResearchInput(true)}>替换输入文字…</button>:null}
      <button type="button" disabled={handoffBusy} onClick={cancelResearchDraft}>取消带入，保留原输入</button>
    </section>:null}
    {replaceResearchInput ? <NameDialog title="替换当前输入？" confirmOnly description="只替换输入文字，已有引用、资料和专业技能选择仍保留。不会发送、分享或调用模型。" confirmLabel="确认替换文字" onInteractionLockChange={artifactDialogInteractionLock} onClose={()=>{setReplaceResearchInput(false);composerRef.current?.focus();}} onSave={async()=>{await acceptResearchDraft(true);}}/>:null}

    {materialOpen && selectedObject ? <section className="studio-assistant-material-picker"><header><strong>添加引用</strong><button type="button" aria-label="关闭引用选择" onClick={() => setMaterialOpen(false)}><X size={16} /></button></header><label><Search size={14} /><input autoFocus value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="搜索画布内容或当前创作资料" /></label><div>{selectedObject && visibleCanvasObjects.length ? <p>画布内容</p> : null}{selectedObject ? visibleCanvasObjects.map((object) => <button type="button" key={object.id} aria-pressed={additionalObjectIds.includes(object.id)} onClick={() => setAdditionalObjectIds((current) => current.includes(object.id) ? current.filter((id) => id !== object.id) : [...current, object.id].slice(-5))}><FileText size={15} /><span><strong>{object.title || "未命名内容"}</strong><small>{object.textContent || (object.generatedFrom.length ? `基于 ${object.generatedFrom.length} 项内容生成` : "画布内容")}</small></span>{additionalObjectIds.includes(object.id) ? <Check size={15} /> : null}</button>) : null}{visibleMaterials.length ? <p>当前创作资料</p> : null}{visibleMaterials.map((source) => <button type="button" key={source.id} aria-pressed={materialIds.includes(source.id)} onClick={() => setMaterialIds((current) => current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id].slice(-8))}><FileText size={15} /><span><strong>{source.title}</strong><small>{source.summary || source.description || "尚未整理摘要"}</small></span>{materialIds.includes(source.id) ? <Check size={15} /> : null}</button>)}</div></section> : null}

    {materialOpen && !selectedObject ? <section className="studio-assistant-material-picker"><header><strong>引用已有内容</strong><button type="button" aria-label="关闭引用选择" onClick={() => setMaterialOpen(false)}><X size={15} /></button></header><input aria-label="搜索引用" autoFocus value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} placeholder="搜索资料、研究、成果、对标账号、趋势" /><div className="agent-reference-results">{referenceResults.map(r => <button type="button" key={`${r.sourceType}:${r.sourceId}`} onClick={() => { setReferences(current => current.some(v => v.sourceType === r.sourceType && v.sourceId === r.sourceId) ? current : [...current, r].slice(0, 8)); setMaterialOpen(false); setInput(value => value.replace(/@[^@\s]*$/, "")); }}><FileText size={15} /><span><strong>{r.title}</strong><small>{({ MATERIAL: "资料", RESEARCH: "研究成果", ARTIFACT: "成果", BENCHMARK: "对标账号", TREND: "趋势", KNOWLEDGE: "知识库" })[r.sourceType]} · {r.description}</small></span></button>)}{!referenceResults.length ? <p>没有匹配的可用内容。</p> : null}</div></section> : null}
    {conversationUnavailable ? <p className="studio-assistant-error" role="status">{conversationUnavailable}</p> : null}
    {!editable ? <p role="status">你可以查看获准内容，不能上传资料、保存候选或修改项目成果。</p> : null}
    {error ? <p className="studio-assistant-error" role="alert">{error}</p> : null}{notice ? <p className="studio-assistant-success" role="status">{notice}</p> : null}
    {!configured ? <p className="studio-assistant-error">当前 AI 服务暂时不可用，请稍后再试。</p> : null}
    <footer className="studio-assistant-composer">
      <textarea ref={composerRef} aria-label="和鑫小助说" value={input} disabled={Boolean(conversationUnavailable) || Boolean(selectedObject && !editable)} onChange={(event) => { setInput(event.target.value); const mention = event.target.value.match(/@([^@\s]*)$/); if (mention && !selectedObject) { setMaterialOpen(true); setMaterialSearch(mention[1] || ""); } }} onKeyDown={onComposerKeyDown} rows={2} maxLength={4_000} placeholder={selectedObject ? "基于当前内容，你想继续生成什么？" : "继续告诉 AI 你想做什么……"} />
      <div className="agent-composer-tools">
        <input ref={uploadRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp4,.mp3,.wav" onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ""; }} />
        <button type="button" aria-label="上传文件或图片" title="上传文件或图片" disabled={uploading || !editable} onClick={() => uploadRef.current?.click()}>{uploading ? <LoaderCircle size={17} /> : <Plus size={17} />}</button>
        <button type="button" aria-label="引用已有内容" title="引用已有内容" aria-expanded={materialOpen} onClick={() => setMaterialOpen(v => !v)}><AtSign size={17} /></button>
        <select aria-label="选择 Skill" value={skillId} onChange={e => setSkillId(e.target.value)}><option value="">不使用专业技能</option>{[...new Map([...methods.selected, ...methods.available].map(m => [m.methodVersionId, m])).values()].map(m => <option key={m.methodVersionId} value={m.methodVersionId}>{m.title}</option>)}</select>
        <select className="agent-model" aria-label="选择模型" value={modelId} onChange={e => setModelId(e.target.value)}><option value="">{defaultModelLabel}</option>{modelOptions.map(m => <option key={m.modelId} value={m.modelId}>{m.label}</option>)}</select>
        {sending ? <button type="button" aria-label="停止生成" title="停止生成" onClick={() => abortRef.current?.abort()}><Square size={16} /></button> : <Button aria-label="发送给鑫小助" disabled={!input.trim() || uploading || !configured || Boolean(conversationUnavailable)} onClick={() => void send()}><Send size={16} /></Button>}
      </div>
    </footer>
    <button type="button" className="studio-assistant-mobile-close" onClick={onClose}>收起鑫小助</button>
  </div>;
});
