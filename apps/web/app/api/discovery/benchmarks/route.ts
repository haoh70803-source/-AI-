import { canAddResearchAccount } from "@/server/experience-account";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { addBenchmarkSchema } from "@/server/discovery/schemas";
import { addBenchmark, listBenchmarks } from "@/server/discovery/service";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  return NextResponse.json({ items: await listBenchmarks(context.workspace.id) });
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!canAddResearchAccount(context.role, context.session.user)) return apiError("FORBIDDEN", 403, "当前账号没有添加对标账号的权限。");
  try {
    const input = addBenchmarkSchema.parse(await request.json().catch(() => null));
    const item = await addBenchmark({ workspaceId: context.workspace.id, userId: context.session.user.id, account: input.account, purpose: input.purpose });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return discoveryApiError(error);
  }
}
