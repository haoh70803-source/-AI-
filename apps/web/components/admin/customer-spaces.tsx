"use client";
import { Button, Input, Card } from "@content-center/ui";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function CustomerSpaces({ spaces, delivery }: { spaces: Array<{ id: string; name: string; disabled: boolean; activeMembers: number }>; delivery: { available: boolean; message: string } }) {
  const router=useRouter(), submitting=useRef(false);
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(""), [isolatedOnly,setIsolatedOnly]=useState(false);
  const isolated=spaces.filter(space=>space.activeMembers===0);
  return <div className="space-y-6"><header><h1 className="text-2xl font-semibold">客户空间</h1><p className="mt-2 text-sm">平台开通空间，负责人通过本人邮箱接受邀请。此处只显示管理状态，不授予平台人员读取客户内容的权限。</p></header>
    <Card className="p-5"><h2 className="font-semibold">开通客户空间</h2><p role="status" className="mt-2 text-sm">{delivery.message}</p>
      <form aria-busy={busy} className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={async event=>{event.preventDefault();if(submitting.current)return;const form=event.currentTarget,data=new FormData(form);submitting.current=true;setBusy(true);setMessage("");try{const response=await fetch("/api/admin/workspaces",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),email:data.get("email")})});const result=await response.json().catch(()=>null);if(!response.ok){setMessage(result?.message??"开通未完成，请刷新查看空间状态后重试。");router.refresh();return;}form.reset();setMessage("空间已开通，等待负责人接受邀请。");router.refresh();}catch{setMessage("网络连接失败，请刷新确认结果后重试，避免重复开通。");}finally{submitting.current=false;setBusy(false);}}}>
        <label className="grid gap-2">公司名称<Input name="name" minLength={2} maxLength={80} required disabled={!delivery.available || busy}/></label><label className="grid gap-2">负责人邮箱<Input name="email" type="email" maxLength={320} required disabled={!delivery.available || busy}/></label><Button disabled={!delivery.available || busy}>{busy?"处理中…":"开通并邀请负责人"}</Button>
      </form>{message?<p role="status" className="mt-3">{message}</p>:null}
    </Card>
    <div className="flex flex-wrap justify-between gap-3"><p>{spaces.length} 个空间 · {isolated.length} 个没有活跃成员</p><label><input type="checkbox" checked={isolatedOnly} onChange={event=>setIsolatedOnly(event.target.checked)}/> 只看没有活跃成员</label></div>
    <p className="text-sm text-[var(--text-secondary)]">没有活跃成员的空间保留隔离和全部数据。恢复原成员、转移负责人或访问其内容需要单独确认。</p>
    <ul className="grid gap-3">{(isolatedOnly?isolated:spaces).map(space=><li key={space.id}><Card className="flex flex-wrap justify-between gap-3 p-4"><strong className="break-all">{space.name}</strong><span>{space.disabled?"空间已停用":space.activeMembers===0?"保留隔离 · 无活跃成员":space.activeMembers+" 位活跃成员"}</span></Card></li>)}</ul>
    {(isolatedOnly?isolated:spaces).length===0?<p>没有符合条件的空间。</p>:null}
  </div>;
}
