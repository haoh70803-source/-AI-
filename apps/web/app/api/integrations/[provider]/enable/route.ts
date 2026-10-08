import { rejectCrossOrigin } from "@/server/account-api";
import { canManageWorkspace } from "@content-center/core";
import { systemManagedProvidersEnabled } from "@content-center/integrations";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { configurableProviderOrResponse, integrationApiError } from "@/server/integration-api";
import { integrationService } from "@/server/integrations";

export async function POST(_request: Request, route: { params: Promise<{ provider: string }> }) {
  const rejected = rejectCrossOrigin(_request); if (rejected) return rejected;
  if (systemManagedProvidersEnabled()) return apiError("SYSTEM_MANAGED_PROVIDERS", 403);
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!canManageWorkspace(context.role)) return apiError("FORBIDDEN", 403);
  const { provider: value } = await route.params;
  const parsedProvider = configurableProviderOrResponse(value);
  if ("response" in parsedProvider) return parsedProvider.response;
  try {
    const result = await integrationService.enableIntegration({
      workspaceId: context.workspace.id,
      userId: context.session.user.id,
      provider: parsedProvider.provider,
    });
    return NextResponse.json({ ...result, updatedAt: result.updatedAt?.toISOString() ?? null });
  } catch (error) {
    return integrationApiError(error);
  }
}
