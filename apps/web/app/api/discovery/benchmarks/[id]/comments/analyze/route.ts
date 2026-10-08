import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { ResearchAccessError } from "@/server/discovery/research-library";
import { analyzeBenchmarkComments } from "@/server/discovery/comment-analysis";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  const body = await request.json().catch(() => ({})) as { collectionRunId?: unknown };
  if (body.collectionRunId !== undefined && typeof body.collectionRunId !== "string") return apiError("INVALID_RUN", 400, "采集批次无效。");
  try { return NextResponse.json(await analyzeBenchmarkComments({ workspaceId: context.workspace.id, userId: context.session.user.id, accountId: (await params).id, collectionRunId: body.collectionRunId as string | undefined })); }
  catch (error) {
    if (error instanceof ResearchAccessError) return apiError(error.status === 404 ? "NOT_FOUND" : "FORBIDDEN", error.status);
    return apiError("COMMENT_ANALYSIS_FAILED", 409, "评论分析未能完成。请确认至少有 5 条评论、模型配置可用，且没有重复发起任务；之前的成功报告仍保留。");
  }
}
