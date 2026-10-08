import { z } from "zod";
import { NextResponse } from "next/server";
import { getApiWorkspaceContext, apiError } from "@/server/api-access";
import { collectF2Comments } from "@/server/discovery/f2-collector";
import { ResearchAccessError } from "@/server/discovery/research-library";
const schema = z.object({ snapshotId: z.string().min(1).max(200), offset: z.number().int().nonnegative().default(0) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("INVALID_INPUT", 400);
  try { return NextResponse.json(await collectF2Comments({ workspaceId: context.workspace.id, userId: context.session.user.id, accountId: (await params).id, ...parsed.data })); }
  catch (error) {
    if (error instanceof Error && error.message === "LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED") return apiError("LOCAL_REVIEW_OFFLINE", 409, "验收环境已关闭外部采集。");
    if (error instanceof ResearchAccessError) return apiError(error.status === 404 ? "NOT_FOUND" : "FORBIDDEN", error.status);
    return apiError("COLLECTOR_UNAVAILABLE", 503, "采集器未就绪或平台拒绝请求。请检查本机 F2 环境与主动配置的授权登录态；不会绕过验证。也可导入原始 JSON。");
  }
}
