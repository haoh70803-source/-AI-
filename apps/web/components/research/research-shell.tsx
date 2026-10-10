"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isResearchNavigationActive, researchNavigation, researchNavigationGroups } from "./navigation";
export function ResearchShell({ children, sessions, canReadNews = false }: { children: ReactNode; canReadNews?: boolean; sessions: Array<{ id: string; title: string }> }) {
  const path = usePathname();
  const navigationRef = useRef<HTMLElement>(null);
  const [recent, setRecent] = useState(sessions);
  useEffect(() => {
    const navigation = navigationRef.current;
    if (navigation && navigation.scrollWidth > navigation.clientWidth) {
      navigation.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [path]);
  useEffect(() => { setRecent(sessions); }, [sessions]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/research/sessions", { signal: controller.signal }).then(async response => { if (response.ok) { const value = await response.json(); setRecent(value.items); } }).catch(() => undefined);
    return () => controller.abort();
  }, [path]);
  return <div className={`research-center${path.startsWith("/research/benchmarks/") ? " is-dossier" : path.startsWith("/research/teardown") ? " is-teardown" : ""}`} data-testid="research-center">
    <details className="research-capability-menu"><summary>研究工具与来源</summary><aside className="research-navigation">
      <nav aria-label="研究中心导航" ref={navigationRef}>
        {researchNavigationGroups.map(group => <div className="research-navigation-group" key={group} role="group" aria-label={group}>
          <span className="research-navigation-heading">{group}</span>
          <div className="research-navigation-links">{researchNavigation.filter(item => item.group === group && (item.href !== "/research" || canReadNews)).map(({ href, label, icon: Icon }) =>
            <Link key={href} href={href} aria-current={isResearchNavigationActive(path, href) ? "page" : undefined}><Icon size={15} aria-hidden="true" /><span>{label}</span></Link>
          )}</div>
        </div>)}
      </nav>
      {path.startsWith("/research/session/") ? <details className="research-session-nav" open><summary>最近研究</summary><nav aria-label="最近研究会话">{recent.slice(0, 12).map(session => <Link title={session.title} key={session.id} href={`/research/session/${session.id}`} aria-current={path === `/research/session/${session.id}` ? "page" : undefined}>{session.title}</Link>)}{!recent.length ? <p>你的研究会保存在这里。</p> : null}</nav></details> : <p className="research-nav-note">从资料出发<br />让判断有据可循</p>}
    </aside></details>
    <div className={`research-main-pane${path.startsWith("/research/session/") ? " has-session-list" : ""}`}>
      {path.startsWith("/research/session/") ? <aside className="xin-research-session-list"><p className="research-eyebrow">研究会话</p>{recent.map(item => <Link key={item.id} href={`/research/session/${item.id}`} aria-current={path === `/research/session/${item.id}` ? "page" : undefined}><strong>{item.title}</strong><small>打开研究记录 →</small></Link>)}<Link href="/research/new">＋ 新建研究</Link></aside> : null}{children}
    </div>
  </div>;
}
