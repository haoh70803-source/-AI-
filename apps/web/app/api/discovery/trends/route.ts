import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { trendApiError } from "@/server/discovery/trends/api";
import { listTrendOpportunities, publicTrendOpportunity } from "@/server/discovery/trends/read-model";
import { refreshTrendsSchema, trendQuerySchema } from "@/server/discovery/trends/schemas";
import { refreshTrends, SUPPORTED_TREND_FILTERS } from "@/server/discovery/trends/service";

export async function GET(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  try {
    const url = new URL(request.url);
    const query = trendQuerySchema.parse({ window: url.searchParams.get("window") ?? undefined, platform: url.searchParams.get("platform") ?? undefined, type: url.searchParams.get("type") ?? undefined });
    const items = await listTrendOpportunities({ workspaceId: context.workspace.id, ...query });
    return NextResponse.json({ items: items.map(publicTrendOpportunity), supportedFilters: SUPPORTED_TREND_FILTERS });
  } catch (error) { return trendApiError(error); }
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法主动刷新付费趋势数据。");
  try {
    const input = refreshTrendsSchema.parse(await request.json().catch(() => null));
    const result = await refreshTrends({ workspaceId: context.workspace.id, userId: context.session.user.id, ...input });
    return NextResponse.json({ ...result, items: result.items.map(publicTrendOpportunity), supportedFilters: SUPPORTED_TREND_FILTERS });
  } catch (error) { return trendApiError(error); }
}
