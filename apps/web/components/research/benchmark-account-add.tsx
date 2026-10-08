"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseBenchmarkHomepage } from "@/server/research/benchmark-workbench-math";
export function BenchmarkAccountAdd({canManage,externalAvailable=true}:{canManage:boolean;externalAvailable?:boolean}) {
  const router=useRouter(), lock=useRef(false), aborter=useRef<AbortController|null>(null), trigger=useRef<HTMLButtonElement>(null), dialog=useRef<HTMLDialogElement>(null);
  const [url,setUrl]=useState(""),[purpose,setPurpose]=useState("teacher"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  useEffect(()=>()=>aborter.current?.abort(),[]);
  let platform="待识别"; try {platform=parseBenchmarkHomepage(url).platform==="DOUYIN"?"抖音":"小红书";} catch { /* Keep the platform unconfirmed until the URL is valid. */ }
  function close(){if(busy)return;dialog.current?.close();trigger.current?.focus();}
  async function submit(event:FormEvent) {
    event.preventDefault();if(lock.current || !canManage)return;
    try {parseBenchmarkHomepage(url);}catch(cause){setError(cause instanceof Error?cause.message:"主页无效");return;}
    lock.current=true;setBusy(true);setError("");const controller=new AbortController();aborter.current=controller;
    try {
      const response=await fetch("/api/research/benchmarks/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url,purpose}),signal:controller.signal});
      const body=await response.json();if(!response.ok)throw Error(body.message||body.error?.message||"加入未完成，请重试。");
      if(controller.signal.aborted)return;
      setNotice(body.existing?"已定位已有账号；学习目的已更新，作品与阅读状态保留。":body.sync==="FAILED"?body.message:"已加入账号并同步平台近期一页作品。");
      dialog.current?.close();router.push("/research/benchmarks?accountId="+encodeURIComponent(body.item.id)+"#account-"+body.item.id);router.refresh();
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof TypeError?"网络暂时不可用，主页输入已保留，请重试。":cause instanceof Error?cause.message:"网络暂时不可用。");}
    finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  return canManage?<div className="teacher-add"><button ref={trigger} className="research-button" onClick={()=>dialog.current?.showModal()}>{externalAvailable?"＋ 加老师 / 对标":"＋ 添加 / 定位账号"}</button>{notice?<p role="status">{notice}</p>:null}
    <dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();}} onClose={()=>trigger.current?.focus()} className="teacher-import-dialog"><form onSubmit={event=>void submit(event)}><h2>加老师或对标</h2><label>学习目的<select value={purpose} onChange={event=>setPurpose(event.target.value)} disabled={busy}><option value="teacher">老师 · 学方法</option><option value="reference">对标 · 学题材</option></select></label><label>账号主页链接<input autoFocus type="url" required maxLength={2000} value={url} onChange={event=>{setUrl(event.target.value);setError("");}} placeholder="https://www.douyin.com/user/…" disabled={busy}/></label><span className="teacher-tag">{platform}</span><p className="research-caption">{externalAvailable?"已支持的身份可查询近期一页；仅有抖音主页 MS4w 标识时尚不能新增识别，不会调用第三方。":"当前只能定位已保存的同一主页，并选择学习目的。新增账号仍待接入；仅有抖音主页 MS4w 标识时身份接口不支持。本次不会调用第三方。"}</p>{error?<p role="alert" className="research-error">{error}</p>:null}<div className="research-source-actions"><button type="button" onClick={close} disabled={busy}>取消</button><button className="research-button" disabled={busy||!url.trim()}>{busy?"正在核对…":externalAvailable?"加入":"定位已有账号"}</button></div></form></dialog></div>:<p className="research-caption">当前账号没有添加老师 / 对标的权限。</p>;
}
