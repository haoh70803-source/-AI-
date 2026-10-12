import Link from "next/link";
import { ArrowRight, BookOpen, Orbit, ScanSearch, Video } from "lucide-react";

export type ResearchTool = "reference" | "teardown" | "teacher";
const tools = [
  { id: "reference", title: "找题材", description: "对标账号 / 作品榜", href: "/research/benchmarks?purpose=reference", icon: ScanSearch },
  { id: "teardown", title: "拆视频", description: "内容结构 / 亮点", href: "/research/teardown", icon: Video },
  { id: "teacher", title: "学方法", description: "老师 / 学习记录", href: "/research/benchmarks?purpose=teacher", icon: BookOpen },
] as const;

export function ResearchTools({ active }: { active?: ResearchTool }) {
  return <section className="research-lite-tools" aria-label="研究工具">
    <header className="research-lite-heading"><div><span className="research-eyebrow">XIN WORLD / RESEARCH</span><h1>从好内容里，找到好方法。</h1><p>三个研究工具，让创作更有依据。</p></div><Orbit size={28} aria-hidden="true" /></header>
    <nav className="research-lite-cards" aria-label="选择研究方向">{tools.map(({ id, title, description, href, icon: Icon }, index) => <Link href={href} key={id} aria-current={active === id ? "page" : undefined}>
      <div><Icon size={19} aria-hidden="true" /><small>0{index + 1}</small></div><strong>{title}</strong><p>{description}</p><span>进入 <ArrowRight size={13} aria-hidden="true" /></span>
    </Link>)}</nav>
  </section>;
}

export function ResearchContinueCreation() {
  return <Link className="research-lite-continue" href="/projects"><ArrowRight size={17} aria-hidden="true" /><span>研究完成后，可以继续进入 AI 创作。</span><span aria-hidden="true">→</span></Link>;
}
