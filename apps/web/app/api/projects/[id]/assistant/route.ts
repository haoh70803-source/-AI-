import { z } from "zod";
import { researchSelectionSchema } from "@/server/research/contracts";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { assistantApiError } from "@/server/assistant/api";
import { getProjectAssistantThread, runProjectAssistant, type AssistantStreamEvent } from "@/server/assistant/service";

const requestSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  selectedObject: z.object({ objectType: z.literal("CANVAS_OBJECT"), objectId: z.string().min(1).max(200), version: z.number().int().positive().optional(), ownership: z.enum(["OWN_CONFIRMED", "EXTERNAL", "PENDING", "HYPOTHETICAL", "PROHIBITED", "METHOD_GUIDANCE"]).optional(), whySelected: z.string().max(200).optional() }).strict().optional(),
  sourceItemIds: z.array(z.string().min(1).max(200)).max(8).transform((ids) => [...new Set(ids)]).optional(),
  retryUserMessageId: z.string().min(1).max(200).optional(),
  targetArtifactId: z.string().min(1).max(200).optional(),
  references: z.array(z.object({ sourceType: z.enum(["MATERIAL", "RESEARCH", "ARTIFACT", "BENCHMARK", "TREND", "KNOWLEDGE"]), sourceId: z.string().min(1).max(200), researchSelection: researchSelectionSchema.optional() }).strict().refine(value => !value.researchSelection || value.sourceType === "RESEARCH")).max(8).optional(),
  skillVersionId: z.string().min(1).max(200).nullable().optional(),
  modelSelection: z.object({ provider: z.enum(["KIMI", "DEEPSEEK", "CUSTOM"]), modelId: z.string().min(1).max(200) }).strict().nullable().optional(),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return Response.json(await getProjectAssistantThread({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id })); }
  catch (error) { return assistantApiError(error); }
}

export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请输入要和鑫小助讨论的内容。");
  const { id } = await route.params;
  try {
    const thread = await getProjectAssistantThread({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id });
    if (thread.unavailableReason) return apiError("PERMISSION_DENIED", 403, thread.unavailableReason);
  } catch (error) { return assistantApiError(error); }
  const encoder = new TextEncoder();
  const aborter = new AbortController();
  request.signal.addEventListener("abort", () => aborter.abort(), { once: true });
  if (request.signal.aborted) aborter.abort();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AssistantStreamEvent) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); };
      void runProjectAssistant({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data, signal: aborter.signal }, emit)
        .catch(async (error) => { const response = assistantApiError(error); const denied = response.status === 403 ? await response.json() : null; emit({ type: "error", messageId: "", code: denied ? "PERMISSION_DENIED" : "UNKNOWN", message: denied?.message || (response.status === 404 ? "当前项目不存在。" : "AI 处理失败，请稍后重试。") }); })
        .finally(() => { if (!closed) { closed = true; controller.close(); } });
    },
    cancel() { closed = true; aborter.abort(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
