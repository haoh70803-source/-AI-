"use client";

import { Button, Input } from "@content-center/ui";
import { useState } from "react";

type Profile = {
  displayName: string; positioning: string; targetAudience: string; tone: string; preferredStyle: string; forbiddenStyle: string;
  coreTopics: string[]; personalViews: string[]; brandTerms: string[]; forbiddenTerms: string[]; hookPreferences: string[];
  structurePreferences: string[]; ctaPreferences: string[]; examplePhrases: string[]; notes: string;
};

export function CreatorProfileForm({ initial, editable = true }: { initial: Profile; editable?: boolean }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : value])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(formData: FormData) {
    setBusy(true); setMessage("正在保存");
    const value = (name: string) => String(formData.get(name) || "");
    const lines = (name: string) => value(name).split("\n").map((item) => item.trim()).filter(Boolean);
    try {
      const response = await fetch("/api/creator-profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: value("displayName"), positioning: value("positioning"), targetAudience: value("targetAudience"), tone: value("tone"), preferredStyle: value("preferredStyle"), forbiddenStyle: value("forbiddenStyle"), coreTopics: lines("coreTopics"), personalViews: lines("personalViews"), brandTerms: lines("brandTerms"), forbiddenTerms: lines("forbiddenTerms"), hookPreferences: lines("hookPreferences"), structurePreferences: lines("structurePreferences"), ctaPreferences: lines("ctaPreferences"), examplePhrases: lines("examplePhrases"), notes: value("notes") }) });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "已保存" : result.message || result.error || "保存失败");
    } catch { setMessage("保存失败"); }
    finally { setBusy(false); }
  }
  return <form action={save} className="settings-profile-form"><fieldset disabled={busy || !editable}>
    <section className="profile-quick-start"><h2>简单选一下，也可以先跳过</h2><p>没有固定偏好也能直接创作。只保存你选中的内容，之后随时能改。</p>
      <Choice label="表达语气" value={draft.tone!} choices={["自然口语", "专业清晰", "简洁直接", "轻松亲切"]} onChange={tone => setDraft(current => ({ ...current, tone }))}/>
      <Choice label="主要读者" value={draft.targetAudience!} choices={["大众读者", "行业从业者", "企业管理者", "学生与家长"]} onChange={targetAudience => setDraft(current => ({ ...current, targetAudience }))}/>
      <Choice label="表达方式" value={draft.preferredStyle!} choices={["先结论后解释", "用例子说明", "按步骤展开", "故事式表达"]} onChange={preferredStyle => setDraft(current => ({ ...current, preferredStyle }))}/>
      <a href="/dashboard">暂不设置，直接去创作 →</a>
    </section>
    <details className="settings-preference-detail"><summary>更多设置与自定义内容（选填）</summary>
    <h2 className="settings-subheading">定位与受众</h2><div className="grid gap-4"><Field name="displayName" label="创作署名" value={draft.displayName!} onChange={value => setDraft(current => ({ ...current, displayName: value }))}/><Area name="positioning" label="我的定位" value={draft.positioning!} onChange={value => setDraft(current => ({ ...current, positioning: value }))}/><Area name="targetAudience" label="目标受众" value={draft.targetAudience!} onChange={value => setDraft(current => ({ ...current, targetAudience: value }))}/><Area name="coreTopics" label="常做领域（每行一项）" value={draft.coreTopics!} onChange={value => setDraft(current => ({ ...current, coreTopics: value }))}/></div>
    <h2 className="settings-subheading mt-6">表达习惯</h2><div className="grid gap-4"><Area name="tone" label="表达语气" value={draft.tone!} onChange={value => setDraft(current => ({ ...current, tone: value }))}/><Area name="preferredStyle" label="喜欢的表达" value={draft.preferredStyle!} onChange={value => setDraft(current => ({ ...current, preferredStyle: value }))}/><Area name="forbiddenStyle" label="不喜欢的表达" value={draft.forbiddenStyle!} onChange={value => setDraft(current => ({ ...current, forbiddenStyle: value }))}/><Area name="personalViews" label="常用观点（每行一项）" value={draft.personalViews!} onChange={value => setDraft(current => ({ ...current, personalViews: value }))}/></div>
    <details className="settings-preference-detail"><summary>品牌、结构与其他偏好</summary><div className="grid gap-4 mt-4"><Area name="brandTerms" label="品牌词（每行一项）" value={draft.brandTerms!} onChange={value => setDraft(current => ({ ...current, brandTerms: value }))}/><Area name="forbiddenTerms" label="禁用词（每行一项）" value={draft.forbiddenTerms!} onChange={value => setDraft(current => ({ ...current, forbiddenTerms: value }))}/><Area name="hookPreferences" label="开头偏好（每行一项）" value={draft.hookPreferences!} onChange={value => setDraft(current => ({ ...current, hookPreferences: value }))}/><Area name="structurePreferences" label="结构偏好（每行一项）" value={draft.structurePreferences!} onChange={value => setDraft(current => ({ ...current, structurePreferences: value }))}/><Area name="ctaPreferences" label="行动引导偏好（每行一项）" value={draft.ctaPreferences!} onChange={value => setDraft(current => ({ ...current, ctaPreferences: value }))}/><Area name="examplePhrases" label="示例表达（每行一项）" value={draft.examplePhrases!} onChange={value => setDraft(current => ({ ...current, examplePhrases: value }))}/><Area name="notes" label="补充说明" value={draft.notes!} onChange={value => setDraft(current => ({ ...current, notes: value }))}/></div></details>
    </details>
    {message?<p role="status" className="mt-4">{message}</p>:null}<div className="mt-5"><Button disabled={busy || !editable}>{busy?"正在保存…":"保存创作偏好"}</Button></div>
  </fieldset></form>;
}

function Field({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-medium">{label}<Input name={name} value={value} onChange={event => onChange(event.target.value)} maxLength={10_000} /></label>; }
function Area({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-medium">{label}<textarea name={name} aria-label={label} value={value} onChange={event => onChange(event.target.value)} rows={3} maxLength={10_000} className="rounded-[var(--radius)] border bg-[var(--surface)] p-3 font-normal leading-6 outline-none focus:border-[var(--accent)]" /></label>; }

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: string[]; onChange: (value: string) => void }) { return <div className="profile-choice"><h3>{label}</h3><div role="group" aria-label={label}>{choices.map(choice => <button type="button" key={choice} aria-pressed={value === choice} onClick={() => onChange(value === choice ? "" : choice)}>{choice}</button>)}</div>{value && !choices.includes(value) ? <small>当前自定义：{value}</small> : null}</div>; }
