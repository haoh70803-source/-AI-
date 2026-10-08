import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { assistantApiError } from "@/server/assistant/api";
import { getNodeAssistantThread, runNodeAssistant, type NodeAssistantStreamEvent } from "@/server/assistant/service";

const schema = z.object({ instruction: z.string().trim().min(1).max(4_000), additionalObjectIds: z.array(z.string().min(1).max(200)).max(5).transform((ids) => [...new Set(ids)]).optional(), sourceItemIds: z.array(z.string().min(1).max(200)).max(8).transform((ids) => [...new Set(ids)]).optional() }).strict();
type RouteContext = { params: Promise<{ id: string; objectId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  const { id, objectId } = await route.params;
  try { return Response.json(await getNodeAssistantThread({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, objectId })); }
  catch (error) { return assistantApiError(error); }
}

export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("INVALID_INPUT", 400, "请输入节点生成要求。");
  const { id, objectId } = await route.params; const encoder = new TextEncoder(); const aborter = new AbortController(); let closed = false;
  request.signal.addEventListener("abort", () => aborter.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({ start(controller) { const emit = (event: NodeAssistantStreamEvent) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }; void runNodeAssistant({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, sourceObjectId: objectId, ...parsed.data, signal: aborter.signal }, emit).catch(() => emit({ type: "error", messageId: "", code: "UNKNOWN", message: "AI 生成失败，请稍后重试。" })).finally(() => { if (!closed) { closed = true; controller.close(); } }); }, cancel() { closed = true; aborter.abort(); } });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
