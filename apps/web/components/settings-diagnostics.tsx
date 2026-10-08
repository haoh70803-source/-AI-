"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
type Report = { version: string; checkedAt: string; database: boolean; storageMode: string; storageConfigured: boolean; providers: Array<{ provider: string; configured: boolean; status: string }> };
const names: Record<string,string> = { LLM: "AI 模型", REDFOX: "研究数据", DOUBAO_ASR: "云端转录" };
export function SettingsDiagnostics() {
  const [report, setReport] = useState<Report | null>(null), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  async function check() {
    setBusy(true); setMessage("");
    try { const response=await fetch("/api/settings/diagnostics"); if(!response.ok) throw new Error(); setReport(await response.json()); } catch { setMessage("无法连接应用服务，请检查本机应用是否运行，然后重试。"); } finally {setBusy(false);}
  }
  useEffect(()=>{ void check(); },[]);
  return <><section className="settings-preferences"><div><div><h2>应用连接检查</h2><p>检查应用服务与数据库的真实连接状态。</p></div><button className="settings-small-action" disabled={busy} onClick={()=>void check()}>{busy?"检查中…":"重新检查"}</button></div></section>{report ? <><div className="settings-info-table"><div><span>应用服务</span><strong>已连接</strong></div><div><span>本机数据库</span><strong>{report.database?"连接正常":"连接失败"}</strong></div><div><span>文件存储</span><strong>{report.storageMode==="LOCAL_FILESYSTEM"?"本机存储":"服务端存储"} · {report.storageConfigured?"已配置":"未配置"}</strong></div>{report.providers.map(provider=><div key={provider.provider}><span>{names[provider.provider]}</span><strong>{provider.status==="DISABLED"?"已停用":provider.configured?"已配置，需测试连接":"尚未配置"}</strong></div>)}</div><section className="settings-preferences"><div><div><h2>外部 API 连通性</h2><p>配置存在不代表服务可用，请在模型与 API 中发起真实测试。</p></div><Link href="/settings/integrations" replace>前往测试</Link></div><div><div><h2>复制诊断信息</h2><p>只包含版本和状态，不包含密钥、登录凭据、邮箱或本机路径。</p></div><button className="settings-small-action" onClick={()=>void navigator.clipboard.writeText(JSON.stringify(report,null,2)).then(()=>setMessage("诊断信息已复制。")).catch(()=>setMessage("复制失败，请检查浏览器剪贴板权限。"))}>复制信息</button></div></section><p className="settings-footnote">版本 {report.version} · 检查时间 {new Date(report.checkedAt).toLocaleString("zh-CN")}</p></> : null}{message?<p role="status">{message}</p>:null}</>;
}
