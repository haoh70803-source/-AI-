import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { assistantApiError } from "@/server/assistant/api";
import { saveAssistantMessageResult } from "@/server/assistant/service";

const schema = z.object({ action: z.enum(["TEXT", "TOPIC", "DRAFT"]), topicIndex: z.number().int().min(0).max(7).optional() }).strict();
type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请选择要保存的内容类型。");
  const { id, messageId } = await route.params;
  try { return Response.json(await saveAssistantMessageResult({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, messageId, action: parsed.data.action, topicIndex: parsed.data.topicIndex }), { status: 201 }); }
  catch (error) { return assistantApiError(error); }
}
