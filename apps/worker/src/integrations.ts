import { IntegrationService, type ConfigurableIntegrationProvider } from "@content-center/integrations";

const integrationService = new IntegrationService();

export function getWorkspaceIntegrationConfig(
  workspaceId: string,
  provider: ConfigurableIntegrationProvider,
) {
  return integrationService.getDecryptedIntegrationConfig(workspaceId, provider);
}

export function getWorkspaceIntegrationStatus(
  workspaceId: string,
  provider: ConfigurableIntegrationProvider,
) {
  return integrationService.getIntegrationStatus(workspaceId, provider);
}
