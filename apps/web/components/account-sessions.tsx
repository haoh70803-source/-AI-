"use client";
import { useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";
type Session = { id: string; current: boolean; device: string; lastActive: string };
export function AccountSessions() {
  const [sessions,setSessions]=useState<Session[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[expanded,setExpanded]=useState(false);
  const submitting=useRef(false);
  async function load() { const response=await fetch("/api/settings/sessions",{cache:"no-store"});if(!response.ok)throw Error();const data=await response.json();setSessions(data.sessions); }
  useEffect(()=>{load().catch(()=>setMessage("无法读取登录设备。请检查网络或重新登录，再重试。")).finally(()=>setLoading(false));},[]);
  async function revoke(body:unknown) {
    if(submitting.current)return;submitting.current=true;setBusy(true);setMessage("");
    try{const response=await fetch("/api/settings/sessions",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await response.json().catch(()=>null);if(!response.ok){setMessage(data?.message??"退出未完成，请重新登录后重试。");return;}setMessage(data.message);try{await load();}catch{setMessage(data.message+" 设备列表暂未刷新，请重试读取。");}}
    catch{setMessage("网络连接失败，请刷新设备列表确认结果后重试。");}finally{submitting.current=false;setBusy(false);}
  }
  return <section className="settings-security" aria-busy={busy||loading}><div className="settings-section-heading"><h2>登录设备</h2><button className="settings-small-action" disabled={busy||loading||!sessions.some(session=>!session.current)} onClick={()=>{if(window.confirm("退出其他设备后，它们需要重新登录。当前设备保持登录。"))void revoke({allOthers:true});}}>退出其他设备</button></div>
    {loading?<p role="status">正在读取登录设备…</p>:!sessions.length?<p className="text-sm">暂未读取到有效登录设备，可以重试。</p>:null}
    <div className="settings-info-table">{sessions.slice(0,expanded?sessions.length:3).map(session=><div key={session.id}><span><Monitor size={15} aria-hidden="true"/><span>{session.device}<small>会话最近更新：{new Date(session.lastActive).toLocaleString("zh-CN")}</small></span></span>{session.current?<span className="settings-current-tag">当前设备</span>:<button className="settings-small-action" disabled={busy} aria-label={"退出 "+session.device} onClick={()=>void revoke({id:session.id})}>退出</button>}</div>)}</div>
    {sessions.length>3?<button className="settings-small-action mt-3" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"收起设备列表":`查看其他 ${sessions.length-3} 个登录`}</button>:null}
    <button className="settings-small-action mt-3" disabled={busy||loading} onClick={()=>{setLoading(true);setMessage("");load().catch(()=>setMessage("读取失败，请重试。")).finally(()=>setLoading(false));}}>刷新设备</button>
    {message?<p role="status" className="mt-3">{message}</p>:null}
  </section>;
}
