import { Card } from "@content-center/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="fusion-auth">
    <section className="fusion-auth-story" aria-label="鑫世界工作台介绍"><div className="fusion-auth-brand"><img src="/brand/xin-world-mark-dark.svg" alt="" /><span>CONTENT OS / 鑫世界</span></div><div><p className="fusion-eyebrow">AI WORKBENCH · 1.0</p><h1>从灵感到作品，<br />让创作有迹可循。</h1><p>连接项目、资料、研究与 Skill，<br />在同一个工作台完成内容创作。</p></div><small>BLACK TITANIUM / 内容工作台</small></section>
    <Card className="fusion-auth-card"><div className="mb-7"><p className="fusion-eyebrow">WELCOME BACK</p><h2 className="mt-3 text-2xl font-semibold">进入你的工作台</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">使用当前环境的账号登录。</p></div>
    {process.env.ENVIRONMENT_ID === "LOCAL_REVIEW" ? <p role="status" className="fusion-environment-note">独立本地环境 · 新数据库与文件空间。模型和外部服务尚未启用。</p> : null}{children}</Card>
  </main>;
}
