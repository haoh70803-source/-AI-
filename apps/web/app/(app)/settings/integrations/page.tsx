import { canManageWorkspace } from "@content-center/core";
import { systemManagedProvidersEnabled } from "@content-center/integrations";
import { PageHeader } from "@/components/page";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { TranscriptionSettingsCard } from "@/components/integrations/transcription-settings-card";
import { requireWorkspace } from "@/server/access";
import { getIntegrationStatuses, integrationVisibleToRole } from "@/server/integrations";
import { getLocalAsrDisplay } from "@/server/local-asr";
export default async function IntegrationsPage() {
  const { workspace, role } = await requireWorkspace();
  if (systemManagedProvidersEnabled()) return <><PageHeader title="模型与 API" description="当前服务由系统管理员统一托管，请联系管理员调整配置。" /></>;
  const canManage = canManageWorkspace(role);
  const [statuses, localAsr] = await Promise.all([getIntegrationStatuses(workspace.id), getLocalAsrDisplay(workspace.id)]);
  const integrations = statuses.map(item => integrationVisibleToRole(item, canManage));
  const transcription = integrations.find(item => item.provider === "TRANSCRIPTION")!;
  const doubao = integrations.find(item => item.provider === "DOUBAO_ASR")!;
  const encryptionConfigured = Boolean(process.env.INTEGRATION_ENCRYPTION_KEY?.trim());
  const card = (provider: string) => { const integration = integrations.find(item => item.provider === provider)!; return <IntegrationCard key={integration.provider + integration.updatedAt} integration={integration} canManage={canManage} encryptionConfigured={encryptionConfigured} />; };
  return <><PageHeader title="模型与 API" description={"公司配置 · " + workspace.name + " · 密钥加密保存，供当前公司成员使用。"} />
    {!encryptionConfigured && canManage ? <p role="alert" className="mb-5 text-sm text-[var(--danger)]">密钥加密服务尚未配置，请联系系统管理员。</p> : null}
    <div className="settings-api-layout"><section className="settings-model-primary">{card("LLM")}</section></div>
    {integrations.some(item => item.provider === "LLM" && item.configured && item.publicConfig.provider === "DEEPSEEK") ? <p className="mt-5 text-sm">通用网页搜索优先复用当前 DeepSeek 配置，无需另填搜索密钥。联网时会增加一次模型请求；Exa 可作为其他模型的可选搜索服务。</p> : null}
    <h2 className="mb-4 mt-8 font-semibold">研究与云端转录</h2><div className="grid gap-5 xl:grid-cols-2">{card("REDFOX")}{card("WEB_SEARCH")}{card("DOUBAO_ASR")}</div>
    <h2 className="mb-4 mt-8 font-semibold">默认转录服务</h2><TranscriptionSettingsCard integration={transcription} doubao={doubao} localStatus={localAsr} canManage={canManage} />
  </>;
}
