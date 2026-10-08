"use client";
import { useRef, useState } from "react";
import { Button } from "@content-center/ui";
export function EmailVerification() {
  const [message,setMessage]=useState("邮箱验证需要配置发信服务。当前不会发送邮件或改变你的账号权限。"),[busy,setBusy]=useState(false);
  const submitting=useRef(false);
  return <section className="settings-security"><h2 className="settings-subheading">邮箱验证</h2><p role="status" className="text-sm">{message}</p><Button className="mt-3" variant="secondary" disabled={busy} onClick={async()=>{if(submitting.current)return;submitting.current=true;setBusy(true);try{const response=await fetch("/api/account/verification",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const result=await response.json().catch(()=>null);setMessage(result?.message??"操作未完成，请稍后重试。");}catch{setMessage("网络连接失败，请重试。");}finally{submitting.current=false;setBusy(false);}}}>{busy?"处理中…":"检查邮箱验证服务"}</Button></section>;
}
