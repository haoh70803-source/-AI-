import { NextResponse } from "next/server";
import { getAdminUsage, type UsageRange } from "@/server/admin/usage";
import { apiError, getSystemAdminApiContext } from "@/server/api-access";

const ranges = new Set<UsageRange>(["today", "7d", "month"]);

export async function GET(request: Request) {
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "7d";
  if (!ranges.has(range as UsageRange)) return apiError("INVALID_USAGE_RANGE", 400);
  return NextResponse.json({ range, users: await getAdminUsage(range as UsageRange, url.searchParams.get("userId") ?? undefined) });
}
