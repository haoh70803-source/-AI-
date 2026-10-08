import { searchDiscoveryContent } from "@/server/discovery/service";
import { DiscoveryServiceError } from "@/server/discovery/service";
import { discoveryApiError } from "@/server/discovery/api";
import { RedFoxError } from "@content-center/providers";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { researchMember } from "@/server/research/access";
import { researchTrendDetail } from "@/server/research/trends";

export async function POST(_request: Request, { params }: { params: Promise<{ stableKey: string }> }) {
  try {
    const actor = await researchApiActor();
    await researchMember(actor, true);
    const { stableKey } = await params;
    const trend = await researchTrendDetail(actor, stableKey);
    const result = await searchDiscoveryContent({ ...actor, query: (trend.keyword || trend.title).slice(0, 300), platform: trend.platform === "DOUYIN" || trend.platform === "XIAOHONGSHU" ? trend.platform : "ALL", sort: "RECOMMENDED" });
    return Response.json({ items: result.items.slice(0, 12).map(item => ({ id: item.externalId, title: item.title || item.description || "未命名作品", authorName: item.authorName, platform: item.platform, publishedAt: item.publishedAt, originalUrl: /^https:\/\//i.test(item.originalUrl) ? item.originalUrl : null, sourceItemId: item.sourceItemId })), cached: result.cached, capturedAt: new Date().toISOString(), evidence: "按关键词主动检索的候选相关作品，尚未验证与趋势存在因果或代表性关系。" });
  } catch (error) { return error instanceof DiscoveryServiceError || error instanceof RedFoxError ? discoveryApiError(error) : researchApiError(error); }
}
