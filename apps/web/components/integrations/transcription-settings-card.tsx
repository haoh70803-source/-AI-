"use client";

import { Badge, Button, Card, Input } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

type QualityMode = "FAST" | "BALANCED" | "QUALITY";
type LocalModel = "SENSEVOICE_SMALL" | "PARAFORMER_ZH" | "FUN_ASR_NANO";
type LocalStatus = {
  status: "NORMAL" | "NOT_RUNNING" | "ERROR";
  errorCode?: string;
  hardware: Record<string, unknown> | null;
  models: Array<{
    key: LocalModel;
    label: string;
    modelId: string;
    installed: boolean;
    loaded: boolean;
    loadedDevices: string[];
    supported: boolean;
    unavailableReason?: string | null;
  }>;
  qualityModes: Partial<Record<QualityMode, { available: boolean; installed: boolean; model: LocalModel; device: "CPU" | "CUDA" }>>;
};

type Integration = {
  status: "CONFIGURED" | "UNCONFIGURED" | "NEEDS_RECONFIGURATION" | "ERROR" | "DISABLED" | "MOCK";
  publicConfig: Record<string, unknown>;
};

const qualityOptions: Array<{ value: QualityMode; label: string; description: string }> = [
  { value: "FAST", label: "速度优先", description: "转写速度更快，适合大量日常短视频。" },
  { value: "BALANCED", label: "均衡推荐", description: "兼顾准确率和处理速度，推荐日常使用。" },
  { value: "QUALITY", label: "质量优先", description: "优先保证识别质量，更适合重要内容、口音、专有名词和复杂语音，处理时间可能更长。" },
];

function text(config: Record<string, unknown>, key: string, fallback: string) {
  return typeof config[key] === "string" ? config[key] as string : fallback;
}

export function TranscriptionSettingsCard({
  integration,
  doubao,
  localStatus,
  canManage,
}: {
  integration: Integration;
  doubao: Integration;
  localStatus: LocalStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const [source, setSource] = useState(text(integration.publicConfig, "source", "LOCAL_FUNASR") as "LOCAL_FUNASR" | "DOUBAO");
  const [qualityMode, setQualityMode] = useState(text(integration.publicConfig, "qualityMode", "BALANCED") as QualityMode);
  const [selectionMode, setSelectionMode] = useState(text(integration.publicConfig, "selectionMode", "AUTO") as "AUTO" | "MANUAL");
  const [manualModel, setManualModel] = useState(text(integration.publicConfig, "manualModel", "SENSEVOICE_SMALL") as LocalModel);
  const [fallbackToDoubao, setFallbackToDoubao] = useState(integration.publicConfig.fallbackToDoubao === true);
  const [endpoint, setEndpoint] = useState(text(integration.publicConfig, "endpoint", "http://127.0.0.1:8765"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedQuality = localStatus.qualityModes[qualityMode];

  async function request(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.message || result.error || "操作失败");
    return result;
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/TRANSCRIPTION", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: {
            source,
            qualityMode,
            selectionMode,
            ...(selectionMode === "MANUAL" ? { manualModel } : {}),
            fallbackToDoubao,
            endpoint,
          },
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.message || result.error || "保存失败");
      setMessage("语音转写设置已保存。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function initialize() {
    setBusy(true);
    setMessage(selectionMode === "AUTO" ? "正在下载并初始化当前质量模式所需模型，请勿关闭页面…" : "正在下载并初始化所选模型，请勿关闭页面…");
    try {
      await request("/api/local-asr/models/initialize", selectionMode === "AUTO" ? { qualityMode } : { model: manualModel });
      setMessage("本地模型已安装。首次转写时会加载到运行设备。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模型初始化失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 sm:p-7" aria-label="语音转写配置">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold">语音转写</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">选择使用本机免费算力，或使用可能产生费用的豆包云端服务。</p></div>
        <Badge>{localStatus.status === "NORMAL" ? "本地服务正常" : localStatus.status === "NOT_RUNNING" ? "本地服务未启动" : "本地服务异常"}</Badge>
      </div>

      <fieldset className="mt-6 grid gap-3" disabled={!canManage || busy}>
        <legend className="text-sm font-medium">语音转写方式</legend>
        <label className="flex cursor-pointer gap-3 rounded-xl border p-4">
          <input type="radio" name="transcription-source" checked={source === "LOCAL_FUNASR"} onChange={() => setSource("LOCAL_FUNASR")} />
          <span><span className="block text-sm font-medium">本地转写</span><span className="mt-1 block text-sm text-[var(--text-secondary)]">免费使用本机算力</span></span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-xl border p-4">
          <input type="radio" name="transcription-source" checked={source === "DOUBAO"} onChange={() => setSource("DOUBAO")} />
          <span><span className="block text-sm font-medium">豆包云端</span><span className="mt-1 block text-sm text-[var(--text-secondary)]">使用云端语音识别服务，可能产生费用 · {doubao.status === "CONFIGURED" ? "凭证已配置" : "凭证未配置"}</span></span>
        </label>
      </fieldset>

      {source === "LOCAL_FUNASR" ? (
        <fieldset className="mt-6 grid gap-3 border-t pt-6" disabled={!canManage || busy}>
          <legend className="text-sm font-medium">转写质量</legend>
          {qualityOptions.map((option) => (
            <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl bg-[var(--surface-elevated)] p-4">
              <input type="radio" name="quality-mode" checked={qualityMode === option.value} onChange={() => setQualityMode(option.value)} />
              <span><span className="block text-sm font-medium">{option.label}{option.value === "BALANCED" ? "（推荐）" : ""}</span><span className="mt-1 block text-sm leading-6 text-[var(--text-secondary)]">{option.description}</span></span>
            </label>
          ))}
          {selectedQuality && !selectedQuality.available ? (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] p-4 text-sm">
              当前设备暂不支持{qualityOptions.find((option) => option.value === qualityMode)?.label ?? "所选"}模式。{qualityMode === "QUALITY" ? "建议使用均衡模式。" : "请在高级详情中检查硬件和模型状态。"}
              {qualityMode !== "BALANCED" ? <Button type="button" variant="ghost" className="ml-2 h-8 px-2 text-xs" onClick={() => setQualityMode("BALANCED")}>切换到均衡模式</Button> : null}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {canManage && source === "LOCAL_FUNASR" ? (
        <label className="mt-5 flex items-start gap-3 rounded-xl border p-4 text-sm">
          <input type="checkbox" checked={fallbackToDoubao} onChange={(event) => setFallbackToDoubao(event.target.checked)} disabled={busy} />
          <span><span className="block font-medium">本地失败时使用豆包备用</span><span className="mt-1 block text-[var(--warning)]">默认关闭。启用后可能产生豆包 API 费用。</span></span>
        </label>
      ) : null}

      <details className="mt-5 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
        <div className="mt-4 grid gap-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-[var(--text-secondary)]">识别引擎</dt><dd className="mt-1">FunASR</dd></div>
            <div><dt className="text-[var(--text-secondary)]">实际模型</dt><dd className="mt-1">{selectionMode === "AUTO" ? selectedQuality?.model ?? "尚未解析" : manualModel}</dd></div>
            <div><dt className="text-[var(--text-secondary)]">运行设备</dt><dd className="mt-1">{selectionMode === "AUTO" ? selectedQuality?.device ?? "未知" : "自动检测"}</dd></div>
            <div><dt className="text-[var(--text-secondary)]">模型状态</dt><dd className="mt-1">{selectionMode === "AUTO" ? selectedQuality?.installed ? "已安装" : "未安装" : localStatus.models.find((model) => model.key === manualModel)?.installed ? "已安装" : "未安装"}</dd></div>
            <div><dt className="text-[var(--text-secondary)]">本地服务</dt><dd className="mt-1">{localStatus.status === "NORMAL" ? "正常" : "未启动"}</dd></div>
            <div><dt className="text-[var(--text-secondary)]">CUDA</dt><dd className="mt-1">{localStatus.hardware?.cudaAvailable === true ? "available" : "unavailable"}</dd></div>
          </dl>
          {canManage ? (
            <>
              <label className="grid gap-1.5">模型选择
                <select className="h-10 rounded-lg border bg-[var(--surface)] px-3" value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as "AUTO" | "MANUAL")} disabled={busy}>
                  <option value="AUTO">自动选择（推荐）</option><option value="MANUAL">手动指定模型</option>
                </select>
              </label>
              {selectionMode === "MANUAL" ? <label className="grid gap-1.5">手动模型<select className="h-10 rounded-lg border bg-[var(--surface)] px-3" value={manualModel} onChange={(event) => setManualModel(event.target.value as LocalModel)} disabled={busy}>{localStatus.models.map((model) => <option key={model.key} value={model.key} disabled={!model.supported}>{model.label}{model.supported ? "" : "（当前设备不可用）"}</option>)}</select></label> : null}
              <label className="grid gap-1.5">本地服务地址<Input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} disabled={busy} /></label>
              <Button type="button" variant="secondary" disabled={busy || localStatus.status !== "NORMAL" || (selectionMode === "AUTO" && selectedQuality?.available === false)} onClick={initialize}>下载 / 初始化本地模型</Button>
              {localStatus.errorCode ? <p className="font-mono text-xs text-[var(--danger)]">{localStatus.errorCode}</p> : null}
            </>
          ) : null}
        </div>
      </details>

      {!canManage ? <p className="mt-5 rounded-xl bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]">当前账户可查看转写状态，配置仅限管理员修改。</p> : null}
      {canManage ? <div className="mt-5 flex flex-wrap gap-3"><Button disabled={busy} onClick={save}>保存转写设置</Button>{source === "LOCAL_FUNASR" ? <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { const result = await request("/api/integrations/TRANSCRIPTION/test", {}); setMessage(result.message || "检查完成。"); } catch { setMessage("本地服务无法访问，请启动后重试。"); } finally { setBusy(false); } }}>测试本地连接</Button> : null}</div> : null}
      {message ? <p className="mt-3 text-sm text-[var(--text-secondary)]" role="status">{message}</p> : null}
    </Card>
  );
}
