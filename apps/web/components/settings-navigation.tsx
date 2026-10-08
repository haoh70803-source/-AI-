"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserRound, Building2, Users, Plug, HardDrive, Info, SlidersHorizontal, PenLine, Activity } from "lucide-react";
const tabs = [
  { href:"/settings", label:"通用", icon:SlidersHorizontal },
  { href:"/settings/account", label:"我的账号", icon:UserRound },
  { href:"/settings/workspace", label:"公司空间", icon:Building2 },
  { href:"/settings/members", label:"成员与权限", icon:Users },
  { href:"/settings/integrations", label:"模型与 API", icon:Plug },
  { href:"/settings/storage", label:"本机存储", icon:HardDrive },
  { href:"/settings/diagnostics", label:"连接与诊断", icon:Activity },
  { href:"/settings/creator-profile", label:"创作偏好", icon:PenLine },
  { href:"/settings/about", label:"关于", icon:Info },
];
export function SettingsNavigation({ name }: { name:string }) {
  const path=usePathname(); const router=useRouter();
  return <><label className="settings-mobile-category"><span>设置</span><select aria-label="设置分类" value={tabs.some(tab=>tab.href===path)?path:"/settings"} onChange={event=>router.replace(event.target.value,{scroll:false})}>{tabs.map(tab=><option key={tab.href} value={tab.href}>{tab.label}</option>)}</select></label><nav className="settings-tabs" aria-label="设置分类">{tabs.map(({href,label,icon:Icon})=><Link key={href} href={href} replace scroll={false} aria-current={path===href?"page":undefined}><Icon size={16} strokeWidth={1.65} aria-hidden="true"/><span>{label}</span></Link>)}</nav><div className="settings-window-company"><Building2 size={14}/><span>{name}</span></div></>;
}
