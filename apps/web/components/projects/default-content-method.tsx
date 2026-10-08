"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { defaultContentMethodSectionCodes, getDefaultContentMethodReadiness, type DefaultContentMethodSection } from "@/server/default-content-method/schemas";
import type { DefaultContentMethodDTO, DefaultContentMethodVersionDTO } from "@/server/default-content-method/service";
import { StudioDrawer } from "./studio-drawer";

const labels = {
  AUDIENCE: "我们主要给谁做内容",
  TOPIC: "什么样的选题优先做",
  OPENING: "开头怎么进入",
  BODY: "正文怎么讲",
  EVIDENCE: "案例和数据怎么用",
  ENDING: "怎么收尾",
  BOUNDARY: "哪些事情不要做",
} as const;

async function request(method: string, body?: unknown) {
  const result = await fetch("/api/methods/default", { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.message || "默认创作方法暂时无法操作。");
  return (data.method ?? data) as DefaultContentMethodDTO;
}

function fields(version: DefaultContentMethodVersionDTO | null) {
  return Object.fromEntries(defaultContentMethodSectionCodes.map((code) => [code, version?.sections.find((section) => section.code === code)?.items.map(({ text }) => text).join("\n") ?? ""])) as Record<typeof defaultContentMethodSectionCodes[number], string>;
}

function lines(value: string) {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

export function DefaultContentMethod({ initial, editable }: { initial: DefaultContentMethodDTO; editable: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState(initial);
  const [content, setContent] = useState(() => fields(initial.draft));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [openSection, setOpenSection] = useState<DefaultContentMethodSection | null>(null);
  const current = method.current;
  const draft = method.draft;
  const sections = current?.sections ?? [];
  const draftSections = useMemo((): DefaultContentMethodSection[] => defaultContentMethodSectionCodes.map((code) => {
    const previous = draft?.sections.find((section) => section.code === code)?.items ?? [];
    return { code, items: lines(content[code]).map((text) => ({ text, sourceRefs: previous.find((item) => item.text === text)?.sourceRefs ?? [] })) };
  }), [content, draft]);
  const draftReadyToPublish = getDefaultContentMethodReadiness(draftSections).readyToPublish;

  async function run(action: () => Promise<DefaultContentMethodDTO>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { const next = await action(); setMethod(next); setContent(fields(next.draft)); setNotice(message); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "默认创作方法暂时无法操作。"); }
    finally { setBusy(false); }
  }

  function regenerate() {
    if (!window.confirm("重新整理会替换当前尚未人工修改的内容，是否继续？")) return;
    void run(() => request("POST", { action: "GENERATE_CANDIDATE", replaceExisting: true }), "待确认的调整已重新整理。");
  }

  async function publishDraft() {
    const saved = await request("PUT", { version: draft!.version, sections: draftSections });
    if (!saved.draft?.readyToPublish) throw new Error("调整后的内容或依据还需要补充，请先检查。");
    return request("PATCH", { action: "PUBLISH", version: draft!.version });
  }

  return <Card className="mb-8 border-white/75 bg-white/72 p-5 sm:p-6" data-testid="default-content-method">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">鑫世界默认创作方法</h2>{current ? <Badge>当前使用</Badge> : <Badge>尚未设置</Badge>}</div><p className="mt-2 text-sm text-[var(--text-secondary)]">公司正式采用的内容创作指南。它帮助做判断，不是强制模板。</p>{method.updatedAt ? <p className="mt-1 text-xs text-[var(--text-secondary)]">最近调整：{new Date(method.updatedAt).toLocaleString("zh-CN")}</p> : null}</div>{editable && !current && !draft ? <Button disabled={busy} onClick={() => void run(() => request("POST", { action: "GENERATE_CANDIDATE" }), "待确认的内容已整理，请检查后设为当前使用。")} >开始设置</Button> : editable && current && !draft ? <Button disabled={busy} onClick={() => void run(() => request("POST", { action: "CREATE_DRAFT" }), "调整草稿已创建。")} >开始调整</Button> : null}</div>
    {current ? <GuideSections sections={sections} onOpen={setOpenSection} /> : <div className="mt-5 rounded-xl border border-dashed p-5 text-sm text-[var(--text-secondary)]">默认创作方法尚未正式发布。现有个人方法和 Studio 创作不会受到影响。</div>}
    {draft && editable ? <details className="default-method-admin"><summary><span><strong>正在调整</strong><small>仅有编辑权限的员工可见，展开后继续修改</small></span><Badge>管理</Badge></summary><section><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{draft.origin === "AI_SUGGESTION" ? "AI 整理的待确认内容" : "待确认的调整"}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">每行一条简短建议。设为当前使用前，每条建议都需要保留依据。</p></div><Badge>正在调整</Badge></div><div className="mt-4 grid gap-4 md:grid-cols-2">{defaultContentMethodSectionCodes.map((code) => <label key={code} className="grid gap-1.5 text-sm"><span className="font-medium">{labels[code]}</span><textarea aria-label={`${labels[code]}草稿`} value={content[code]} onChange={(event) => setContent((current) => ({ ...current, [code]: event.target.value }))} className="min-h-28 resize-y rounded-xl border bg-transparent p-3 leading-6" placeholder="暂未填写" /></label>)}</div>{!draftReadyToPublish ? <p className="mt-4 text-sm text-[var(--text-secondary)]">当前调整还有部分内容或依据需要补充，暂时不能设为当前使用。</p> : null}<div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => void run(() => request("PUT", { version: draft.version, sections: draftSections }), "调整已保存。")} >保存调整</Button><Button disabled={busy || !draftReadyToPublish} onClick={() => void run(publishDraft, "新的默认创作方法已设为当前使用。")} >设为当前使用</Button>{draft.origin === "AI_SUGGESTION" ? <Button variant="secondary" disabled={busy} onClick={regenerate}>重新整理</Button> : null}</div><details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">查看调整依据</summary><EvidenceSummary sections={draftSections} /></details></section></details> : null}
    {current ? <details className="mt-5 border-t pt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">查看依据</summary><EvidenceSummary sections={sections} /></details> : null}
    {method.history.length ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">历史记录（{method.history.length}）</summary><div className="mt-3 grid gap-2">{method.history.map((version, index) => <div key={version.id} className="rounded-xl bg-[var(--surface-elevated)] p-3 text-sm"><span className="font-medium">{index === method.history.length - 1 ? "首次使用" : `第 ${method.history.length - index} 次调整`}</span><span className="ml-2 text-[var(--text-secondary)]">{version.publishedAt ? new Date(version.publishedAt).toLocaleString("zh-CN") : ""}</span></div>)}</div></details> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}{notice ? <p role="status" className="mt-4 text-sm text-[var(--success)]">{notice}</p> : null}
    <StudioDrawer title={openSection ? labels[openSection.code] : "创作方法详情"} open={Boolean(openSection)} onClose={() => setOpenSection(null)}>{openSection ? <div><p className="text-sm leading-6 text-[var(--text-secondary)]">本次创作只会按动作使用相关方法，不会一次把七个模块全部交给 AI。</p><ul className="mt-5 space-y-3">{openSection.items.map((item) => <li key={item.text} className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-7">{item.text}</li>)}</ul><details className="mt-5 rounded-xl border p-4"><summary className="text-sm font-semibold text-[var(--accent)]">查看这一部分的依据</summary><EvidenceSummary sections={[openSection]} /></details></div> : null}</StudioDrawer>
  </Card>;
}

function GuideSections({ sections, onOpen }: { sections: DefaultContentMethodSection[]; onOpen: (section: DefaultContentMethodSection) => void }) {
  return <div className="default-method-modules">{defaultContentMethodSectionCodes.map((code, index) => { const section = sections.find((item) => item.code === code) ?? { code, items: [] }; return <button type="button" key={code} onClick={() => onOpen(section)}><span>{index + 1}</span><strong>{labels[code]}</strong><p>{section.items[0]?.text || "暂未填写"}</p><small>{section.items.length ? `${section.items.length} 条方法建议` : "暂无内容"}</small></button>; })}</div>;
}

function EvidenceSummary({ sections }: { sections: DefaultContentMethodSection[] }) {
  const sources = sections.flatMap(({ items }) => items.flatMap(({ sourceRefs }) => sourceRefs)).filter((source, index, all) => all.findIndex((candidate) => candidate.type === source.type && candidate.referenceId === source.referenceId) === index);
  return sources.length ? <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{sources.map((source) => <li key={`${source.type}-${source.referenceId}`}>{source.label}</li>)}</ul> : <p className="mt-3 text-sm text-[var(--text-secondary)]">当前内容还没有可查看的依据。</p>;
}
