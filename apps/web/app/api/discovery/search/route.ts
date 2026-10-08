import { NextResponse } from "next/server";
import { resolveDiscoveryQuery } from "@content-center/core";
import { getApiWorkspaceContext, apiError } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { searchDiscoverySchema } from "@/server/discovery/schemas";
import { getDiscoveryAccountDetail, getDiscoveryContentDetail, searchDiscoveryAccounts, searchDiscoveryContent } from "@/server/discovery/service";

function accountIdFromUrl(value: string, platform: "DOUYIN" | "XIAOHONGSHU") {
  const parts = new URL(value).pathname.split("/").filter(Boolean);
  return platform === "DOUYIN" ? parts.at(-1) : parts.at(-1);
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法发起外部内容查询。");
  try {
    const input = searchDiscoverySchema.parse(await request.json().catch(() => null));
    const common = { workspaceId: context.workspace.id, userId: context.session.user.id, query: input.query, platform: input.platform };
    if (input.kind === "ACCOUNT") {
      return NextResponse.json({ ...(await searchDiscoveryAccounts(common)), resultType: "ACCOUNT" });
    }
    const resolved = resolveDiscoveryQuery(input.query);
    if (input.kind === "AUTO" && resolved.type === "CONTENT_URL") {
      if (!resolved.platform) return NextResponse.json({ error: "UNSUPPORTED_PLATFORM", message: "当前暂不支持该平台的内容发现。" }, { status: 400 });
      return NextResponse.json({ ...(await getDiscoveryContentDetail({ workspaceId: common.workspaceId, userId: common.userId, url: resolved.value, platform: resolved.platform })), resultType: "CONTENT" });
    }
    if (input.kind === "AUTO" && resolved.type === "ACCOUNT_URL") {
      if (!resolved.platform) return NextResponse.json({ error: "UNSUPPORTED_PLATFORM", message: "当前暂不支持该平台的账号发现。" }, { status: 400 });
      const accountId = accountIdFromUrl(resolved.value, resolved.platform);
      if (!accountId) return NextResponse.json({ error: "INVALID_ACCOUNT_URL", message: "无法识别该账号链接。" }, { status: 400 });
      return NextResponse.json({ ...(await getDiscoveryAccountDetail({ workspaceId: common.workspaceId, userId: common.userId, accountId, userIdHint: resolved.platform === "XIAOHONGSHU" ? accountId : undefined, platform: resolved.platform })), resultType: "ACCOUNT" });
    }
    return NextResponse.json({ ...(await searchDiscoveryContent({ ...common, sort: input.sort })), resultType: "CONTENT" });
  } catch (error) {
    return discoveryApiError(error);
  }
}
