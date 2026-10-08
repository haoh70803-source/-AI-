"use client";

import { Badge, Button, Card, Input } from "@content-center/ui";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Integration = {
  provider: "WEB_SEARCH" | "REDFOX" | "DOUBAO_ASR" | "TRANSCRIPTION" | "LLM" | "STORAGE";
  name: string;
  status: "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "ERROR" | "DISABLED" | "MOCK";
  configured: boolean;
  publicConfig: Record<string, unknown>;
  lastFour: string | null;
  updatedAt: string | null;
  description: string;
  usage: readonly string[];
  defaults: Record<string, string>;
  managedBy: "WORKSPACE" | "ENVIRONMENT";
  connectionTest: "LIVE" | "UNSUPPORTED_UNTIL_PROVIDER_STAGE" | "LIVE_API_TEST_NOT_AVAILABLE" | "NOT_APPLICABLE";
  models?: Array<{ provider: "KIMI" | "DEEPSEEK" | "CUSTOM"; modelId: string; label: string; defaultBaseUrl: string; experimental?: boolean; capabilities: Record<string, boolean> }>;
};

const statusLabel = {
  CONFIGURED: "已配置",
  UNCONFIGURED: "未配置",
  NEEDS_RECONFIGURATION: "需重新配置",
  ERROR: "配置异常",
  DISABLED: "已禁用",
  MOCK: "MOCK MODE",
} as const;

const statusColor = {
  CONFIGURED: "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]",
  UNCONFIGURED: "text-[var(--text-secondary)]",
  NEEDS_RECONFIGURATION: "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)]",
  ERROR: "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]",
  DISABLED: "text-[var(--text-secondary)]",
  MOCK: "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)]",
} as const;

function value(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "string" ? config[key] : "";
}

const capabilityLabels: Record<string, string> = { text: "文本", image: "图片理解", reasoning: "深度推理", structuredOutput: "结构化输出", jsonObject: "JSON", tools: "工具调用", responsesApi: "Responses API" };

class IntegrationClientError extends Error {
  constructor(readonly code: string, readonly detail: string) {
    super(detail);
  }
}

function friendlyError(error: IntegrationClientError) {
  if (error.code === "EXTERNAL_CALLS_DISABLED") return "当前本机已暂停外部服务调用；配置仍可查看和保存，恢复真实调用需先确认。";
  if (error.code === "INTEGRATION_ENCRYPTION_NOT_CONFIGURED" || error.code === "INVALID_INTEGRATION_ENCRYPTION_KEY") {
    return "密钥加密服务尚未配置，请联系系统管理员。";
  }
  if (error.code === "INTEGRATION_SECRET_DECRYPT_FAILED") return "已保存配置暂时无法解密，请联系管理员核对原加密配置；不要直接删除或重填密钥。";
  if (error.code === "INTEGRATION_SECRET_REQUIRED") return "请填写 API 密钥；更换服务或接口地址时，需要重新输入密钥。";
  if (error.code === "KIMI_NOT_CONFIGURED") return "AI 模型尚未配置，请联系管理员完成设置。";
  if (error.code === "KIMI_MODEL_ID_MISSING") return "请选择一个可用的 AI 模型。";
  if (error.code === "KIMI_AUTH_FAILED") return "AI 模型认证失败，请检查 Provider 配置。";
  if (error.code === "KIMI_MODEL_UNAVAILABLE") return "当前模型配置不可用，请重新选择模型。";
  if (error.code === "INVALID_INTEGRATION_CONFIG") return "配置内容格式不正确，请检查必填项和地址格式。";
  if (error.code === "FORBIDDEN") return "当前账户没有修改服务配置的权限。";
  return "操作未完成，请稍后重试。";
}

function SecretInput({ label, ariaLabel, value: secret, onChange, required, placeholder }: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex items-center justify-between gap-3">
        {label}
        <button type="button" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => setVisible((current) => !current)}>
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          {visible ? "隐藏" : "显示"}
        </button>
      </span>
      <Input type={visible ? "text" : "password"} value={secret} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} autoComplete="new-password" required={required} placeholder={placeholder} />
    </label>
  );
}

function SavedSecret({ name, lastFour, onReplace, label = "API Key" }: { name: string; lastFour: string | null; onReplace: () => void; label?: string }) {
  if (!lastFour) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-elevated)] px-4 py-3">
      <p className="text-sm" aria-label={`${name} 已保存凭证`}>{label}：<span className="font-mono">••••••••{lastFour}</span></p>
      <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={onReplace}>修改密钥</Button>
    </div>
  );
}

export function IntegrationCard({ integration, canManage, encryptionConfigured }: { integration: Integration; canManage: boolean; encryptionConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [error, setError] = useState<IntegrationClientError | null>(null);
  const [secret, setSecret] = useState("");
  const [editingSecret, setEditingSecret] = useState(!integration.lastFour);
  const [doubaoApiKey, setDoubaoApiKey] = useState("");
  const [doubaoAccessToken, setDoubaoAccessToken] = useState("");
  const initialAuthMode = value(integration.publicConfig, "authMode") || "API_KEY";
  const [authMode, setAuthMode] = useState(initialAuthMode);
  const doubaoHasSelectedSecret = Boolean(integration.lastFour && authMode === initialAuthMode);
  const initialAIProvider = (value(integration.publicConfig, "provider") || integration.defaults.provider || "KIMI") as "KIMI" | "DEEPSEEK" | "CUSTOM";
  const [aiProvider, setAIProvider] = useState(initialAIProvider);
  const models = integration.models ?? [];
  const initialModelId = models.find(model => model.provider === initialAIProvider && model.modelId === value(integration.publicConfig, "resolvedModelId"))?.modelId || value(integration.publicConfig, "modelId") || integration.defaults.modelId || models.find((model) => model.provider === initialAIProvider)?.modelId || "";
  const [modelId, setModelId] = useState(initialModelId);
  const [apiModelId, setApiModelId] = useState(value(integration.publicConfig, "apiModelId") || value(integration.publicConfig, "resolvedModelId") || initialModelId);
  const [modelDisplayName, setModelDisplayName] = useState(value(integration.publicConfig, "modelDisplayName"));
  const [remoteModels, setRemoteModels] = useState<Array<{ id: string; label: string }>>([]);
  const [modelListMessage, setModelListMessage] = useState("");
  const selectedModel = models.find((model) => model.provider === aiProvider && model.modelId === apiModelId) || models.find((model) => model.provider === aiProvider && model.modelId === modelId);
  const [aiBaseUrl, setAIBaseUrl] = useState(value(integration.publicConfig, "baseUrl") || selectedModel?.defaultBaseUrl || integration.defaults.baseUrl || "");
  const aiProviderChanged = integration.provider === "LLM" && aiProvider !== initialAIProvider;

  async function call(path: string, method: string, body?: unknown) {
    const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new IntegrationClientError(result.error ?? "INTEGRATION_OPERATION_FAILED", result.message ?? `HTTP ${response.status}`);
    return result;
  }

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setSecret("");
      setDoubaoApiKey("");
      setDoubaoAccessToken("");
      setEditingSecret(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof IntegrationClientError ? cause : new IntegrationClientError("INTEGRATION_OPERATION_FAILED", "Unknown error"));
    } finally {
      setBusy(false);
    }
  }

  function configFrom(formData: FormData) {
    if (integration.provider === "WEB_SEARCH") return secret ? { apiKey: secret } : {};
    if (integration.provider === "REDFOX") return { baseUrl: String(formData.get("baseUrl") || ""), ...(secret ? { apiKey: secret } : {}) };
    if (integration.provider === "DOUBAO_ASR") {
      return {
        authMode,
        baseUrl: String(formData.get("baseUrl") || ""),
        ...(doubaoApiKey ? { apiKey: doubaoApiKey } : {}),
        appId: String(formData.get("appId") || ""),
        ...(doubaoAccessToken ? { accessToken: doubaoAccessToken } : {}),
        resourceId: String(formData.get("resourceId") || ""),
        boostingTableId: String(formData.get("boostingTableId") || ""),
        boostingTableName: String(formData.get("boostingTableName") || ""),
      };
    }
    return {
      ...(aiProvider === "CUSTOM" ? { serviceName: String(formData.get("serviceName") || "") } : {}),
      provider: aiProvider,
      modelId,
      ...(apiModelId.trim() ? { apiModelId: apiModelId.trim() } : {}),
      ...(modelDisplayName.trim() ? { modelDisplayName: modelDisplayName.trim() } : {}),
      baseUrl: aiBaseUrl,
      ...(secret ? { apiKey: secret } : {}),
    };
  }

  return (
    <Card className="p-6 sm:p-7" aria-label={`${integration.name} 配置`}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold">{integration.name}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{integration.description}</p></div>
        <Badge className={statusColor[integration.status]}>{statusLabel[integration.status]}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span>用于：</span>{integration.usage.map((item) => <span key={item} className="rounded-full bg-[var(--surface-elevated)] px-2.5 py-1">{item}</span>)}
      </div>

      {!canManage && integration.managedBy === "WORKSPACE" ? <p className="mt-5 rounded-xl bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]">当前账户可查看服务状态，配置仅限管理员修改。</p> : null}

      {canManage && integration.managedBy === "WORKSPACE" ? (
        <form className="mt-6 grid gap-4 border-t pt-6" action={(formData) => act(async () => { await call(`/api/integrations/${integration.provider}`, "PUT", { config: configFrom(formData) }); })}>
          {integration.provider === "WEB_SEARCH" ? <>{!editingSecret && integration.lastFour ? <SavedSecret name={integration.name} lastFour={integration.lastFour} onReplace={() => setEditingSecret(true)}/> : null}{editingSecret ? <SecretInput label="Exa API Key" ariaLabel="Exa API Key" value={secret} onChange={setSecret} required={!integration.lastFour} placeholder="输入 Exa API Key"/> : null}<p className="text-sm">密钥加密保存在当前公司空间。<a href="https://dashboard.exa.ai/api-keys" target="_blank" rel="noreferrer">获取 Exa 密钥</a></p></> : null}
          {integration.provider === "REDFOX" ? (
            <>
              <label className="grid gap-1.5 text-sm">API 地址<Input name="baseUrl" type="url" aria-label="RedFox Base URL" required defaultValue={value(integration.publicConfig, "baseUrl") || integration.defaults.baseUrl} /></label>
              {!editingSecret && integration.lastFour ? <SavedSecret name={integration.name} lastFour={integration.lastFour} onReplace={() => setEditingSecret(true)} /> : null}
              {editingSecret ? <SecretInput label="API Key" ariaLabel="RedFox API Key" value={secret} onChange={setSecret} required={!integration.lastFour} placeholder={integration.lastFour ? "输入新的 API Key" : "输入 API Key"} /> : null}
            </>
          ) : null}

          {integration.provider === "DOUBAO_ASR" ? (
            <>
              <div><p className="text-sm font-medium">认证方式</p><p className="mt-1 text-sm text-[var(--text-secondary)]">API Key（推荐）</p></div>
              {authMode === "API_KEY" ? (
                <>
                  {!editingSecret && doubaoHasSelectedSecret ? <SavedSecret name={integration.name} lastFour={integration.lastFour} onReplace={() => setEditingSecret(true)} /> : null}
                  {editingSecret ? <SecretInput label="API Key" ariaLabel="豆包语音识别 API Key" value={doubaoApiKey} onChange={setDoubaoApiKey} required={!doubaoHasSelectedSecret} placeholder={doubaoHasSelectedSecret ? "输入新的 API Key" : "输入 API Key"} /> : null}
                </>
              ) : null}
              <label className="grid gap-1.5 text-sm">Resource ID<Input name="resourceId" aria-label="豆包语音识别 Resource ID" required defaultValue={value(integration.publicConfig, "resourceId") || integration.defaults.resourceId} /></label>
              <details className="rounded-xl border border-[color-mix(in_srgb,var(--border)_65%,transparent)] p-4" open={authMode === "LEGACY_APP_TOKEN"}>
                <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-1.5 text-sm">API 地址<Input name="baseUrl" type="url" aria-label="豆包语音识别 Base URL" required defaultValue={value(integration.publicConfig, "baseUrl") || integration.defaults.baseUrl} /><span className="text-xs text-[var(--text-secondary)]">默认使用系统提供的服务地址。</span></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={authMode === "LEGACY_APP_TOKEN"} onChange={(event) => { setAuthMode(event.target.checked ? "LEGACY_APP_TOKEN" : "API_KEY"); setEditingSecret(true); }} />使用旧版认证</label>
                  {authMode === "LEGACY_APP_TOKEN" ? (
                    <div className="grid gap-4 rounded-xl bg-[var(--surface-elevated)] p-4">
                      <label className="grid gap-1.5 text-sm">App ID<Input name="appId" aria-label="豆包旧版 App ID" required defaultValue={value(integration.publicConfig, "appId")} /></label>
                      {!editingSecret && doubaoHasSelectedSecret ? <SavedSecret name={integration.name} lastFour={integration.lastFour} label="Access Token" onReplace={() => setEditingSecret(true)} /> : null}
                      {editingSecret ? <SecretInput label="Access Token" ariaLabel="豆包旧版 Access Token" value={doubaoAccessToken} onChange={setDoubaoAccessToken} required={!doubaoHasSelectedSecret} placeholder={doubaoHasSelectedSecret ? "输入新的 Access Token" : "输入 Access Token"} /> : null}
                    </div>
                  ) : null}
                  <label className="grid gap-1.5 text-sm">热词表 ID（可选）<Input name="boostingTableId" aria-label="豆包热词表 ID" defaultValue={value(integration.publicConfig, "boostingTableId")} /></label>
                  <label className="grid gap-1.5 text-sm">热词表名称（可选）<Input name="boostingTableName" aria-label="豆包热词表名称" defaultValue={value(integration.publicConfig, "boostingTableName")} /></label>
                </div>
              </details>
            </>
          ) : null}

          {integration.provider === "LLM" ? (
            <>
              <div className="grid gap-1 rounded-xl bg-[var(--surface-elevated)] p-4 text-sm">
                <p className="font-medium">默认模型：{integration.configured ? (value(integration.publicConfig, "resolvedModelId") || value(integration.publicConfig, "modelId") || "已配置") : "尚未设置"}</p>
                <p className="text-xs leading-5 text-[var(--text-secondary)]">选择下方服务和模型，保存后成为公司默认模型。</p>
              </div>
              {integration.status === "NEEDS_RECONFIGURATION" ? <p className="rounded-xl border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4 text-sm text-[var(--warning)]">当前模型不在已确认目录中，请重新选择。已保存的 API Key 不会被删除。</p> : null}
              <label className="grid gap-1.5 text-sm">模型服务<select aria-label="AI Provider" value={aiProvider} onChange={(event) => { const nextProvider = event.target.value as "KIMI" | "DEEPSEEK" | "CUSTOM"; const nextModel = models.find((model) => model.provider === nextProvider); setAIProvider(nextProvider); setApiModelId(""); setModelDisplayName(""); setRemoteModels([]); setModelId(nextModel?.modelId || ""); setAIBaseUrl(nextModel?.defaultBaseUrl || ""); setEditingSecret(true); }} className="h-10 rounded-[var(--radius)] border bg-transparent px-3"><option value="KIMI">Kimi</option><option value="DEEPSEEK">DeepSeek</option><option value="CUSTOM">自定义模型服务（OpenAI 兼容）</option></select></label>
              <label className="grid gap-1.5 text-sm">模型能力配置{aiProvider === "CUSTOM" ? <Input aria-label="自定义模型名称" value={modelId} onChange={event => setModelId(event.target.value)} required placeholder="填写服务商提供的模型名称" /> : <select aria-label="AI 默认模型" value={modelId} onChange={(event) => { setModelId(event.target.value); setApiModelId(""); setModelDisplayName(""); }} className="h-10 rounded-[var(--radius)] border bg-transparent px-3">{!selectedModel && modelId ? <option value={modelId}>{modelId}（现有配置）</option> : null}{models.filter((model) => model.provider === aiProvider).map((model) => <option key={model.modelId} value={model.modelId}>{model.label}{model.experimental ? "（实验）" : ""}</option>)}</select>}</label>
              <label className="grid gap-1.5 text-sm">实际请求 Model ID<Input aria-label="实际请求 Model ID" value={apiModelId} onChange={event => setApiModelId(event.target.value)} placeholder={modelId} maxLength={200} /><span className="text-xs text-[var(--text-secondary)]">界面配置与服务商 ID 分开保存；测试连接、Agent 和研究均使用此 ID。</span></label>
              <label className="grid gap-1.5 text-sm">显示名称（可选）<Input aria-label="模型显示名称" value={modelDisplayName} onChange={event => setModelDisplayName(event.target.value)} placeholder="留空使用模型名称" maxLength={80} /></label>
              <Button type="button" variant="secondary" disabled={busy || !integration.configured || aiProviderChanged} onClick={async () => {
                setBusy(true); setModelListMessage("正在读取已保存服务的模型列表…");
                try { const response = await fetch("/api/integrations/LLM/models"); const result = await response.json(); if (!response.ok) throw new Error(result.message || "模型列表读取失败"); setRemoteModels(result.items); setModelListMessage(`已读取 ${result.items.length} 个真实模型，选择后保存配置。`); }
                catch (cause) { setModelListMessage(cause instanceof Error ? cause.message : "模型列表读取失败，可手动填写 Model ID。"); } finally { setBusy(false); }
              }}>读取服务商模型</Button>
              {remoteModels.length ? <label className="grid gap-1.5 text-sm">服务商返回的模型<select aria-label="服务商真实模型" value="" onChange={event => { const item = remoteModels.find(item => item.id === event.target.value); if (item) { setApiModelId(item.id); setModelDisplayName(item.label); } }}><option value="">选择实际模型…</option>{remoteModels.map(item => <option key={item.id} value={item.id}>{item.label} · {item.id}</option>)}</select></label> : null}
              {modelListMessage ? <p role="status" className="text-xs">{modelListMessage}</p> : null}
              {aiProvider === "CUSTOM" ? <p className="text-xs text-[var(--text-secondary)]">自定义服务需支持 Chat Completions 文本和 JSON Object 输出。图片、工具调用和深度推理暂不启用。</p> : null}
              {aiProvider === "CUSTOM" ? <label>服务名称<Input name="serviceName" aria-label="服务名称" defaultValue={value(integration.publicConfig, "serviceName")} required maxLength={80} /></label> : null}
              {selectedModel ? <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]"><span>能力：</span>{Object.entries(selectedModel.capabilities).filter(([, supported]) => supported).map(([capability]) => <span key={capability} className="rounded-full bg-[var(--surface-elevated)] px-2.5 py-1">{capabilityLabels[capability] || capability}</span>)}</div> : null}
              <label className="grid gap-1.5 text-sm">API 地址<Input name="baseUrl" type="url" aria-label="AI Base URL" required value={aiBaseUrl} onChange={(event) => setAIBaseUrl(event.target.value)} /></label>
              {!editingSecret && integration.lastFour && !aiProviderChanged ? <SavedSecret name={integration.name} lastFour={integration.lastFour} onReplace={() => setEditingSecret(true)} /> : null}
              {editingSecret ? <SecretInput label="API Key" ariaLabel="AI API Key" value={secret} onChange={setSecret} required={!integration.lastFour || aiProviderChanged} placeholder={aiProviderChanged ? "切换 Provider 时需要填写对应 API Key" : integration.lastFour ? "输入新的 API Key" : "输入 API Key"} /> : null}
            </>
          ) : null}

          {editingSecret && integration.lastFour && (secret || doubaoApiKey || doubaoAccessToken) ? <p className="text-xs text-[var(--warning)]">保存后将替换当前 API Key。</p> : null}
          <p className="text-xs text-[var(--text-secondary)]">公司配置 · 保存后供当前公司使用。测试连接使用已保存配置，会发送一次最小真实请求，可能产生少量服务费用。</p>
          {integration.provider !== "LLM" && integration.provider !== "WEB_SEARCH" ? <label className="grid gap-1.5 text-sm">{integration.provider === "REDFOX" ? "测试作品链接" : "测试短音频链接"}<Input type="url" value={sampleUrl} onChange={event => setSampleUrl(event.target.value)} placeholder="https://…" /></label> : null}
          <Button type="button" variant="secondary" disabled={busy || !integration.configured} onClick={async () => {
            setBusy(true); setTestResult("正在连接，请稍候…");
            try { const result = await call(`/api/integrations/${integration.provider}/test`, "POST", sampleUrl ? { sampleUrl } : {}); setTestResult(result.message || "测试完成。"); }
            catch (cause) { setTestResult(cause instanceof IntegrationClientError ? friendlyError(cause) : "测试未完成，请稍后重试。"); } finally { setBusy(false); }
          }}>测试连接</Button>
          {testResult ? <p role="status" className="text-sm">{testResult}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button disabled={busy || !encryptionConfigured}>保存配置</Button>
            {integration.status === "CONFIGURED" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => act(async () => { await call(`/api/integrations/${integration.provider}/disable`, "POST"); })}>禁用</Button> : null}
            {integration.status === "DISABLED" ? <Button type="button" variant="secondary" disabled={busy || !encryptionConfigured} onClick={() => act(async () => { await call(`/api/integrations/${integration.provider}/enable`, "POST"); })}>启用</Button> : null}
            {integration.status !== "UNCONFIGURED" ? <Button type="button" variant="secondary" className="text-[var(--danger)]" disabled={busy} onClick={() => { if (window.confirm(`确定删除 ${integration.name} 配置吗？`)) void act(async () => { await call(`/api/integrations/${integration.provider}`, "DELETE"); }); }}>删除配置</Button> : null}
          </div>
        </form>
      ) : null}

      {error ? <div className="mt-4" role="alert"><p className="text-sm text-[var(--danger)]">{friendlyError(error)}</p></div> : null}
    </Card>
  );
}

export function SystemServiceCard({ integration }: { integration: Integration }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="font-medium">素材存储</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">由系统环境安全管理，用于保存素材文件与音视频。</p></div>
        <Badge className={statusColor[integration.status]}>{statusLabel[integration.status]}</Badge>
      </div>
    </Card>
  );
}
