"use client";

import { Badge, Button, Card } from "@content-center/ui";
import Link from "next/link";
import { useRef, useState } from "react";
import { PLATFORM_LABELS, SUPPORTED_PLATFORMS, type PlatformParameters, type PlatformVariantView, type SupportedPlatform } from "@/lib/platforms";
import { AddToPublishingButton } from "@/components/publishing/add-to-publishing-button";

type IntegrationStatus = "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "DISABLED" | "ERROR" | "MOCK";
type PreviewRun = { id: string; platform: SupportedPlatform; output: unknown; sourceMotherVersion: number; contextTruncated?: boolean };
type Draft = { title: string; body: string; hook: string; summary: string; hashtags: string; mediaPlan: string; metadata: string };

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function draftFrom(variant?: PlatformVariantView): Draft { return { title: variant?.title ?? "", body: variant?.body ?? "", hook: variant?.hook ?? "", summary: variant?.summary ?? "", hashtags: variant?.hashtags.join("\n") ?? "", mediaPlan: JSON.stringify(variant?.mediaPlan ?? {}, null, 2), metadata: JSON.stringify(variant?.metadata ?? {}, null, 2) }; }

export function PlatformContentFactory({ projectId, activePlatform, motherVersion, variants, editable, integrationStatus, motherConfirmed = false, onSelectPlatform, onVariantChange }: { projectId: string; activePlatform: SupportedPlatform; motherVersion: number; variants: PlatformVariantView[]; editable: boolean; integrationStatus: IntegrationStatus; motherConfirmed?: boolean; onSelectPlatform: (platform: SupportedPlatform) => void; onVariantChange: (variant: PlatformVariantView) => void }) {
  const configured = integrationStatus === "CONFIGURED" || integrationStatus === "MOCK";
  const variantMap = Object.fromEntries(variants.map((variant) => [variant.platform, variant])) as Partial<Record<SupportedPlatform, PlatformVariantView>>;
  const [previews, setPreviews] = useState<Partial<Record<SupportedPlatform, PreviewRun>>>({});
  const [selected, setSelected] = useState<Record<SupportedPlatform, boolean>>({ DOUYIN: true, XIAOHONGSHU: true, WECHAT_MOMENTS: true, WECHAT_CHANNELS: true, WECHAT_OFFICIAL: true });
  const [parameters, setParameters] = useState<Record<SupportedPlatform, PlatformParameters>>({ DOUYIN: { duration: 60 }, XIAOHONGSHU: { style: "VIEWPOINT" }, WECHAT_MOMENTS: { variantType: "VIEWPOINT" }, WECHAT_CHANNELS: {}, WECHAT_OFFICIAL: {} });
  const [drafts, setDrafts] = useState<Partial<Record<SupportedPlatform, Draft>>>(() => Object.fromEntries(variants.map((variant) => [variant.platform, draftFrom(variant)])));
  const versions = useRef<Partial<Record<SupportedPlatform, number>>>(Object.fromEntries(variants.map((variant) => [variant.platform, variant.version])));
  const timers = useRef<Partial<Record<SupportedPlatform, ReturnType<typeof setTimeout>>>>({});
  const pending = useRef<Partial<Record<SupportedPlatform, Draft>>>({});
  const inFlight = useRef<Partial<Record<SupportedPlatform, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [acknowledgedStale, setAcknowledgedStale] = useState<Partial<Record<SupportedPlatform, boolean>>>({});

  async function call(path: string, method: "POST" | "PUT", body: unknown) {
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || "平台内容操作失败");
    return result;
  }

  async function submitReview() {
    if (!variant) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await call(`/api/projects/${projectId}/platform-variants/${activePlatform}/review/submit`, "POST", { expectedVersion: versions.current[activePlatform] }) as { variant: { status: "IN_REVIEW"; version: number } };
      syncVariant({ ...variant, status: result.variant.status, version: result.variant.version });
      setMessage(`${PLATFORM_LABELS[activePlatform]}已提交人工审核，不会自动运行 AI 检查。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提交审核失败"); }
    finally { setBusy(false); }
  }

  async function generate(platforms: SupportedPlatform[]) {
    if (!platforms.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await call(`/api/projects/${projectId}/platform-variants/generate`, "POST", { platforms, parameters: Object.fromEntries(platforms.map((platform) => [platform, parameters[platform]])) }) as { runs: PreviewRun[] };
      setPreviews((current) => ({ ...current, ...Object.fromEntries(result.runs.map((run) => [run.platform, run])) }));
      onSelectPlatform(platforms[0]!);
      setMessage(`已生成 ${result.runs.length} 个平台预览，应用后才会写入平台草稿。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "平台生成失败"); }
    finally { setBusy(false); }
  }

  function syncVariant(variant: PlatformVariantView) {
    versions.current[variant.platform] = variant.version;
    setDrafts((current) => ({ ...current, [variant.platform]: draftFrom(variant) }));
    onVariantChange(variant);
  }

  async function applyPreview(platform: SupportedPlatform) {
    const preview = previews[platform];
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const variant = await call(`/api/projects/${projectId}/platform-variants/${platform}/apply`, "POST", { runId: preview.id, expectedVersion: versions.current[platform] ?? 0 }) as PlatformVariantView;
      syncVariant(variant);
      setPreviews((current) => ({ ...current, [platform]: undefined }));
      setAcknowledgedStale((current) => ({ ...current, [platform]: false }));
      setMessage(`${PLATFORM_LABELS[platform]}稿已应用。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "应用失败"); }
    finally { setBusy(false); }
  }

  async function discardPreview(platform: SupportedPlatform) {
    const preview = previews[platform];
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await call(`/api/projects/${projectId}/ai/runs/${preview.id}/discard`, "POST", {});
      setPreviews((current) => ({ ...current, [platform]: undefined }));
      setMessage(`已放弃${PLATFORM_LABELS[platform]}预览。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "放弃失败"); }
    finally { setBusy(false); }
  }

  async function drain(platform: SupportedPlatform) {
    if (inFlight.current[platform] || !pending.current[platform]) return;
    const snapshot = pending.current[platform]!;
    pending.current[platform] = undefined;
    inFlight.current[platform] = true;
    try {
      const mediaPlan = JSON.parse(snapshot.mediaPlan || "{}") as unknown;
      const metadata = JSON.parse(snapshot.metadata || "{}") as unknown;
      const variant = await call(`/api/projects/${projectId}/platform-variants/${platform}`, "PUT", { title: snapshot.title || null, body: snapshot.body, hook: snapshot.hook || null, summary: snapshot.summary || null, hashtags: snapshot.hashtags.split("\n").map((item) => item.trim()).filter(Boolean), mediaPlan, metadata, expectedVersion: versions.current[platform] }) as PlatformVariantView;
      versions.current[platform] = variant.version;
      onVariantChange(variant);
      setMessage(`${PLATFORM_LABELS[platform]}已保存`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "平台稿保存失败"); }
    finally { inFlight.current[platform] = false; if (pending.current[platform]) void drain(platform); }
  }

  function updateDraft(platform: SupportedPlatform, patch: Partial<Draft>) {
    const next = { ...(drafts[platform] ?? draftFrom(variantMap[platform])), ...patch };
    setDrafts((current) => ({ ...current, [platform]: next }));
    setMessage("等待保存"); setError("");
    const timer = timers.current[platform];
    if (timer) clearTimeout(timer);
    timers.current[platform] = setTimeout(() => { pending.current[platform] = next; void drain(platform); }, 800);
  }

  const variant = variantMap[activePlatform];
  const draft = drafts[activePlatform] ?? draftFrom(variant);
  const preview = previews[activePlatform];
  const isStale = Boolean(variant && variant.sourceMotherVersion < motherVersion);
  if (!motherConfirmed) return <Card className="p-6"><h2 className="font-semibold">请先确认当前口播稿</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">确认后才能生成平台稿。</p></Card>;
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{PLATFORM_LABELS[activePlatform]}稿</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">基于口播稿的独立平台草稿 · 停止输入 800ms 后保存</p></div><Badge>{variant ? (isStale ? "口播稿已更新" : variant.status === "IN_REVIEW" ? "待审核" : variant.status === "APPROVED" ? "已批准" : "草稿") : "未生成"}</Badge></div>
      {isStale && !acknowledgedStale[activePlatform] ? <div className="mt-4 rounded-xl border border-[var(--warning)] p-4 text-sm"><p className="font-medium">母稿已更新</p><p className="mt-1 text-[var(--text-secondary)]">当前平台稿基于更新前的口播稿，不会自动覆盖。</p>{editable ? <div className="mt-3 flex gap-2"><Button onClick={() => generate([activePlatform])} disabled={!configured || busy}>重新生成</Button><Button variant="secondary" onClick={() => { setAcknowledgedStale((current) => ({ ...current, [activePlatform]: true })); setMessage("继续使用当前平台稿，内容未被修改。"); }}>继续使用当前平台稿</Button></div> : null}</div> : null}
      {variant ? <PlatformEditor platform={activePlatform} draft={draft} editable={editable} onChange={(patch) => updateDraft(activePlatform, patch)} /> : <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-sm text-[var(--text-secondary)]">尚未生成{PLATFORM_LABELS[activePlatform]}稿。先在右侧生成预览，再人工应用。</div>}
      {variant ? <div className="mt-5 grid gap-3 border-t pt-5"><div className="flex flex-wrap gap-2">{editable && ["READY", "DRAFT"].includes(variant.status) ? <Button disabled={busy} onClick={submitReview}>提交审核</Button> : null}<Button asChild variant="secondary"><Link href={`/projects/${projectId}/review/${activePlatform}`}>查看审核</Link></Button></div><AddToPublishingButton compact projectId={projectId} platform={activePlatform} disabledReason={!editable ? "VIEWER 只能查看发布任务。" : isStale ? "母稿已更新，必须重新生成并审核。" : variant.status !== "APPROVED" ? "平台内容尚未通过人工审核。" : undefined} /></div> : null}
    </Card>
    <Card className="p-5">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">平台适配</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">先生成预览，再由你确认应用到平台草稿。</p></div></div>
      {!configured ? <div className="mt-4 rounded-xl border border-dashed p-4 text-sm">内容生成服务暂时不可用，请联系管理员。</div> : null}
      {configured && editable ? <><PlatformParameter platform={activePlatform} value={parameters[activePlatform]} onChange={(value) => setParameters((current) => ({ ...current, [activePlatform]: value }))} /><Button className="mt-4 w-full" disabled={busy} onClick={() => generate([activePlatform])}>{variant ? `重新生成${PLATFORM_LABELS[activePlatform]}` : `生成${PLATFORM_LABELS[activePlatform]}`}</Button><div className="my-5 border-t" /><p className="text-sm font-medium">生成多平台内容</p><div className="mt-3 grid grid-cols-2 gap-2">{SUPPORTED_PLATFORMS.map((platform) => <label key={platform} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected[platform]} onChange={(event) => setSelected((current) => ({ ...current, [platform]: event.target.checked }))} />{PLATFORM_LABELS[platform]}</label>)}</div><Button variant="secondary" className="mt-4 w-full" disabled={busy || !SUPPORTED_PLATFORMS.some((platform) => selected[platform])} onClick={() => generate(SUPPORTED_PLATFORMS.filter((platform) => selected[platform]))}>生成多平台内容</Button></> : null}
      {busy ? <p role="status" className="mt-4 text-sm text-[var(--text-secondary)]">AI 正在顺序生成…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p role="status" className="mt-4 text-sm text-[var(--success)]">{message}</p> : null}
      {preview ? <div className="mt-5 border-t pt-5"><div className="flex items-center justify-between"><h3 className="font-semibold">{PLATFORM_LABELS[activePlatform]}预览</h3>{preview.contextTruncated ? <Badge>上下文已截断</Badge> : null}</div><PlatformPreview platform={activePlatform} output={preview.output} /><div className="mt-4 grid gap-2"><Button disabled={busy} onClick={() => applyPreview(activePlatform)}>应用为{PLATFORM_LABELS[activePlatform]}稿</Button><div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => generate([activePlatform])}>重新生成</Button><Button variant="ghost" disabled={busy} onClick={() => discardPreview(activePlatform)}>放弃</Button></div></div></div> : null}
    </Card>
  </div>;
}

function PlatformParameter({ platform, value, onChange }: { platform: SupportedPlatform; value: PlatformParameters; onChange: (value: PlatformParameters) => void }) {
  if (platform === "DOUYIN") return <label className="mt-4 block text-sm">口播时长<select aria-label="抖音时长" value={value.duration ?? 60} onChange={(event) => onChange({ ...value, duration: Number(event.target.value) as 30 | 60 | 90 })} className="mt-2 h-10 w-full rounded-lg border bg-transparent px-3"><option value={30}>30 秒</option><option value={60}>60 秒</option><option value={90}>90 秒</option></select></label>;
  if (platform === "XIAOHONGSHU") return <label className="mt-4 block text-sm">内容风格<select aria-label="小红书风格" value={value.style ?? "VIEWPOINT"} onChange={(event) => onChange({ ...value, style: event.target.value as "VIEWPOINT" | "EXPERIENCE" | "LIST" })} className="mt-2 h-10 w-full rounded-lg border bg-transparent px-3"><option value="VIEWPOINT">观点型</option><option value="EXPERIENCE">经验型</option><option value="LIST">清单型</option></select></label>;
  if (platform === "WECHAT_MOMENTS") return <label className="mt-4 block text-sm">默认采用版本<select aria-label="朋友圈版本类型" value={value.variantType ?? "VIEWPOINT"} onChange={(event) => onChange({ ...value, variantType: event.target.value as "SHORT" | "VIEWPOINT" | "STORY" })} className="mt-2 h-10 w-full rounded-lg border bg-transparent px-3"><option value="SHORT">短版</option><option value="VIEWPOINT">观点版</option><option value="STORY">故事版</option></select></label>;
  return null;
}

function PlatformEditor({ platform, draft, editable, onChange }: { platform: SupportedPlatform; draft: Draft; editable: boolean; onChange: (patch: Partial<Draft>) => void }) {
  return <div className="mt-5 grid gap-4">
    {platform !== "WECHAT_MOMENTS" ? <label className="text-sm">标题<input aria-label={`${PLATFORM_LABELS[platform]}标题`} value={draft.title} disabled={!editable} onChange={(event) => onChange({ title: event.target.value })} className="mt-2 h-11 w-full rounded-lg border bg-transparent px-3" /></label> : null}
    {["DOUYIN", "WECHAT_CHANNELS"].includes(platform) ? <label className="text-sm">开场<input aria-label={`${PLATFORM_LABELS[platform]}开场`} value={draft.hook} disabled={!editable} onChange={(event) => onChange({ hook: event.target.value })} className="mt-2 h-11 w-full rounded-lg border bg-transparent px-3" /></label> : null}
    {["WECHAT_CHANNELS", "WECHAT_OFFICIAL"].includes(platform) ? <label className="text-sm">摘要 / 简介<textarea aria-label={`${PLATFORM_LABELS[platform]}摘要`} value={draft.summary} disabled={!editable} onChange={(event) => onChange({ summary: event.target.value })} rows={3} className="mt-2 w-full rounded-lg border bg-transparent p-3" /></label> : null}
    <label className="text-sm">正文<textarea aria-label={`${PLATFORM_LABELS[platform]}正文`} value={draft.body} disabled={!editable} onChange={(event) => onChange({ body: event.target.value })} rows={18} className="mt-2 w-full rounded-lg border bg-transparent p-4 leading-7" /></label>
    {!["WECHAT_MOMENTS", "WECHAT_OFFICIAL"].includes(platform) ? <label className="text-sm">话题标签（每行一个）<textarea aria-label={`${PLATFORM_LABELS[platform]}话题标签`} value={draft.hashtags} disabled={!editable} onChange={(event) => onChange({ hashtags: event.target.value })} rows={4} className="mt-2 w-full rounded-lg border bg-transparent p-3" /></label> : null}
  </div>;
}

function PlatformPreview({ platform, output }: { platform: SupportedPlatform; output: unknown }) {
  const data = object(output);
  if (platform === "WECHAT_MOMENTS") return <div className="mt-3 grid gap-2">{array(data.variants).map((item, index) => { const value = object(item); return <div key={index} className="rounded-lg border p-3 text-xs"><strong>{text(value.type)}</strong><p className="mt-2 whitespace-pre-wrap leading-5">{text(value.body)}</p></div>; })}</div>;
  const titles = array(data.titles);
  return <div className="mt-3 max-h-96 overflow-auto rounded-lg border p-3 text-xs">{titles.length ? <ul className="mb-3 list-decimal pl-4">{titles.map((title, index) => <li key={index}>{text(title)}</li>)}</ul> : <p className="font-semibold">{text(data.title)}</p>}{text(data.hook) ? <p className="mt-2 text-[var(--text-secondary)]">开场：{text(data.hook)}</p> : null}{text(data.summary) || text(data.description) ? <p className="mt-2 text-[var(--text-secondary)]">{text(data.summary) || text(data.description)}</p> : null}<p className="mt-3 whitespace-pre-wrap leading-6">{text(data.body)}</p></div>;
}
