import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { BenchmarkTopicError, selectBenchmarkTopic } from "@/server/benchmark-topics/service";

const schema = z.object({ topicIndex: z.number().int().min(0).max(7) }).strict();

export async function POST(request: Request, route: { params: Promise<{ runId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { runId } = await route.params;
  try {
    const selected = await selectBenchmarkTopic({ workspaceId: context.workspace.id, userId: context.session.user.id, runId, topicIndex: parsed.data.topicIndex });
    return NextResponse.json({ projectId: selected.projectId, studioPath: selected.studioPath });
  } catch (error) {
    if (error instanceof BenchmarkTopicError) return apiError(error.code, error.code === "TOPIC_NOT_FOUND" || error.code === "TOPICS_NOT_FOUND" ? 404 : 409, error.message);
    return apiError("TOPIC_SELECTION_FAILED", 500, "暂时无法进入创作。");
  }
}
