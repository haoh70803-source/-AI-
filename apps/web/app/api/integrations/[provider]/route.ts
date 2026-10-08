import { rejectCrossOrigin } from "@/server/account-api";
import { canManageWorkspace } from "@content-center/core";
import { systemManagedProvidersEnabled } from "@content-center/integrations";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { configurableProviderOrResponse, integrationApiError, noContent } from "@/server/integration-api";
import { getIntegrationDisplay, integrationService, integrationVisibleToRole } from "@/server/integrations";

type RouteContext = { params: Promise<{ provider: string }> };

export async function GET(_request: Request, route: RouteContext) {
  if (systemManagedProvidersEnabled()) return apiError("SYSTEM_MANAGED_PROVIDERS", 403);
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { provider } = await route.params;
  const integration = await getIntegrationDisplay(context.workspace.id, provider.toUpperCase());
  return integration
    ? NextResponse.json(integrationVisibleToRole(integration, canManageWorkspace(context.role)))
    : apiError("UNSUPPORTED_INTEGRATION", 404);
}

export async function PUT(request: Request, route: RouteContext) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  if (systemManagedProvidersEnabled()) return apiError("SYSTEM_MANAGED_PROVIDERS", 403);
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!canManageWorkspace(context.role)) return apiError("FORBIDDEN", 403);
  const { provider: value } = await route.params;
  const parsedProvider = configurableProviderOrResponse(value);
  if ("response" in parsedProvider) return parsedProvider.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("config" in body)) return apiError("INVALID_INTEGRATION_CONFIG", 400);
  try {
    const result = await integrationService.saveIntegrationConfig({
      workspaceId: context.workspace.id,
      userId: context.session.user.id,
      provider: parsedProvider.provider,
      config: body.config,
    });
    return NextResponse.json({ ...result, updatedAt: result.updatedAt?.toISOString() ?? null });
  } catch (error) {
    return integrationApiError(error);
  }
}

export async function DELETE(_request: Request, route: RouteContext) {
  const rejected = rejectCrossOrigin(_request); if (rejected) return rejected;
  if (systemManagedProvidersEnabled()) return apiError("SYSTEM_MANAGED_PROVIDERS", 403);
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!canManageWorkspace(context.role)) return apiError("FORBIDDEN", 403);
  const { provider: value } = await route.params;
  const parsedProvider = configurableProviderOrResponse(value);
  if ("response" in parsedProvider) return parsedProvider.response;
  try {
    await integrationService.deleteIntegration({
      workspaceId: context.workspace.id,
      userId: context.session.user.id,
      provider: parsedProvider.provider,
    });
    return noContent();
  } catch (error) {
    return integrationApiError(error);
  }
}
