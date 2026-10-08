"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Plus, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
const links = [{ href: "/research", label: "精选资讯 / 日刊", icon: Compass }, { href: "/research/sources", label: "已保存来源", icon: BookOpen }, { href: "/research/works", label: "新作品队列", icon: BookOpen }, { href: "/research/benchmarks", label: "老师 / 对标账号", icon: Compass }, { href: "/research/trends", label: "趋势", icon: TrendingUp }, { href: "/research/results", label: "收藏 / 研究历史", icon: BookOpen }];
export function ResearchShell({ children, sessions }: { children: ReactNode; sessions: Array<{ id: string; title: string }> }) {
  const path = usePathname();
  const [recent, setRecent] = useState(sessions);
  useEffect(() => { setRecent(sessions); }, [sessions]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/research/sessions", { signal: controller.signal }).then(async response => { if (response.ok) { const value = await response.json(); setRecent(value.items); } }).catch(() => undefined);
    return () => controller.abort();
  }, [path]);
  return <div className={`research-center${path.startsWith("/research/benchmarks/") ? " is-dossier" : ""}`} data-testid="research-center">
    <aside className="research-navigation">
      <Link className="research-brand" href="/research">研究中心<span>发现 · 理解 · 留存</span></Link>
      <Link href="/research/new?entry=DIRECT" className="research-new"><Plus size={15} />开始研究</Link>
      <nav aria-label="研究中心导航">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={(href === "/research" ? path === href : path.startsWith(href)) ? "page" : undefined}><Icon size={15} /><span>{label === "研究首页" ? "首页" : label}</span></Link>)}</nav>
      {path.startsWith("/research/session/") ? <details className="research-session-nav" open><summary>最近研究</summary><nav aria-label="最近研究会话">{recent.slice(0, 12).map(session => <Link title={session.title} key={session.id} href={`/research/session/${session.id}`} aria-current={path === `/research/session/${session.id}` ? "page" : undefined}>{session.title}</Link>)}{!recent.length ? <p>你的研究会保存在这里。</p> : null}</nav></details> : <p className="research-nav-note">从资料出发<br />让判断有据可循</p>}
    </aside>
    <div className="research-main-pane">{children}</div>
  </div>;
}
