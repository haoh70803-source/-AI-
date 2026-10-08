"use client";

import { Badge, Button, Card } from "@content-center/ui";
import type { ContentProductionPlan } from "@/lib/content-production";

export function ContentProductionPreview({ plan, selectedAngle, selectedTitle, busy, editable, onAngleChange, onTitleChange, onRegenerate }: {
  plan: ContentProductionPlan; selectedAngle: string; selectedTitle: string; busy: boolean; editable: boolean;
  onAngleChange: (value: string) => void; onTitleChange: (value: string) => void; onRegenerate: () => void;
}) {
  const angles = [plan.recommendedAngle, ...plan.alternativeAngles].slice(0, 3);
  const titles = [plan.recommendedTitle, ...plan.alternativeTitles].slice(0, 3);
  const angleChanged = selectedAngle !== plan.recommendedAngle;
  const titleChanged = selectedTitle !== plan.recommendedTitle;
  return <Card data-testid="content-production-preview" className="p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">AI 建议这条这样讲</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">找方向可以有备选，最终口播稿只围绕一个角度。</p></div><Badge>同一次生成</Badge></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <section><h3 className="text-sm font-semibold">推荐角度</h3><div className="mt-2 grid gap-2">{angles.map((angle, index) => <label key={angle} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm leading-6 ${selectedAngle === angle ? "border-[var(--accent)] bg-[var(--surface-elevated)]" : ""}`}><input type="radio" name="production-angle" checked={selectedAngle === angle} onChange={() => onAngleChange(angle)} /><span className="min-w-0 flex-1">{angle}{index === 0 ? <Badge className="ml-2">推荐</Badge> : null}</span></label>)}</div>
        {angleChanged ? <div className="mt-3 rounded-xl bg-[var(--surface-elevated)] p-3"><p className="text-xs text-[var(--text-secondary)]">切换角度不会偷偷调用 AI。确认后再生成一版只讲这个角度的稿。</p><Button className="mt-3" variant="secondary" disabled={!editable || busy} onClick={onRegenerate}>{busy ? "正在重新生成…" : "按这个角度重新生成"}</Button></div> : null}
      </section>
      <section><h3 className="text-sm font-semibold">标题</h3><div className="mt-2 grid gap-2">{titles.map((title) => <label key={title} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm leading-6 ${selectedTitle === title ? "border-[var(--accent)]" : ""}`}><input type="radio" name="production-title" checked={selectedTitle === title} disabled={!editable} onChange={() => onTitleChange(title)} /><span>{title}</span></label>)}</div>{titleChanged ? <p className="mt-2 text-xs text-[var(--text-secondary)]">已采用这个标题。重新生成稿件后，AI 会同步调整开场。</p> : null}</section>
    </div>
    <section className="mt-5 border-t pt-5"><h3 className="text-sm font-semibold">开场</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{plan.openingHook}</p><p className="mt-3 text-xs text-[var(--text-secondary)]">约 {plan.estimatedDurationSeconds} 秒 · 约 {plan.estimatedCharacterCount} 字</p></section>
    {plan.alternativeOpenings?.length ? <section className="mt-5 border-t pt-5"><h3 className="text-sm font-semibold">备选开头</h3><ol className="mt-2 grid gap-2 text-sm leading-6">{plan.alternativeOpenings.map((opening, index) => <li key={opening}><span className="mr-2 text-xs text-[var(--text-secondary)]">{index + 1}.</span>{opening}</li>)}</ol></section> : null}
    {plan.closingAction ? <section className="mt-5 border-t pt-5"><h3 className="text-sm font-semibold">结尾行动建议</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{plan.closingAction}</p></section> : null}
    {plan.cta ? <section className="mt-5 border-t pt-5"><h3 className="text-sm font-semibold">CTA</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{plan.cta}</p></section> : null}
    {plan.needsConfirmation?.length ? <section className="mt-5 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-3"><h3 className="text-sm font-semibold">需要确认</h3><ul className="mt-2 grid gap-1 text-sm leading-6">{plan.needsConfirmation.map((item) => <li key={item}>· {item}</li>)}</ul></section> : null}
    {plan.ownContribution === "WEAK" ? <p className="mt-4 rounded-xl bg-[var(--surface-elevated)] p-3 text-sm">这版主要基于你的观点，暂时没有使用个人案例。</p> : null}
  </Card>;
}

export function ShootabilityCheck({ plan, warningCount }: { plan: ContentProductionPlan; warningCount: number }) {
  return <section data-testid="shootability-check" className="mt-5 border-t pt-5"><h3 className="text-sm font-semibold">可拍检查</h3><ul className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2"><li>✓ 一个核心角度</li><li>✓ 标题和开场同次生成</li><li>{plan.ownContribution === "WEAK" ? "○ 主要使用你的观点" : "✓ 有自己的观点或经历"}</li><li>{warningCount ? `⚠ ${warningCount} 处事实边界待确认` : "✓ 未发现同行案例冒用"}</li><li className={plan.estimatedDurationSeconds > 90 ? "text-[var(--warning)]" : ""}>{plan.estimatedDurationSeconds > 90 ? "⚠" : "✓"} 预计 {plan.estimatedDurationSeconds} 秒{plan.estimatedDurationSeconds > 90 ? "，建议适当精简" : ""}</li></ul></section>;
}
