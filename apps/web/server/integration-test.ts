import { exaSearch } from "./assistant/web-search";
import { IntegrationService, parseProviderConfig, type ConfigurableIntegrationProvider } from "@content-center/integrations";
import { LocalAsrClient, RedFoxClient, DoubaoClient, DoubaoRecordingFileClient, doubaoRuntimeConfigSchema, providerFetch, chatCompletionResponseSchema } from "@content-center/providers";

export type ConnectionResult = { ok: boolean; message: string };
export async function testIntegration(workspaceId: string, provider: ConfigurableIntegrationProvider, sampleUrl?: string, service = new IntegrationService()): Promise<ConnectionResult> {
  if (provider === "TRANSCRIPTION") {
    const status = await service.getIntegrationStatus(workspaceId, provider);
    const settings = parseProviderConfig("TRANSCRIPTION", status.publicConfig);
    if (settings.source === "DOUBAO") return testIntegration(workspaceId, "DOUBAO_ASR", sampleUrl, service);
    try {
      await new LocalAsrClient({ endpoint: String(settings.endpoint), model: "SENSEVOICE_SMALL", device: "CPU" }).health();
      return { ok: true, message: "连接成功，本地转录服务已响应。转录前请确认所选模型已安装。" };
    } catch { return { ok: false, message: "本地服务未启动或无法访问，请启动 FunASR 后重试。无需填写 API Key。" }; }
  }
  const config = await service.getDecryptedIntegrationConfig(workspaceId, provider);
  if (!config) return { ok: false, message: "尚未配置或启用此服务，请先保存配置。" };
  try {
    if (provider === "WEB_SEARCH") { await exaSearch("Exa search official documentation", String(config.apiKey)); return { ok: true, message: "联网搜索成功，已取得真实网页来源。" }; }
    if (provider === "LLM") {
      const response = await providerFetch(`${String(config.baseUrl).replace(/\/$/, "")}/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 16 }), signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 401 || response.status === 403) return { ok: false, message: "API Key 无效，或没有模型访问权限。" };
      if (response.status === 402) return { ok: false, message: "服务额度不足，请检查服务商账户余额。" };
      if (response.status === 429) {
        const body = await response.json().catch(() => ({})) as { error?: { code?: string } };
        return { ok: false, message: body.error?.code === "insufficient_quota" ? "服务额度不足，请检查服务商账户余额。" : "请求过于频繁，请稍后重试。" };
      }
      if (response.status === 400 || response.status === 404) {
        const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
        const detail = `${body.error?.code ?? ""} ${body.error?.message ?? ""}`;
        return { ok: false, message: /model[ _-]?(not[ _-]?found|not[ _-]?exist)|model.*does not exist|invalid.*model/i.test(detail) ? "模型不存在或当前账号无权使用，请核对模型名称。" : "API 地址或请求配置不正确，请核对服务商提供的 Base URL。" };
      }
      if (!response.ok) return { ok: false, message: "第三方服务拒绝了请求，请检查模型配置或稍后重试。" };
      if (!chatCompletionResponseSchema.safeParse(await response.json()).success) return { ok: false, message: "接口可以访问，但未返回有效的模型响应，请核对兼容协议。" };
    } else if (provider === "REDFOX") {
      if (!sampleUrl) return { ok: false, message: "请输入一条公开作品链接，以验证真实解析能力。" };
      await new RedFoxClient({ apiKey: String(config.apiKey), baseUrl: String(config.baseUrl), timeoutMs: 20_000, fetch: providerFetch }).parseWork(sampleUrl);
    } else if (provider === "DOUBAO_ASR") {
      if (!sampleUrl) return { ok: false, message: "请输入一段短音频的公开链接，以验证真实转写能力。" };
      const parsed = doubaoRuntimeConfigSchema.parse(config);
      const input = { audio: { mode: "REMOTE_URL" as const, url: sampleUrl } };
      if (config.protocol === "RECORDING_FILE_2_0") await new DoubaoRecordingFileClient(parsed, { fetch: providerFetch, overallTimeoutMs: 25_000, submissionTimeoutMs: 10_000, queryTimeoutMs: 10_000 }).recognize(input);
      else await new DoubaoClient(parsed, { fetch: providerFetch, timeoutMs: 20_000 }).recognizeFlash(input);
    } else {
      return { ok: false, message: "请在转录设置中检查本地服务，或测试所选云端转录服务。" };
    }
    return { ok: true, message: "连接成功，已完成一次真实服务请求。" };
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return { ok: false, message: "连接超时，请检查网络或稍后重试。" };
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "REDFOX_QUOTA_EXCEEDED") return { ok: false, message: "RedFox 积分余额不足，请充值或更换有余额的 API Key。" };
    if (code.includes("AUTH") || code.includes("PERMISSION")) return { ok: false, message: "API Key 无效，或服务资源未授权。" };
    if (code.includes("RATE")) return { ok: false, message: "请求过于频繁或额度不足，请检查服务商账户。" };
    if (code.includes("INVALID_AUDIO") || code.includes("EMPTY_TRANSCRIPT")) return { ok: false, message: "服务已响应，但测试音频无效或没有可识别的人声，请更换短音频。" };
    if (["SSRF_BLOCKED", "DNS_TEMPORARY", "INVALID_URL"].includes(code) || (error instanceof Error && ["PROVIDER_ADDRESS_INVALID", "PROVIDER_REDIRECT_BLOCKED"].includes(error.message))) return { ok: false, message: "API 地址无法访问，请核对服务商的公开 HTTPS 地址。" };
    return { ok: false, message: "连接未通过：请检查接口地址、测试链接和网络，或稍后重试。" };
  }
}
