import { z } from "zod";
import { creationOptionsSchema, editScopeSchema } from "@/lib/contracts/creation";
import { saveCreatorWritingPreference } from "@/server/creator-profile-service";
import { researchSelectionSchema } from "@/server/research/contracts";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { assistantApiError } from "@/server/assistant/api";
import { getProjectAssistantThread, runProjectAssistant, type AssistantStreamEvent } from "@/server/assistant/service";

import { projectSkillVersionIdsSchema } from "@/lib/contracts/creation";

const requestSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  selectedObject: z.object({ objectType: z.literal("CANVAS_OBJECT"), objectId: z.string().min(1).max(200), version: z.number().int().positive().optional(), ownership: z.enum(["OWN_CONFIRMED", "EXTERNAL", "PENDING", "HYPOTHETICAL", "PROHIBITED", "METHOD_GUIDANCE"]).optional(), whySelected: z.string().max(200).optional() }).strict().optional(),
  sourceItemIds: z.array(z.string().min(1).max(200)).max(8).transform((ids) => [...new Set(ids)]).optional(),
  retryUserMessageId: z.string().min(1).max(200).optional(),
  targetArtifactId: z.string().min(1).max(200).optional(),
  creationOptions: creationOptionsSchema.optional(),
  editScope: editScopeSchema.optional(),
  references: z.array(z.object({ sourceType: z.enum(["MATERIAL", "RESEARCH", "ARTIFACT", "BENCHMARK", "TREND", "KNOWLEDGE"]), sourceId: z.string().min(1).max(200), scope: z.enum(["TURN", "TASK", "PROJECT"]).optional(), sourceVersion: z.union([z.string().min(1).max(200), z.number().int().nonnegative()]).optional(), researchSelection: researchSelectionSchema.optional() }).strict().refine(value => !value.researchSelection || value.sourceType === "RESEARCH")).max(8).optional(),
  skillVersionIds: projectSkillVersionIdsSchema.optional(),
  skillVersionId: z.string().min(1).max(200).nullable().optional(),
  modelSelection: z.object({ provider: z.enum(["KIMI", "DEEPSEEK", "CUSTOM"]), modelId: z.string().min(1).max(200) }).strict().nullable().optional(),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("PERMISSION_DENIED", 403);
  const parsed = z.object({ persona: z.string().trim().max(160), style: z.string().trim().max(1000) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  try {
    const { id } = await route.params;
    await getProjectAssistantThread({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id });
    return Response.json(await saveCreatorWritingPreference({ workspaceId: context.workspace.id, userId: context.session.user.id, ...parsed.data }));
  } catch (error) { return assistantApiError(error); }
}

export async function GET(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  const parsed = z.string().min(1).max(200).optional().safeParse(new URL(request.url).searchParams.get("before") ?? undefined);
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  try { return Response.json(await getProjectAssistantThread({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, beforeMessageId: parsed.data })); }
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
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const signal = AbortSignal.any([aborter.signal, AbortSignal.timeout(5 * 60_000)]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AssistantStreamEvent) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); };
      controller.enqueue(encoder.encode(": connected\n\n"));
      heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n")); }, 15_000);
      heartbeat.unref();
      void runProjectAssistant({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data, signal }, emit)
        .catch(async (error) => { const response = assistantApiError(error); const failure = await response.json(); emit({ type: "error", messageId: "", code: failure.error || "UNKNOWN", message: failure.message || (response.status === 404 ? "当前项目不存在。" : "AI 处理失败，请稍后重试。") }); })
        .finally(() => { clearInterval(heartbeat); if (!closed) { closed = true; controller.close(); } });
    },
    cancel() { closed = true; clearInterval(heartbeat); aborter.abort(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
