import { configuredLLMChoice, IntegrationService } from "@content-center/integrations";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { assertReferenceProject } from "@/server/assistant/references";
import { assistantApiError } from "@/server/assistant/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  try {
    await assertReferenceProject({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: (await params).id });
    const status = await new IntegrationService().getIntegrationStatus(context.workspace.id, "LLM");
    const config = status.publicConfig as Record<string, unknown>;
    const choice = configuredLLMChoice(config);
    const defaultModelLabel = choice.label || null;
    return Response.json({ defaultModelLabel, models: [], configured: ["CONFIGURED", "MOCK"].includes(status.status) });
  } catch (error) { return assistantApiError(error); }
}
