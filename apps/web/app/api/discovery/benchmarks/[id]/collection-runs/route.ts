import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { createBenchmarkCollectionRun, listBenchmarkCollectionRuns, BenchmarkCollectionError } from "@/server/discovery/benchmark-collection-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await params;
  return NextResponse.json({ items: await listBenchmarkCollectionRuns({ workspaceId: context.workspace.id, benchmarkAccountId: id }) });
}

export async function POST(request: Request, { params }: Params) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法发起账号采集。");
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return apiError("INVALID_BODY", 400, "请求内容无效。");
    const body = value as Record<string, unknown>;
    if (body.preset !== undefined && !["30", "90", "180", "CUSTOM"].includes(String(body.preset))) return apiError("INVALID_RANGE", 400, "时间范围选项无效。");
    if (body.startDate !== undefined && typeof body.startDate !== "string") return apiError("INVALID_RANGE", 400, "开始日期无效。");
    if (body.endDate !== undefined && typeof body.endDate !== "string") return apiError("INVALID_RANGE", 400, "结束日期无效。");
    const { id } = await params;
    const result = await createBenchmarkCollectionRun({
      workspaceId: context.workspace.id,
      benchmarkAccountId: id,
      requestedById: context.session.user.id,
      range: { preset: body.preset as "30" | "90" | "180" | "CUSTOM" | undefined, startDate: body.startDate as string | undefined, endDate: body.endDate as string | undefined },
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof BenchmarkCollectionError) {
      const status = error.code === "BENCHMARK_NOT_FOUND" ? 404 : error.code === "COLLECTION_RANGE_INVALID" ? 400 : error.code === "COLLECTION_ALREADY_RUNNING" ? 409 : 503;
      return apiError(error.code, status, error.message);
    }
    return apiError("COLLECTION_START_FAILED", 500, "无法启动采集，请稍后重试。");
  }
}
