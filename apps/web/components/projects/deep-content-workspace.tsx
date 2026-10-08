"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { useEffect, useState } from "react";
import type { DeepContentPackageOutput } from "@/server/deep-content/schemas";

type PackageView = DeepContentPackageOutput & { id: string; version: number; status: string; creatorProfileId: string | null; createdAt: string; updatedAt: string };
type AIRunPreview = { id: string; output: DeepContentPackageOutput; contextTruncated: boolean };
type MotherSnapshot = { title: string; body: string; outline: string[]; version: number; origin: "HUMAN" | "KIMI" | "GPT_WEB"; originNote: string | null };
type ContentType = "SPOKEN_60" | "SPOKEN_90" | "LONG_SPOKEN" | "LONG_ARTICLE" | "CUSTOM";

const contentTypes: Array<[ContentType, string]> = [["SPOKEN_60", "60秒口播"], ["SPOKEN_90", "90秒口播"], ["LONG_SPOKEN", "长口播"], ["LONG_ARTICLE", "长文章"], ["CUSTOM", "自定义"]];
const evidenceClassLabels: Record<string, string> = { CONFIRMED: "已确认", CREATOR_VIEW: "创作者观点", AI_SUGGESTION: "AI 建议", NEEDS_VERIFICATION: "待核实" };

function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function List({ items, empty = "暂无" }: { items: string[]; empty?: string }) { return items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--text-secondary)]">{empty}</p>; }

export function DeepContentWorkspace({ projectId, initialPackage, editable, integrationStatus, motherContent, onMotherImported }: {
  projectId: string;
  initialPackage: PackageView | null;
  editable: boolean;
  integrationStatus: "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "DISABLED" | "ERROR" | "MOCK";
  motherContent: MotherSnapshot;
  onMotherImported: (content: MotherSnapshot) => void;
}) {
  const [saved, setSaved] = useState(initialPackage);
  const [preview, setPreview] = useState<AIRunPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [coreTopic, setCoreTopic] = useState(saved?.topicPackage.coreTopic ?? "");
  const [mainViewpoint, setMainViewpoint] = useState(saved?.viewpointPackage.mainViewpoint ?? "");
  const [supportingViewpoints, setSupportingViewpoints] = useState(saved?.viewpointPackage.supportingViewpoints.join("\n") ?? "");
  const [personalViews, setPersonalViews] = useState(saved?.creatorContribution.personalViews.join("\n") ?? "");
  const [recommendedStructure, setRecommendedStructure] = useState(saved?.structurePackage.recommendedStructure ?? "");
  const [risks, setRisks] = useState(saved?.risks.join("\n") ?? "");
  const [contentType, setContentType] = useState<ContentType>("SPOKEN_60");
  const [customRequirements, setCustomRequirements] = useState("");
  const [taskPackage, setTaskPackage] = useState<{ packageId: string; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importTitle, setImportTitle] = useState("");
  const [importBody, setImportBody] = useState("");
  const [importNote, setImportNote] = useState("");
  const configured = integrationStatus === "CONFIGURED" || integrationStatus === "MOCK";

  useEffect(() => {
    if (!saved) return;
    setCoreTopic(saved.topicPackage.coreTopic);
    setMainViewpoint(saved.viewpointPackage.mainViewpoint);
    setSupportingViewpoints(saved.viewpointPackage.supportingViewpoints.join("\n"));
    setPersonalViews(saved.creatorContribution.personalViews.join("\n"));
    setRecommendedStructure(saved.structurePackage.recommendedStructure);
    setRisks(saved.risks.join("\n"));
    setTaskPackage(null);
  }, [saved]);

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(path, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || "操作失败");
    return result as Record<string, unknown>;
  }

  async function generate() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request(`/api/projects/${projectId}/deep-content-package/generate`, { method: "POST" });
      setPreview({ id: String(result.id), output: result.output as DeepContentPackageOutput, contextTruncated: Boolean(result.contextTruncated) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "生成失败"); }
    finally { setBusy(false); }
  }

  async function applyPreview() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const result = await request(`/api/projects/${projectId}/deep-content-package/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: preview.id }) });
      setSaved(result.package as PackageView); setPreview(null); setMessage("创作包已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(false); }
  }

  async function discardPreview() {
    if (!preview) return;
    setBusy(true); setError("");
    try { await request(`/api/projects/${projectId}/ai/runs/${preview.id}/discard`, { method: "POST" }); setPreview(null); setMessage("已放弃本次创作包"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "放弃失败"); }
    finally { setBusy(false); }
  }

  async function saveEdits() {
    if (!saved) return;
    setBusy(true); setError("");
    try {
      const result = await request(`/api/projects/${projectId}/deep-content-package`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ packageId: saved.id, expectedUpdatedAt: saved.updatedAt, coreTopic, mainViewpoint, supportingViewpoints: lines(supportingViewpoints), personalViews: lines(personalViews), recommendedStructure, risks: lines(risks) }) });
      setSaved(result.package as PackageView); setMessage("创作包编辑已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "编辑保存失败"); }
    finally { setBusy(false); }
  }

  async function buildTaskPackage() {
    setBusy(true); setError(""); setMessage("");
    try {
      const query = new URLSearchParams({ contentType });
      if (customRequirements.trim()) query.set("customRequirements", customRequirements.trim());
      const result = await request(`/api/projects/${projectId}/gpt-task-package?${query.toString()}`);
      setTaskPackage({ packageId: String(result.packageId), text: String(result.text) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "任务包生成失败"); }
    finally { setBusy(false); }
  }

  async function copyTaskPackage() {
    if (!taskPackage) return;
    setBusy(true); setError("");
    try {
      await navigator.clipboard.writeText(taskPackage.text);
      await request(`/api/projects/${projectId}/gpt-task-package/copied`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packageId: taskPackage.packageId, contentType, characterCount: taskPackage.text.length }) });
      setMessage("已复制，请前往 ChatGPT 网页版完成高级创作");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "复制失败"); }
    finally { setBusy(false); }
  }

  async function importDraft() {
    if (!importTitle.trim() || !importBody.trim()) { setError("标题和正文不能为空。"); return; }
    const confirmReplace = motherContent.version === 0 || window.confirm("导入 GPT 成稿将创建新的母稿版本，现有平台内容可能需要重新生成。确定继续吗？");
    if (!confirmReplace) return;
    setBusy(true); setError("");
    try {
      const result = await request(`/api/projects/${projectId}/import-gpt-draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: importTitle, body: importBody, note: importNote || undefined, confirmReplace }) });
      onMotherImported((result.motherContent as MotherSnapshot));
      setShowImport(false); setImportTitle(""); setImportBody(""); setImportNote("");
      setMessage("GPT Web 成稿已保存为新母稿版本");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败"); }
    finally { setBusy(false); }
  }

  return <section className="space-y-5">
    <Card className="p-4"><p className="text-xs font-medium text-[var(--text-secondary)]">推荐顺序</p><p className="mt-2 text-sm">1 素材 → 2 观点 / 证据 → 3 深度创作包 → 4 复制给 GPT → 5 导入核心母稿 → 6 多平台适配</p></Card>
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">深度创作包</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">整理选题、观点、证据、表达和结构，保存后再交给最终主笔。</p></div><div className="flex gap-2">{saved ? <Badge>v{saved.version} · {saved.status === "READY" ? "已保存" : saved.status}</Badge> : null}</div></div>
      {!configured ? <p className="mt-4 rounded-xl border border-dashed p-4 text-sm">内容生成服务暂时不可用，请联系管理员。</p> : null}
      {editable && configured ? <div className="mt-4 flex gap-2"><Button disabled={busy} onClick={generate}>{saved ? "重新生成深度创作包" : "生成深度创作包"}</Button></div> : null}
      {busy ? <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">正在处理…</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-[var(--success)]">{message}</p> : null}
    </Card>

    {preview ? <Card className="p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">深度创作包预览</h2>{preview.contextTruncated ? <Badge>上下文已截断</Badge> : null}</div><PackageSections value={preview.output} /><div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy} onClick={applyPreview}>保存创作包</Button><Button variant="secondary" disabled={busy} onClick={generate}>重新生成</Button><Button variant="ghost" disabled={busy} onClick={discardPreview}>放弃</Button></div></Card> : null}

    {saved ? <>
      <Card className="p-5"><h2 className="text-lg font-semibold">已保存创作包</h2><PackageSections value={saved} /></Card>
      <Card className="p-5"><h2 className="text-lg font-semibold">人工编辑关键内容</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">最终选择的选题<input aria-label="最终选择的选题" value={coreTopic} disabled={!editable} onChange={(event) => setCoreTopic(event.target.value)} className="h-10 rounded-lg border bg-[var(--surface)] px-3" /></label>
        <label className="grid gap-1 text-sm">推荐结构<input aria-label="推荐结构" value={recommendedStructure} disabled={!editable} onChange={(event) => setRecommendedStructure(event.target.value)} className="h-10 rounded-lg border bg-[var(--surface)] px-3" /></label>
        <label className="grid gap-1 text-sm md:col-span-2">主观点<textarea aria-label="主观点" value={mainViewpoint} disabled={!editable} onChange={(event) => setMainViewpoint(event.target.value)} rows={3} className="rounded-lg border bg-[var(--surface)] p-3" /></label>
        <label className="grid gap-1 text-sm">支撑观点（每行一条）<textarea aria-label="支撑观点" value={supportingViewpoints} disabled={!editable} onChange={(event) => setSupportingViewpoints(event.target.value)} rows={5} className="rounded-lg border bg-[var(--surface)] p-3" /></label>
        <label className="grid gap-1 text-sm">创作者观点（每行一条）<textarea aria-label="创作者观点" value={personalViews} disabled={!editable} onChange={(event) => setPersonalViews(event.target.value)} rows={5} className="rounded-lg border bg-[var(--surface)] p-3" /></label>
        <label className="grid gap-1 text-sm md:col-span-2">风险备注（每行一条）<textarea aria-label="风险备注" value={risks} disabled={!editable} onChange={(event) => setRisks(event.target.value)} rows={4} className="rounded-lg border bg-[var(--surface)] p-3" /></label>
      </div>{editable ? <Button className="mt-4" disabled={busy} onClick={saveEdits}>保存创作包编辑</Button> : null}</Card>

      <Card className="p-5"><h2 className="text-lg font-semibold">GPT 创作任务包</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">确定性模板生成，不调用 GPT API。</p><div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end"><label className="grid gap-1 text-sm">内容类型<select aria-label="GPT 内容类型" value={contentType} disabled={!editable} onChange={(event) => { setContentType(event.target.value as ContentType); setTaskPackage(null); }} className="h-10 rounded-lg border bg-[var(--surface)] px-3">{contentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm">补充要求（可选）<input aria-label="GPT 补充要求" value={customRequirements} disabled={!editable} onChange={(event) => { setCustomRequirements(event.target.value); setTaskPackage(null); }} className="h-10 rounded-lg border bg-[var(--surface)] px-3" /></label>{editable ? <Button disabled={busy} onClick={buildTaskPackage}>生成 GPT 创作任务包</Button> : null}</div>
      {taskPackage ? <div className="mt-4"><textarea aria-label="GPT 创作任务包" readOnly value={taskPackage.text} rows={18} className="w-full rounded-xl border bg-[var(--surface-elevated)] p-4 font-mono text-xs leading-6" />{editable ? <Button className="mt-3" disabled={busy} onClick={copyTaskPackage}>复制给 GPT</Button> : null}</div> : null}</Card>

      <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">导入 GPT 成稿</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">来源固定为 GPT Web；系统不登录、不抓取、不自动发送。</p></div>{editable ? <Button variant="secondary" onClick={() => setShowImport((value) => !value)}>{showImport ? "关闭导入" : "导入 GPT 成稿"}</Button> : null}</div>{showImport ? <div className="mt-4 grid gap-3"><p className="rounded-lg bg-[var(--surface-elevated)] p-3 text-sm"><strong>来源：GPT Web</strong><br />导入 GPT 成稿将创建新的母稿版本，现有平台内容可能需要重新生成。</p><label className="grid gap-1 text-sm">标题<input aria-label="GPT 成稿标题" value={importTitle} onChange={(event) => setImportTitle(event.target.value)} className="h-10 rounded-lg border bg-[var(--surface)] px-3" /></label><label className="grid gap-1 text-sm">正文<textarea aria-label="GPT 成稿正文" value={importBody} onChange={(event) => setImportBody(event.target.value)} rows={12} className="rounded-lg border bg-[var(--surface)] p-3" /></label><label className="grid gap-1 text-sm">备注（可选）<textarea aria-label="GPT 成稿备注" value={importNote} onChange={(event) => setImportNote(event.target.value)} rows={3} className="rounded-lg border bg-[var(--surface)] p-3" /></label><Button disabled={busy} onClick={importDraft}>保存为母稿</Button></div> : null}</Card>
    </> : null}
  </section>;
}

function PackageSections({ value }: { value: DeepContentPackageOutput }) {
  return <div className="mt-4 grid gap-4 lg:grid-cols-2">
    <article className="rounded-xl border p-4"><h3 className="font-semibold">选题方案</h3><p className="mt-2 text-sm font-medium">{value.topicPackage.coreTopic}</p><p className="mt-2 text-sm text-[var(--text-secondary)]">{value.topicPackage.coreQuestion}</p><List items={value.topicPackage.candidateTopics.map((item) => `${item.title}：${item.angle}`)} /></article>
    <article className="rounded-xl border p-4"><h3 className="font-semibold">观点体系</h3><p className="mt-2 text-sm font-medium">{value.viewpointPackage.mainViewpoint}</p><List items={value.viewpointPackage.supportingViewpoints} /></article>
    <article className="rounded-xl border p-4"><h3 className="font-semibold">证据与事实边界</h3>{value.evidencePackage.items.length ? <div className="mt-2 space-y-2">{value.evidencePackage.items.map((item, index) => <div key={index} className="rounded-lg bg-[var(--surface-elevated)] p-3 text-sm"><Badge>{evidenceClassLabels[item.classification] || item.classification}</Badge><p className="mt-2">{item.content}</p>{item.needsVerification ? <p className="mt-1 text-xs text-[var(--warning)]">需要确认</p> : null}</div>)}</div> : <p className="mt-2 text-sm text-[var(--text-secondary)]">当前创作包没有可引用的正式证据；不得补写为事实。</p>}</article>
    <article className="rounded-xl border p-4"><h3 className="font-semibold">表达素材</h3><List items={value.expressionPackage.hooks.map((item) => item.text)} /><List items={value.expressionPackage.goldenLines} /></article>
    <article className="rounded-xl border p-4"><h3 className="font-semibold">结构方案</h3><p className="mt-2 text-sm">推荐：{value.structurePackage.recommendedStructure}</p><List items={value.structurePackage.structures.map((item) => `${item.name}：${item.whySuitable}`)} /></article>
    <article className="rounded-xl border p-4"><h3 className="font-semibold">创作者资产</h3><List items={[...value.creatorContribution.personalViews, ...value.creatorContribution.personalExperiences, ...value.creatorContribution.personalCases]} empty="暂无真实个人资产；系统不会编造经历。" /></article>
    <article className="rounded-xl border p-4 lg:col-span-2"><h3 className="font-semibold">风险 / 待确认</h3><List items={[...value.risks, ...value.needsConfirmation]} /></article>
  </div>;
}

export type { PackageView, MotherSnapshot };
