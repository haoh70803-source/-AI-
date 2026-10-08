"use client";

import { Button } from "@content-center/ui";

export type MySupplement = { coreMessage: string; audience: string; background: string; angle: string };

export function BriefEditor({ value, editable, busy, message, onChange, onSave }: { value: MySupplement; editable: boolean; busy: boolean; message: string; onChange: (value: MySupplement) => void; onSave: () => void }) {
  return <section id="my-supplement" aria-labelledby="my-supplement-title">
    <div><h2 id="my-supplement-title" className="font-semibold">我的补充</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">告诉 AI，这次内容里只有我们能讲的部分。</p></div>
    <div className="mt-5 grid gap-4">
      <Field label="我的核心观点" hint="这条你最想表达什么？" value={value.coreMessage} onChange={(coreMessage) => onChange({ ...value, coreMessage })} area disabled={!editable} />
      <Field label="给谁看" hint="例如：教培机构老板 / 校长" value={value.audience} onChange={(audience) => onChange({ ...value, audience })} disabled={!editable} />
      <Field label="这次希望怎么讲？" hint="例如：像老板聊天、直接一点、控制在 60 秒" value={value.angle} onChange={(angle) => onChange({ ...value, angle })} area disabled={!editable} />
      <Field label="有什么只有我们能讲的？" hint="补充自己的业务经验、经历或真实案例。没有也可以留空，AI 不会编。" value={value.background} onChange={(background) => onChange({ ...value, background })} area disabled={!editable} />
    </div>
    {editable ? <div className="mt-5 flex items-center gap-3"><Button variant="secondary" disabled={busy} onClick={onSave}>{busy ? "保存中…" : "保存我的补充"}</Button>{message ? <p role="status" className="text-xs text-[var(--text-secondary)]">{message}</p> : null}</div> : null}
  </section>;
}

function Field({ className = "", label, hint, value, onChange, area, disabled }: { className?: string; label: string; hint?: string; value: string; onChange: (value: string) => void; area?: boolean; disabled: boolean }) {
  const classes = "rounded-[var(--radius)] border bg-[var(--surface)] p-3 text-sm font-normal leading-6 outline-none focus:border-[var(--accent)]";
  return <label className={`grid gap-1.5 text-xs font-medium ${className}`}><span>{label}</span>{hint ? <span className="font-normal leading-5 text-[var(--text-secondary)]">{hint}</span> : null}{area ? <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={4} className={classes} /> : <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`h-11 ${classes}`} />}</label>;
}
