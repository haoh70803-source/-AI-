import "server-only";

import {
  ensureSystemConfigWorkspace,
  IntegrationService,
  readStoredSystemProviderConfig,
  resolveSystemProviderConfig,
  parseSystemDoubaoConfig,
  stripSystemProviderSecrets,
  systemManagedProvidersEnabled,
} from "@content-center/integrations";

const PROVIDER = "DOUBAO_ASR" as const;

export async function getSystemDoubaoAdminView() {
  const [resolved, stored] = await Promise.all([
    resolveSystemProviderConfig(PROVIDER),
    readStoredSystemProviderConfig(PROVIDER),
  ]);
  return {
    provider: PROVIDER,
    protocol: "RECORDING_FILE_2_0" as const,
    systemManagedProviders: systemManagedProvidersEnabled(),
    effectiveSource: resolved ? (resolved.source === "env" ? "ENV" as const : "DATABASE" as const) : null,
    stored: stored
      ? {
          configured: stored.status === "CONFIGURED",
          publicConfig: stripSystemProviderSecrets(PROVIDER, stored.config),
          lastFour: stored.lastFour,
          updatedAt: stored.updatedAt.toISOString(),
        }
      : null,
  };
}

export type SystemDoubaoAdminView = Awaited<ReturnType<typeof getSystemDoubaoAdminView>>;

export async function saveSystemDoubaoConfig(userId: string, config: unknown) {
  const parsed = parseSystemDoubaoConfig(config);
  const workspace = await ensureSystemConfigWorkspace();
  const service = new IntegrationService();
  const result = await service.saveIntegrationConfig({
    workspaceId: workspace.id,
    userId,
    provider: PROVIDER,
    config: parsed,
  });
  return {
    provider: PROVIDER,
    status: result.status,
    configured: result.configured,
    publicConfig: result.publicConfig,
    lastFour: result.lastFour,
    updatedAt: result.updatedAt?.toISOString() ?? null,
  };
}
