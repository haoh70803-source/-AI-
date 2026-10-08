import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { BenchmarkTopicError, generateBenchmarkTopics } from "@/server/benchmark-topics/service";
import { benchmarkTopicInputSchema } from "@/server/benchmark-topics/schemas";

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = benchmarkTopicInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  try {
    const result = await generateBenchmarkTopics({ workspaceId: context.workspace.id, userId: context.session.user.id, source: parsed.data });
    return NextResponse.json({ runId: result.id, projectId: result.projectId, summary: result.output.summary, topics: result.output.topics.map(({ title, angle, why, ourTake, evidenceHint, evidenceStatus }) => ({ title, angle, why, ourTake, evidenceHint, evidenceStatus })) });
  } catch (error) {
    if (error instanceof BenchmarkTopicError) return apiError(error.code, error.code === "SOURCE_NOT_FOUND" ? 404 : 409, error.message);
    return apiError(error instanceof Error && "code" in error ? String(error.code) : "TOPIC_GENERATION_FAILED", 502, error instanceof Error ? error.message : "暂时无法生成选题。");
  }
}
