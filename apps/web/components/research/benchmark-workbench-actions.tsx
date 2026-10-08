"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
export function BenchmarkPurpose({id,purpose}:{id:string;purpose:string}){
 const router=useRouter(),lock=useRef(false),controller=useRef<AbortController|null>(null);const[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function choose(value:string){if(lock.current)return;lock.current=true;setBusy(true);setError("");const aborter=new AbortController();controller.current=aborter;
 try{const response=await fetch("/api/research/preferences",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:value==="teacher"?"BENCHMARK_TEACHER":"BENCHMARK_REFERENCE",key:id,action:"FOLLOW"}),signal:aborter.signal});const body=await response.json();if(!response.ok)throw Error(body.message||"学习目的未保存。");if(!aborter.signal.aborted)router.refresh();}
 catch(cause){if(!aborter.signal.aborted)setError(cause instanceof Error?cause.message:"网络暂时不可用。");}finally{lock.current=false;if(!aborter.signal.aborted)setBusy(false);}}
 return <div><label className="teacher-purpose">学习目的<select aria-label="学习目的" value={purpose} disabled={busy} onChange={e=>void choose(e.target.value)}><option value="unset" disabled>待选择目的</option><option value="teacher">老师 · 学方法</option><option value="reference">对标 · 学题材</option></select></label>{error?<p role="alert">{error}</p>:null}</div>;
}
export function BenchmarkSync({ids,canWrite,externalAvailable=true}:{ids:string[];canWrite:boolean;externalAvailable?:boolean}){
 const router=useRouter(),lock=useRef(false),controller=useRef<AbortController|null>(null);const[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function sync(){if(lock.current||!canWrite||!externalAvailable)return;lock.current=true;setBusy(true);setMessage("");const aborter=new AbortController();controller.current=aborter;let done=0;
 try{for(const id of ids){const response=await fetch("/api/research/benchmarks/"+id+"/sync",{method:"POST",signal:aborter.signal});const body=await response.json();if(!response.ok)throw Error(body.message||"同步未完成，旧数据保留。");done++;}if(!aborter.signal.aborted){setMessage("已同步 "+done+" 个账号的最新一页。");router.refresh();}}
 catch(cause){if(!aborter.signal.aborted)setMessage((done?"已完成 "+done+" 个；":"")+(cause instanceof Error?cause.message:"网络暂时不可用，旧数据保留。"));}
 finally{lock.current=false;if(!aborter.signal.aborted)setBusy(false);}}
 return <span className="teacher-sync"><button type="button" className="research-button" disabled={!canWrite||!externalAvailable||busy||!ids.length} title={!externalAvailable?"第三方采集待授权接入；没有发起调用。":undefined} onClick={()=>void sync()}>{!externalAvailable?"同步待接入":busy?"正在同步…":ids.length===1?"同步近期一页":"同步当前账号 · 一页"}</button>{message?<span role="status">{message}</span>:null}</span>;
}
export function WorkQueueActions({id,accountId,read,dismissed,reportId,returnTo,analysisAvailable=true}:{id:string;accountId:string;read:boolean;dismissed:boolean;reportId:string|null;returnTo:string;analysisAvailable?:boolean}){
 const router=useRouter(),lock=useRef(false),controller=useRef<AbortController|null>(null);const[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function act(kind:string,action:string){if(lock.current)return;lock.current=true;setBusy(true);setError("");const aborter=new AbortController();controller.current=aborter;
 try{const response=await fetch("/api/research/preferences",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,key:id,action}),signal:aborter.signal});const body=await response.json();if(!response.ok)throw Error(body.message||"状态未保存。");if(!aborter.signal.aborted)router.refresh();}
 catch(cause){if(!aborter.signal.aborted)setError(cause instanceof Error?cause.message:"网络暂时不可用。");}finally{lock.current=false;if(!aborter.signal.aborted)setBusy(false);}}
 const detail="/research/benchmarks/"+accountId+"/works/"+id+"?returnTo="+encodeURIComponent(returnTo);
 return <div className="research-source-actions"><button disabled={busy} onClick={()=>void act("WORK",read?"UNREAD":"VIEW")}>{read?"恢复未读":"看过了"}</button>{reportId?<Link className="research-button" href={detail+"#creation-preview"}>想复刻 · 创作预览</Link>:<span className="teacher-tag">复刻需先有拆解</span>}{reportId?<Link className="research-button" href={detail+"#deep-report"}>看拆解</Link>:analysisAvailable?<Link className="research-button" href={detail+"#deep-report"}>拆解 · 先审阅</Link>:<span className="teacher-tag" title="当前未授权新模型调用；可查看作品和已保存的文字。">拆解待接入</span>}<button disabled={busy} onClick={()=>void act("WORK_DISMISSED",dismissed?"UNFOLLOW":"FOLLOW")}>{dismissed?"恢复建议":"忽略建议"}</button>{error?<p role="alert">{error}</p>:null}</div>;
}
export function ReportArchive({id,archived}:{id:string;archived:boolean}){
 const router=useRouter(),lock=useRef(false);const[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function act(){if(lock.current)return;lock.current=true;setBusy(true);try{const response=await fetch("/api/research/preferences",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"REPORT_ARCHIVED",key:id,action:archived?"UNFOLLOW":"FOLLOW"})});const body=await response.json();if(!response.ok)throw Error(body.message||"报告状态未保存。");router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:"暂时无法保存。");}finally{lock.current=false;setBusy(false);}}
 return <span><button disabled={busy} onClick={()=>void act()}>{archived?"已归档 · 恢复":"看完归档"}</button>{error?<span role="alert">{error}</span>:null}</span>;
}
