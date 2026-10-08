import { canManageWorkspace } from "@content-center/core";
import { systemManagedProvidersEnabled } from "@content-center/integrations";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getIntegrationStatuses, integrationVisibleToRole } from "@/server/integrations";

export async function GET() {
  if (systemManagedProvidersEnabled()) return apiError("SYSTEM_MANAGED_PROVIDERS", 403);
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const canManage = canManageWorkspace(context.role);
  const integrations = (await getIntegrationStatuses(context.workspace.id)).map((integration) =>
    integrationVisibleToRole(integration, canManage),
  );
  return NextResponse.json({ integrations });
}
