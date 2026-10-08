"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchBlock } from "@content-center/core";
import type { ResearchCreationDraft, ResearchSelection } from "@/lib/contracts/references";
import { writeResearchHandoff, cleanResearchDrafts, readResearchChoice, writeResearchChoice } from "@/lib/research-creation-draft";
import { guardedArtifactNavigation } from "../projects/use-artifact-editor";
type SourceView = { actor: { userId: string; workspaceId: string }; kind: "run" | "study"; version: number; title: string; blocks: ResearchBlock[]; saved: boolean; sessionId: string | null; projects: Array<{ id: string; title: string }> };
type Preview = { body: string; blockCount?: number; sourceCount?: number; omitted?: number };
async function request(url: string, body?: unknown, signal?: AbortSignal) {
 const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
 const data = await response.json().catch(() => ({})); if (!response.ok) throw Error(data.message || "暂时无法完成，请重试。"); return data;
}
export function ResearchUseFindings({ resultId, kind = "run", canWrite }: { resultId: string; kind?: "run" | "study"; canWrite: boolean }) {
 const pickedFinding = useRef<string | null>(null), findingTrigger = useRef<HTMLButtonElement | null>(null);
 const router = useRouter(), lock = useRef(false), action = useRef<string | null>(null), requestController = useRef<AbortController | null>(null), createTrigger = useRef<HTMLButtonElement>(null), shareTrigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
 const [ready,setReady] = useState(false);
 useEffect(()=>{setReady(true);},[]);


 const [mode,setMode] = useState<"create" | "share" | null>(null), [data,setData] = useState<SourceView | null>(null);
 const [loading,setLoading] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState(""),[notice,setNotice] = useState("");
 const [projectId,setProjectId] = useState(""),[items,setItems] = useState<Array<{id:string;text:string}>>([]);
 const [content,setContent] = useState("请使用本次挑选的研究发现，帮我创作一份适合自己的内容。");
 const [preview,setPreview] = useState<Preview | null>(null),[workspaceName,setWorkspaceName] = useState(""),[reviewed,setReviewed] = useState(false),[existingArtifact,setExistingArtifact] = useState("");
 useEffect(() => {
   function choose(event: Event) {
     const detail = (event as CustomEvent<{ resultId: string; kind: string; blockId: string; trigger?: HTMLButtonElement }>).detail;
     if (!detail || detail.resultId !== resultId || detail.kind !== kind || lock.current) return;
     pickedFinding.current = detail.blockId; findingTrigger.current = detail.trigger || null;
     if (data) { const block = data.blocks.find(item => item.id === detail.blockId && item.type === "text"); if (!block || block.type !== "text") return; setItems([{ id: block.id, text: block.text }]); pickedFinding.current = null; }
     setMode("create"); invalidate(); setNotice("");
     requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
   }
   window.addEventListener("research:select-finding", choose);
   return () => window.removeEventListener("research:select-finding", choose);
 }, [data, kind, resultId]);
 useEffect(()=>()=>requestController.current?.abort(),[]);
 useEffect(()=>{setData(null);setItems([]);setProjectId("");setPreview(null);setReviewed(false);setExistingArtifact("");setMode(window.location.hash==="#creation-preview"?"create":null);setError("");setNotice("");},[kind,resultId]);
 useEffect(() => {
   if (!mode || data) return; const controller=new AbortController();setLoading(true);setError("");
   void request("/api/research/creation?kind="+kind+"&resultId="+encodeURIComponent(resultId),undefined,controller.signal).then((value:SourceView)=>{
     if(controller.signal.aborted)return;cleanResearchDrafts(value.actor);const stored=readResearchChoice(value.actor,kind,resultId,value.version);setData(value);const picked = pickedFinding.current ? value.blocks.find(block => block.id === pickedFinding.current && block.type === "text") : null; pickedFinding.current = null; if(picked?.type === "text"){setItems([{id:picked.id,text:picked.text}]);}else if(stored){setItems(stored.items);setContent(stored.content);setProjectId(value.projects.some(project=>project.id===stored.projectId)?stored.projectId:"");}else setItems([]);
   }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
   return()=>controller.abort();
 },[mode,data,kind,resultId]);
 useEffect(()=>{if(!data)return;const actor=data.actor;const draft={version:data.version,items,content,projectId};writeResearchChoice(actor,kind,resultId,draft);return()=>{writeResearchChoice(actor,kind,resultId,draft);};},[data,kind,resultId,items,content,projectId]);
 useEffect(()=>{if(!data)return;const timer=setInterval(()=>cleanResearchDrafts(data.actor),60000);return()=>clearInterval(timer);},[data]);
 useEffect(()=>{if(mode)panel.current?.querySelector<HTMLButtonElement>("button")?.focus();},[mode]);
 function closePrepare(){if(["share","private-save"].includes(action.current||""))return;requestController.current?.abort();pickedFinding.current=null;const trigger=mode==="share"?shareTrigger:createTrigger;setMode(null);invalidate();requestAnimationFrame(()=>{(findingTrigger.current || trigger.current)?.focus();findingTrigger.current=null;});}
 function invalidate(){setPreview(null);setReviewed(false);setExistingArtifact("");setError("");}
 const selection:ResearchSelection={kind,version:data?.version||1,items};

 async function savePrivate(){
   if(!data?.sessionId||data.saved||!canWrite||lock.current)return;lock.current=true;action.current="private-save";setBusy(true);setError("");
   try{await request("/api/research/sessions/"+data.sessionId+"/runs/"+resultId,{});setData(current=>current?{...current,saved:true}:current);setNotice("原研究已保存到我的研究，仅你可见。选中结论的调整没有覆盖原研究。");}
   catch(cause){setError(cause instanceof Error?cause.message:"保存未完成，当前选择仍保留。");}finally{lock.current=false;action.current=null;setBusy(false);}
 }

 async function preparePreview(){
   if(!projectId||!items.length||lock.current)return;lock.current=true;action.current="preview";const controller=new AbortController();requestController.current=controller;setBusy(true);setError("");
   try{const value=await request("/api/research/creation",{mode:"preview",projectId,resultId,selection},controller.signal);if(controller.signal.aborted)return;setPreview(value.preview);setWorkspaceName(value.workspaceName);setExistingArtifact(value.existingArtifact?.artifactId||"");setReviewed(false);}
   catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"预览暂时无法读取。");}finally{lock.current=false;action.current=null;setBusy(false);}
 }
 async function bring(){
   if(!projectId||!items.length||!content.trim()||lock.current)return;lock.current=true;action.current="create";const controller=new AbortController();requestController.current=controller;setBusy(true);setError("");
   try{
     const draft=await request("/api/research/creation",{projectId,resultId,selection,content},controller.signal) as ResearchCreationDraft;
     if(controller.signal.aborted)return;
     guardedArtifactNavigation(()=>{if(controller.signal.aborted)return;if(!writeResearchHandoff(draft)){setError("临时草稿无法保存，本次发现仍留在这里。请允许当前标签页存储后重试。");return;}router.push("/dashboard?project="+encodeURIComponent(projectId));});
   }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"未能带入创作。");}finally{lock.current=false;action.current=null;setBusy(false);}
 }
 async function share(){
   if(!preview?.body||!reviewed||!canWrite||lock.current)return;
   if(existingArtifact){guardedArtifactNavigation(()=>router.push("/dashboard?project="+encodeURIComponent(projectId)+"&node=artifact:"+encodeURIComponent(existingArtifact)));return;}
   lock.current=true;action.current="share";setBusy(true);setError("");
   try{const url=kind==="run"?"/api/research/results/"+resultId+"/share":"/api/research/results/study/"+resultId+"/share";const value=await request(url,{projectId,selection});setExistingArtifact(value.artifactId);setNotice(value.alreadyShared?"这份研究已分享过，保留原成果，本次调整没有覆盖它。":"已保存并分享选中的结论。原研究和私人会话没有修改。");setReviewed(false);}
   catch(cause){setError(cause instanceof Error?cause.message:"分享未完成，当前选择仍保留，可重试。");}finally{lock.current=false;action.current=null;setBusy(false);}
 }
 return <section id="share-result" className="research-use-findings" aria-label="使用研究发现" data-testid="research-use-findings" data-ready={ready} inert={!ready}>
   <div className="research-use-actions"><button ref={createTrigger} type="button" className="research-button research-primary" onClick={()=>{setMode("create");invalidate();setNotice("");}}>用这些发现创作</button><button ref={shareTrigger} type="button" className="research-button" onClick={()=>{setMode("share");invalidate();setNotice("");}}>保存 / 分享研究成果</button><span>也可以到这里结束研究，稍后再用。</span></div>
   {mode?<div ref={panel} className="research-findings-panel" tabIndex={-1} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();closePrepare();}}}>
     <header><div><h3>{mode==="create"?"挑选本次创作要用的发现":"选择要分享的结论"}</h3><p>{mode==="create"?"只带入本次选择，不分享研究、不自动生成。进入项目后仍由你审阅并发送。当前选择仅在本标签页暂存，30分钟后过期。":"先检查实际共享内容，再明确确认。取消前不会创建共享成果。"}</p></div><button type="button" aria-label="取消本次准备" disabled={busy&&["share","private-save"].includes(action.current||"")} onClick={closePrepare}>取消</button></header>
     {loading?<p role="status">正在读取研究发现…</p>:null}
     {data?<>{mode==="share"&&kind==="run"?<div className="research-private-save"><strong>{data.saved?"这份原研究已保存在个人研究中":"先保存原研究，也可以另选结论分享"}</strong><p>仅本人可见；下面的结论调整不覆盖原研究。</p>{!data.saved?<button type="button" className="research-button" disabled={busy||!canWrite} onClick={()=>void savePrivate()}>只保存原研究（仅本人）</button>:null}</div>:null}<fieldset disabled={busy}><legend>勾选并调整结论 · 原研究保持不变</legend>{data.blocks.filter(block=>block.type==="text").map(block=>{
       const chosen=items.find(item=>item.id===block.id);
       return <div className="research-finding-choice" key={block.id}><label><input type="checkbox" checked={Boolean(chosen)} onChange={event=>{invalidate();setItems(current=>event.target.checked?[...current,{id:block.id,text:block.type==="text"?block.text:""}]:current.filter(item=>item.id!==block.id));}} />{block.title}</label>{chosen?<textarea aria-label={"调整结论："+block.title} value={chosen.text} maxLength={12000} rows={3} onChange={event=>{invalidate();setItems(current=>current.map(item=>item.id===block.id?{...item,text:event.target.value}:item));}}/>:<p>{block.type==="text"?block.text.slice(0,160):""}</p>}{block.limitation?<small>{block.limitation}</small>:null}</div>;
     })}{!data.blocks.some(block=>block.type==="text")?<p>当前只有数据或来源记录，可先阅读细节，再继续研究形成判断。</p>:null}</fieldset>
       <details className="research-choice-sources"><summary>按需查看原始来源</summary>{data.blocks.flatMap(block=>block.type==="sources"?block.refs:[]).map(source=><article key={source.ref}><strong>{source.title}</strong><p>{source.excerpt||"暂无可读摘录。"}</p>{source.kind==="CREATOR_PROFILE"?<small>私人背景，不会自动分享</small>:null}</article>)}</details>
       <label>用于哪个项目<select aria-label="研究使用项目" value={projectId} disabled={busy} onChange={event=>{setProjectId(event.target.value);invalidate();}}><option value="">选择已有项目</option>{data.projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label>{!data.projects.length?<p>还没有可用项目。你可以先保留研究，稍后创建项目再使用。</p>:null}
       {mode==="create"?<><label>本次创作意图（可以调整）<textarea aria-label="本次创作意图" value={content} maxLength={4000} rows={2} onChange={event=>setContent(event.target.value)} disabled={busy}/></label><p className="research-caption">项目对话按本人隔离。保存为项目成果后，空间有读取权限的有效成员（含只读成员）可见；其他成员的对话不会被接管。专业技能可在项目中选用，也可以不选。</p><button type="button" className="research-button research-primary" disabled={busy||!projectId||!items.length||items.some(item=>!item.text.trim())||!content.trim()} onClick={()=>void bring()}>{busy?"正在准备…":"带入项目，先审阅"}</button></>:
       <><button type="button" className="research-button" disabled={busy||!projectId||!items.length||items.some(item=>!item.text.trim())} onClick={()=>void preparePreview()}>{busy?"正在准备…":"查看实际共享预览"}</button>{preview?<section className="research-actual-preview"><h4>{existingArtifact?"已分享成果的实际正文":"本次实际共享内容"}</h4><p>目标：{workspaceName} / {data.projects.find(project=>project.id===projectId)?.title}。该工作空间有读取权限的有效成员（含只读成员）可见。</p>{existingArtifact?<p>已有分享保留，本次调整不会覆盖它。需要修改请打开项目成果。</p>:null}<pre>{preview.body||"所选结论暂时无法共享。可以仅保留研究或带入本人创作。"}</pre>{preview.omitted?<p>已排除 {preview.omitted} 个不适合共享的区块；私人会话不会带过去。</p>:null}<label className="research-check"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} disabled={busy||!preview.body}/>我已检查完整正文与可见范围</label><button type="button" className="research-button research-primary" disabled={busy||!reviewed||!preview.body||!canWrite} onClick={()=>void share()}>{existingArtifact?"打开已分享成果":busy?"正在分享…":"确认保存并分享"}</button><p className="research-caption">确认前取消不分享。分享成功后关闭或取消创作，不撤回已经可见的成果。</p></section>:null}{!canWrite?<p role="status">当前是只读权限，不能保存或分享项目成果。</p>:null}</>}
     </>:null}
     {error?<p className="research-error" role="alert">{error}{!data?<button type="button" disabled={busy||loading} onClick={()=>{setMode(null);setTimeout(()=>setMode(mode),0);}}>重新读取</button>:<small>当前选择仍保留，可重新执行上方操作。</small>}</p>:null}
     {notice?<p role="status">{notice}</p>:null}
   </div>:null}
 </section>;
}
