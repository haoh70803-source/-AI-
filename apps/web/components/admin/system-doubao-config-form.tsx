"use client";

import { Badge, Button, Card, Input } from "@content-center/ui";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SystemDoubaoAdminView } from "@/server/admin/system-providers";

function text(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "string" ? config[key] : "";
}

function SecretInput({ label, value, onChange, required, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required: boolean;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return <label className="grid gap-1.5 text-sm">
    <span className="flex items-center justify-between gap-3">
      {label}
      <button type="button" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]" onClick={() => setVisible((current) => !current)}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}{visible ? "隐藏" : "显示"}
      </button>
    </span>
    <Input aria-label={label} type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />
  </label>;
}

export function SystemDoubaoConfigForm({ view }: { view: SystemDoubaoAdminView }) {
  const router = useRouter();
  const stored = view.stored;
  const config = stored?.publicConfig ?? {};
  const initialAuthMode = text(config, "authMode") === "LEGACY_APP_TOKEN" ? "LEGACY_APP_TOKEN" : "API_KEY";
  const [authMode, setAuthMode] = useState<"API_KEY" | "LEGACY_APP_TOKEN">(initialAuthMode);
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasSavedSecret = Boolean(stored?.lastFour && authMode === initialAuthMode);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage(null);
    const body = {
      authMode,
      baseUrl: String(formData.get("baseUrl") ?? ""),
      resourceId: String(formData.get("resourceId") ?? ""),
      appId: String(formData.get("appId") ?? ""),
      boostingTableId: String(formData.get("boostingTableId") ?? ""),
      boostingTableName: String(formData.get("boostingTableName") ?? ""),
      ...(apiKey ? { apiKey } : {}),
      ...(accessToken ? { accessToken } : {}),
    };
    try {
      const response = await fetch("/api/admin/system/providers/DOUBAO_ASR", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: body }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `HTTP_${response.status}`);
      setApiKey("");
      setAccessToken("");
      setMessage("配置已安全保存。此阶段未调用豆包接口。");
      router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      setMessage(code === "INTEGRATION_SECRET_REQUIRED" ? "请填写当前认证方式所需的密钥。" : "保存失败，请检查必填项与地址格式。");
    } finally {
      setBusy(false);
    }
  }

  return <Card className="mt-6 p-6" aria-label="豆包录音文件识别 2.0 系统配置">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">豆包录音文件识别 2.0</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">系统级语音转写配置。凭证仅在服务端加密保存，页面不会回显完整密钥。</p>
      </div>
      <Badge>{stored?.configured ? "已配置" : "未配置"}</Badge>
    </div>

    <div className="mt-4 grid gap-1 rounded-xl bg-[var(--surface-elevated)] p-4 text-sm">
      <p>协议：Recording File 2.0（固定）</p>
      <p>当前生效来源：{view.effectiveSource === "ENV" ? "服务端环境变量" : view.effectiveSource === "DATABASE" ? "管理员加密配置" : "未配置"}</p>
      {stored?.lastFour ? <p aria-label="已保存凭证">已保存凭证：<span className="font-mono">••••••••{stored.lastFour}</span></p> : null}
    </div>

    {!view.systemManagedProviders ? <p className="mt-4 rounded-xl border p-4 text-sm text-[var(--warning)]">系统级 Provider 模式尚未启用。启用前，页面保存的配置不会供 Worker 使用。</p> : null}
    {view.effectiveSource === "ENV" ? <p className="mt-4 rounded-xl border p-4 text-sm text-[var(--warning)]">当前由环境变量配置优先生效；在线保存不会覆盖环境变量。</p> : null}

    <form className="mt-6 grid gap-4 border-t pt-6" action={save}>
      <label className="grid gap-1.5 text-sm">认证方式
        <select className="h-10 rounded-xl border bg-[var(--surface)] px-3" value={authMode} onChange={(event) => setAuthMode(event.target.value as typeof authMode)}>
          <option value="API_KEY">API Key（推荐）</option>
          <option value="LEGACY_APP_TOKEN">App ID + Access Token（兼容旧配置）</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-sm">Base URL<Input name="baseUrl" type="url" required defaultValue={text(config, "baseUrl") || "https://openspeech.bytedance.com"} /></label>
      <label className="grid gap-1.5 text-sm">Resource ID<Input name="resourceId" required defaultValue={text(config, "resourceId")} placeholder="填写豆包控制台提供的 Resource ID" /></label>
      {authMode === "API_KEY" ? <SecretInput label="豆包 API Key" value={apiKey} onChange={setApiKey} required={!hasSavedSecret} placeholder={hasSavedSecret ? "留空则保留已保存密钥" : "输入 API Key"} /> : <>
        <label className="grid gap-1.5 text-sm">App ID<Input name="appId" required defaultValue={text(config, "appId")} /></label>
        <SecretInput label="豆包 Access Token" value={accessToken} onChange={setAccessToken} required={!hasSavedSecret} placeholder={hasSavedSecret ? "留空则保留已保存密钥" : "输入 Access Token"} />
      </>}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm">热词表 ID（可选）<Input name="boostingTableId" defaultValue={text(config, "boostingTableId")} /></label>
          <label className="grid gap-1.5 text-sm">热词表名称（可选）<Input name="boostingTableName" defaultValue={text(config, "boostingTableName")} /></label>
        </div>
      </details>
      <p className="text-xs text-[var(--text-secondary)]">保存只校验并加密配置，不会发起真实豆包请求。</p>
      <Button disabled={busy || !view.systemManagedProviders}>{busy ? "保存中…" : "保存配置"}</Button>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </form>
  </Card>;
}
