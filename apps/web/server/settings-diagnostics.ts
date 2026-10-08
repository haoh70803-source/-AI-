import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { storageHealthFromEnv } from "@content-center/providers";
import packageInfo from "../package.json";
const { version } = packageInfo;
export async function settingsDiagnostics(workspaceId: string) {
  let database = false;
  try { await db.$queryRaw`SELECT 1`; database = true; } catch { /* return a safe status only */ }
  const service = new IntegrationService();
  const providers = await Promise.all((["LLM", "REDFOX", "DOUBAO_ASR"] as const).map(async provider => {
    try { const result = await service.getIntegrationStatus(workspaceId, provider); return { provider, configured: result.configured, status: result.status }; } catch { return { provider, configured: false, status: "ERROR" }; }
  }));
  // Deliberate allowlist: no user identity, host paths, endpoints, keys, tokens or errors.
  return { version, checkedAt: new Date().toISOString(), database, storageMode: process.env.STORAGE_DRIVER === "LOCAL_FILESYSTEM" ? "LOCAL_FILESYSTEM" : "SERVER_STORAGE", storageConfigured: storageHealthFromEnv() === "CONFIGURED", providers };
}
