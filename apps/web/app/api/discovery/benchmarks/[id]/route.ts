import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { disableBenchmark, getBenchmarkWorks } from "@/server/discovery/service";

export async function GET(request: Request, { params }: RouteContext<"/api/discovery/benchmarks/[id]">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法刷新外部账号数据。");
  try {
    const { id } = await params;
    const sort = new URL(request.url).searchParams.get("sort") === "POPULAR" ? "POPULAR" : "LATEST";
    const rawOffset = new URL(request.url).searchParams.get("offset");
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    if (!Number.isSafeInteger(offset) || offset < 0) return apiError("INVALID_OFFSET", 400);
    return NextResponse.json(await getBenchmarkWorks({ workspaceId: context.workspace.id, userId: context.session.user.id, benchmarkId: id, sort, offset }));
  } catch (error) {
    return discoveryApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/discovery/benchmarks/[id]">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role !== "OWNER" && context.role !== "ADMIN") return apiError("FORBIDDEN", 403);
  try {
    const { id } = await params;
    await disableBenchmark({ workspaceId: context.workspace.id, userId: context.session.user.id, benchmarkId: id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return discoveryApiError(error);
  }
}
