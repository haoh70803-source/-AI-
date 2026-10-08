import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { searchDiscoveryContent } from "@/server/discovery/service";
import { trendApiError } from "@/server/discovery/trends/api";
import { decodeTrendOpportunityKey, getTrendOpportunity } from "@/server/discovery/trends/read-model";
import { TrendServiceError } from "@/server/discovery/trends/service";

export async function POST(_request: Request, contextValue: RouteContext<"/api/discovery/trends/[key]/related">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法发起外部内容查询。");
  try {
    const { key: encodedKey } = await contextValue.params;
    const key = decodeTrendOpportunityKey(encodedKey);
    const opportunity = await getTrendOpportunity(context.workspace.id, key);
    if (!opportunity) throw new TrendServiceError("TREND_NOT_FOUND", "该趋势已过期或不存在。");
    const platform = opportunity.platform === "DOUYIN" || opportunity.platform === "XIAOHONGSHU" ? opportunity.platform : "ALL";
    const result = await searchDiscoveryContent({ workspaceId: context.workspace.id, userId: context.session.user.id, query: opportunity.keyword || opportunity.title, platform, sort: "POPULAR" });
    return NextResponse.json(result);
  } catch (error) { return trendApiError(error); }
}
